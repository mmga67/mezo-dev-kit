import { lstat, mkdir, mkdtemp, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { digest, jsonText, parseArtifactSet, record, textValue } from "./contracts.ts";
import { CliError, isMissing } from "./errors.ts";
import { containedPath, parseJson, readRequired } from "./filesystem.ts";
import { loadBundle, verifyResource } from "./references.ts";

/** Create source and local dependency artifacts; installation remains an explicit pnpm step. */
export async function createProject(
  target: string,
  sourceRoot: string,
  manifestPath: string,
  dryRun = false,
): Promise<{
  readonly project: string;
  readonly files: readonly string[];
  readonly next: readonly string[];
  readonly dryRun: boolean;
}> {
  const parent = dirname(target);
  await containedPath(parent, basename(target));
  const existing = await lstat(target).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (existing && (!existing.isDirectory() || (await readdir(target)).length))
    throw new CliError("Conflict", "Create requires a new or empty directory");
  const bundle = await loadBundle(sourceRoot);
  const artifacts = parseArtifactSet(
    parseJson(await readRequired(dirname(manifestPath), basename(manifestPath)), "artifact set"),
  );
  if (artifacts.bundleId !== bundle.id)
    throw new CliError("Incompatible", "Starter and artifact bundle identities differ");
  for (const item of bundle.packages)
    if (
      !artifacts.packages.some(
        (artifact) => artifact.name === item.name && artifact.version === item.version,
      )
    )
      throw new CliError("Incompatible", `Missing matching artifact: ${item.name}`);
  const files = new Map<string, Buffer>();
  for (const item of bundle.starter) {
    const bytes = await readRequired(sourceRoot, `starter/${item.path}`);
    verifyResource(bytes, item);
    files.set(item.path, bytes);
  }
  const template = files.get("package.template.json");
  if (!template) throw new CliError("Unavailable", "This bundle has no TypeScript starter");
  const manifest = record(parseJson(template, "starter manifest"), "starter manifest");
  const pinBytes = files.get("dependency-pins.json");
  if (!pinBytes) throw new CliError("Unavailable", "Starter dependency resolution is missing");
  const overrides: Record<string, string> = Object.fromEntries(
    Object.entries(record(parseJson(pinBytes, "dependency pins"), "dependency pins")).map(
      ([key, value]) => [key, textValue(value, "pinned version")],
    ),
  );
  files.delete("dependency-pins.json");
  for (const item of artifacts.packages) {
    const bytes = await readRequired(dirname(manifestPath), item.path);
    verifyResource(bytes, item);
    const path = `.mdk/artifacts/${digest(item.name)}.tgz`;
    files.set(path, bytes);
    overrides[item.name] = `file:./${path}`;
  }
  files.set(
    ".mdk/artifacts/manifest.json",
    Buffer.from(
      jsonText({
        ...artifacts,
        packages: artifacts.packages.map((item) => ({ ...item, path: `${digest(item.name)}.tgz` })),
      }),
    ),
  );
  for (const field of ["dependencies", "devDependencies"]) {
    const dependencies = record(manifest[field], field);
    for (const name of Object.keys(dependencies))
      if (name.startsWith("@mezo-dev-kit/")) {
        const specifier = overrides[name];
        if (!specifier) throw new CliError("Incompatible", `Missing starter dependency: ${name}`);
        dependencies[name] = specifier;
      }
  }
  files.delete("package.template.json");
  const ignore = files.get("gitignore.template");
  if (!ignore) throw new CliError("Unavailable", "Starter ignore template is missing");
  files.delete("gitignore.template");
  files.set(".gitignore", ignore);
  files.set("package.json", Buffer.from(jsonText(manifest)));
  // pnpm 11 reads dependency overrides from the project workspace settings.
  files.set(
    "pnpm-workspace.yaml",
    Buffer.from(
      `overrides:\n${Object.entries(overrides)
        .map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`)
        .join("\n")}\n`,
    ),
  );
  const instructions = await readRequired(sourceRoot, bundle.template.path);
  verifyResource(instructions, bundle.template);
  files.set("AGENTS.md", instructions);
  if (!dryRun) {
    const stage = await mkdtemp(join(parent, ".mdk-create-"));
    try {
      for (const [path, bytes] of files) {
        const output = await containedPath(stage, path);
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, bytes, { flag: "wx" });
      }
      await containedPath(parent, basename(target));
      if (existing) {
        const now = await lstat(target);
        if (now.ino !== existing.ino || now.dev !== existing.dev || (await readdir(target)).length)
          throw new CliError("Conflict", "Target changed during creation");
        await rmdir(target);
      } else if (
        await lstat(target).then(
          () => true,
          (error: unknown) => {
            if (isMissing(error)) return false;
            throw error;
          },
        )
      )
        throw new CliError("Conflict", "Target appeared during creation");
      await rename(stage, target);
    } finally {
      await rm(stage, { recursive: true, force: true });
    }
  }
  return {
    project: target,
    files: [...files.keys()].sort(),
    next: ["pnpm install", "pnpm mdk init --set base", "pnpm start", "pnpm check"],
    dryRun,
  };
}
