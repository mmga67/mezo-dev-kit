import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const WORKSPACE_AREAS = ["packages", "extensions", "templates", "examples"] as const;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
  "devDependencies",
] as const;
const RUNTIME_DEPENDENCY_FIELDS = [
  "dependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type DependencyField = (typeof DEPENDENCY_FIELDS)[number];

interface PackageManifest {
  readonly name: string;
  readonly exports: unknown;
  readonly dependencies: Readonly<Record<DependencyField, ReadonlySet<string>>>;
}

interface WorkspacePackage {
  readonly directory: string;
  readonly manifestPath: string;
  readonly manifest: PackageManifest;
  readonly sourceFiles: readonly string[];
}

export interface BoundaryDiagnostic {
  readonly code:
    | "cross-package-relative-import"
    | "dependency-cycle"
    | "invalid-package-manifest"
    | "missing-export-map"
    | "undeclared-workspace-dependency"
    | "undeclared-workspace-entrypoint";
  readonly file: string;
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDependencyNames(
  manifest: Record<string, unknown>,
  field: DependencyField,
): ReadonlySet<string> {
  const value = manifest[field];
  return new Set(isRecord(value) ? Object.keys(value) : []);
}

function parseManifest(text: string, manifestPath: string): PackageManifest {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || typeof parsed.name !== "string" || parsed.name.length === 0) {
    throw new Error(`Package manifest ${manifestPath} must declare a non-empty string name.`);
  }

  return {
    name: parsed.name,
    exports: parsed.exports,
    dependencies: {
      dependencies: readDependencyNames(parsed, "dependencies"),
      peerDependencies: readDependencyNames(parsed, "peerDependencies"),
      optionalDependencies: readDependencyNames(parsed, "optionalDependencies"),
      devDependencies: readDependencyNames(parsed, "devDependencies"),
    },
  };
}

async function collectFiles(directory: string, fileName?: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: unknown): readonly [] => {
      if (isRecord(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    },
  );
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, fileName)));
    } else if (fileName === undefined || entry.name === fileName) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function loadWorkspacePackages(rootDirectory: string): Promise<readonly WorkspacePackage[]> {
  const manifestPaths = (
    await Promise.all(
      WORKSPACE_AREAS.map((area) => collectFiles(path.join(rootDirectory, area), "package.json")),
    )
  )
    .flat()
    .sort();

  return Promise.all(
    manifestPaths.map(async (manifestPath): Promise<WorkspacePackage> => {
      const directory = path.dirname(manifestPath);
      const manifest = parseManifest(await readFile(manifestPath, "utf8"), manifestPath);
      const sourceFiles = (await collectFiles(directory)).filter((file) =>
        SOURCE_EXTENSIONS.has(path.extname(file)),
      );
      return { directory, manifestPath, manifest, sourceFiles };
    }),
  );
}

