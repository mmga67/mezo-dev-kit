import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(resolve(tmpdir(), "mdk-sdk-reference-"));
let symbols = 0;
const snippets: string[] = [];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected object");
  return value as Record<string, unknown>;
}
async function packages(directory: string): Promise<string[]> {
  if (existsSync(resolve(directory, "package.json"))) return [directory];
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== "dist")
      found.push(...(await packages(resolve(directory, entry.name))));
  }
  return found;
}
try {
  const directories = await packages(resolve(root, "packages"));
  for (const directory of directories) {
    const manifest = object(JSON.parse(await readFile(resolve(directory, "package.json"), "utf8")));
    if (typeof manifest.name !== "string" || !/^@mezo-dev-kit\/[a-z0-9-]+$/.test(manifest.name))
      throw new Error("unexpected package identity");
    const link = resolve(scratch, "node_modules", manifest.name);
    await mkdir(dirname(link), { recursive: true });
    await symlink(directory, link, "dir");
    const path = resolve(directory, "REFERENCE.md");
    const reference = await readFile(path, "utf8");
    const entryPath = resolve(directory, "src/index.ts");
    const entry = ts.createSourceFile(
      entryPath,
      await readFile(entryPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of entry.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause)
      )
        continue;
      for (const element of statement.exportClause.elements) {
        assert(
          reference.includes(element.name.text),
          `${manifest.name}: missing reference for ${element.name.text}`,
        );
        symbols++;
      }
    }
    let count = 0;
    for (const block of reference.matchAll(/```ts\n([\s\S]*?)```/g)) {
      assert(block[1]);
      const file = resolve(
        scratch,
        `${manifest.name.slice("@mezo-dev-kit/".length)}-${++count}.mts`,
      );
      await writeFile(file, block[1]);
      snippets.push(file);
    }
    for (const match of reference
      .replace(/```[\s\S]*?```/g, "")
      .matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
      const target = match[1];
      assert(target);
      if (/^[a-z]+:/.test(target) || target.startsWith("#")) continue;
      const [file] = target.split("#");
      assert(file);
      assert(existsSync(resolve(directory, file)), `${path}: missing link ${target}`);
    }
  }
  const base = object(JSON.parse(await readFile(resolve(root, "tsconfig.base.json"), "utf8")));
  const config = ts.convertCompilerOptionsFromJson(
    {
      ...object(base.compilerOptions),
      noEmit: true,
      types: ["node"],
      typeRoots: [resolve(root, "node_modules/@types")],
    },
    root,
  );
  assert.equal(config.errors.length, 0);
  const program = ts.createProgram(snippets, config.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  process.stdout.write(
    `SDK references: ${directories.length} packages, ${symbols} exported names, ${snippets.length} strict TypeScript examples passed.\n`,
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