function packageForPath(
  packages: readonly WorkspacePackage[],
  targetPath: string,
): WorkspacePackage | undefined {
  const normalizedTarget = path.resolve(targetPath);
  return packages.find((candidate) => {
    const relative = path.relative(candidate.directory, normalizedTarget);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

function workspacePackageForSpecifier(
  packages: readonly WorkspacePackage[],
  specifier: string,
): WorkspacePackage | undefined {
  return [...packages]
    .sort((left, right) => right.manifest.name.length - left.manifest.name.length)
    .find(
      (candidate) =>
        specifier === candidate.manifest.name ||
        specifier.startsWith(`${candidate.manifest.name}/`),
    );
}

function declaredExportSubpaths(exportsField: unknown): ReadonlySet<string> {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return new Set(["."]);
  }
  if (!isRecord(exportsField)) {
    return new Set();
  }

  const keys = Object.keys(exportsField);
  const subpaths = keys.filter((key) => key === "." || key.startsWith("./"));
  return new Set(subpaths.length === 0 ? ["."] : subpaths);
}

function requestedSubpath(packageName: string, specifier: string): string {
  if (specifier === packageName) {
    return ".";
  }
  return `.${specifier.slice(packageName.length)}`;
}

function moduleSpecifiers(sourceFile: ts.SourceFile): readonly string[] {
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (
        node.arguments.length === 1 &&
        argument !== undefined &&
        ts.isStringLiteralLike(argument)
      ) {
        specifiers.push(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function hasDeclaredDependency(
  consumer: WorkspacePackage,
  providerName: string,
  productionSource: boolean,
): boolean {
  const fields = productionSource ? RUNTIME_DEPENDENCY_FIELDS : DEPENDENCY_FIELDS;
  return fields.some((field) => consumer.manifest.dependencies[field].has(providerName));
}

function inspectImports(
  packages: readonly WorkspacePackage[],
  consumer: WorkspacePackage,
): readonly BoundaryDiagnostic[] {
  const diagnostics: BoundaryDiagnostic[] = [];

  for (const file of consumer.sourceFiles) {
    const source = ts.createSourceFile(
      file,
      // The workspace has already bounded file discovery; a failed read is a
      // hard validation failure and should not become an empty source file.
      ts.sys.readFile(file) ?? "",
      ts.ScriptTarget.Latest,
      true,
    );
    const productionSource = path.relative(consumer.directory, file).startsWith(`src${path.sep}`);

    for (const specifier of moduleSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        const provider = packageForPath(packages, path.resolve(path.dirname(file), specifier));
        if (provider !== undefined && provider.manifest.name !== consumer.manifest.name) {
          diagnostics.push({
            code: "cross-package-relative-import",
            file,
            message: `${consumer.manifest.name} crosses into ${provider.manifest.name} with relative import ${specifier}.`,
          });
        }
        continue;
      }

      const provider = workspacePackageForSpecifier(packages, specifier);
      if (provider === undefined || provider.manifest.name === consumer.manifest.name) {
        continue;
      }

      if (!hasDeclaredDependency(consumer, provider.manifest.name, productionSource)) {
        diagnostics.push({
          code: "undeclared-workspace-dependency",
          file,
          message: `${consumer.manifest.name} imports ${provider.manifest.name} without an applicable dependency declaration.`,
        });
      }

      const subpath = requestedSubpath(provider.manifest.name, specifier);
      if (!declaredExportSubpaths(provider.manifest.exports).has(subpath)) {
        diagnostics.push({
          code: "undeclared-workspace-entrypoint",
          file,
          message: `${specifier} is not a declared export of ${provider.manifest.name}.`,
        });
      }
    }
  }

  return diagnostics;
}

function dependencyCycleDiagnostics(
  packages: readonly WorkspacePackage[],
): readonly BoundaryDiagnostic[] {
  const byName = new Map(
    packages.map((workspacePackage) => [workspacePackage.manifest.name, workspacePackage]),
  );
  const visited = new Set<string>();
  const active = new Set<string>();
  const pathStack: string[] = [];
  const reported = new Set<string>();
  const diagnostics: BoundaryDiagnostic[] = [];

  function visit(packageName: string): void {
    if (active.has(packageName)) {
      const cycleStart = pathStack.indexOf(packageName);
      const cycle = [...pathStack.slice(cycleStart), packageName];
      const cycleKey = [...new Set(cycle)].sort().join("|");
      if (!reported.has(cycleKey)) {
        reported.add(cycleKey);
        const owner = byName.get(packageName);
        if (owner !== undefined) {
          diagnostics.push({
            code: "dependency-cycle",
            file: owner.manifestPath,
            message: `Workspace dependency cycle: ${cycle.join(" -> ")}.`,
          });
        }
      }
      return;
    }
    if (visited.has(packageName)) {
      return;
    }

    visited.add(packageName);
    active.add(packageName);
    pathStack.push(packageName);
    const workspacePackage = byName.get(packageName);
    if (workspacePackage !== undefined) {
      for (const field of DEPENDENCY_FIELDS) {
        for (const dependency of workspacePackage.manifest.dependencies[field]) {
          if (byName.has(dependency)) {
            visit(dependency);
          }
        }
      }
    }
    pathStack.pop();
    active.delete(packageName);
  }

  for (const packageName of [...byName.keys()].sort()) {
    visit(packageName);
  }

  return diagnostics;
}

export async function validateWorkspaceBoundaries(
  rootDirectory: string,
): Promise<readonly BoundaryDiagnostic[]> {
  let packages: readonly WorkspacePackage[];
  try {
    packages = await loadWorkspacePackages(rootDirectory);
  } catch (error) {
    return [
      {
        code: "invalid-package-manifest",
        file: rootDirectory,
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }

  const diagnostics: BoundaryDiagnostic[] = [];
  for (const workspacePackage of packages) {
    if (declaredExportSubpaths(workspacePackage.manifest.exports).size === 0) {
      diagnostics.push({
        code: "missing-export-map",
        file: workspacePackage.manifestPath,
        message: `${workspacePackage.manifest.name} must declare an explicit package export map.`,
      });
    }
    diagnostics.push(...inspectImports(packages, workspacePackage));
  }
  diagnostics.push(...dependencyCycleDiagnostics(packages));

  return diagnostics.sort((left, right) =>
    `${left.file}:${left.code}:${left.message}`.localeCompare(
      `${right.file}:${right.code}:${right.message}`,
    ),
  );
}

async function main(): Promise<void> {
  const rootDirectory = path.resolve(process.cwd());
  const diagnostics = await validateWorkspaceBoundaries(rootDirectory);
  if (diagnostics.length === 0) {
    process.stdout.write("Package boundary validation passed.\n");
    return;
  }

  for (const diagnostic of diagnostics) {
    process.stderr.write(
      `${path.relative(rootDirectory, diagnostic.file)} [${diagnostic.code}] ${diagnostic.message}\n`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
