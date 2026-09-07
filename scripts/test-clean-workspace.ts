import { spawnSync } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgentSkills } from "./lib/agent-skills.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "mdk-clean-workspace-"));
const pnpmExecutable = await findPnpmExecutable();
const excludedDirectoryNames = new Set([
  ".git",
  ".mdk",
  "coverage",
  "dist",
  "legacy",
  "local",
  "node_modules",
]);

try {
  await copyRepositoryDirectory("");

  runPnpm(temporaryRoot, ["install", "--offline", "--frozen-lockfile"]);
  runPnpm(temporaryRoot, ["typecheck"]);
  runPnpm(temporaryRoot, ["boundaries"]);
  runPnpm(temporaryRoot, ["build"]);
  runPnpm(temporaryRoot, ["test:built"]);
  runPnpm(temporaryRoot, ["--filter", "@mezo-dev-kit/example-foundational-readonly", "test"]);
  runPnpm(temporaryRoot, ["--filter", "@mezo-dev-kit/example-musd-savings-readonly", "test"]);
  runPnpm(temporaryRoot, ["--filter", "@mezo-dev-kit/example-musdc-lending-readonly", "test"]);
  runPnpm(temporaryRoot, ["--filter", "@mezo-dev-kit/example-usdc-lending-vault-readonly", "test"]);
  await verifyConsumerMaterialization();
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write(
  "Clean workspace install, typecheck, build, import, and consumer-skill smoke passed.\n",
);

function runPnpm(workingDirectory: string, arguments_: readonly string[]): void {
  const result = spawnSync(process.execPath, [pnpmExecutable, ...arguments_], {
    cwd: workingDirectory,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `pnpm ${arguments_.join(" ")} failed in clean workspace: ${String(result.error)}\n${result.stdout}\n${result.stderr}`,
    );
  }
}

async function findPnpmExecutable(): Promise<string> {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const candidate = resolve(directory, "pnpm");
    if (
      await access(candidate).then(
        () => true,
        () => false,
      )
    )
      return candidate;
  }
  throw new Error("pnpm executable is unavailable on PATH");
}

async function copyRepositoryDirectory(relativeDirectory: string): Promise<void> {
  const sourceDirectory = resolve(repositoryRoot, relativeDirectory);
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) continue;
    if (entry.isFile() && isLocalSecretOrLog(entry.name)) continue;
    const relativePath = join(relativeDirectory, entry.name);
    const source = resolve(repositoryRoot, relativePath);
    const relation = relative(repositoryRoot, source);
    if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`)) {
      throw new Error(`clean-workspace source escapes repository: '${relativePath}'`);
    }
    const target = resolve(temporaryRoot, relation);
    if (entry.isDirectory()) {
      await copyRepositoryDirectory(relativePath);
    } else if (entry.isSymbolicLink()) {
      await mkdir(dirname(target), { recursive: true });
      await symlink(await readlink(source), target);
    } else if (entry.isFile()) {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
    }
  }
}

function isLocalSecretOrLog(fileName: string): boolean {
  return (
    fileName === ".env" ||
    (fileName.startsWith(".env.") && fileName !== ".env.example") ||
    fileName.endsWith(".log")
  );
}

async function verifyConsumerMaterialization(): Promise<void> {
  const application = resolve(temporaryRoot, "consumer-smoke");
  const output = resolve(application, ".agents/skills");
  await mkdir(application, { recursive: true });
  const instructions = "# Application-owned instructions\nPreserve this file.\n";
  await writeFile(resolve(application, "AGENTS.md"), instructions);
  const result = spawnSync(
    process.execPath,
    [
      resolve(temporaryRoot, "scripts/materialize-agent-skills.ts"),
      "--audience",
      "consumer",
      "--output",
      output,
    ],
    { cwd: temporaryRoot, encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(`consumer skill CLI failed: ${String(result.error)} ${result.stderr}`);
  const validated = await validateAgentSkills(temporaryRoot);
  const expected = validated.catalog.skills.filter((entry) => entry.audience === "consumer");
  const actual = (await readdir(output)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected.map((entry) => entry.name).sort()))
    throw new Error("consumer discovery differs from the consumer catalog");
  for (const entry of expected) {
    const canonical = await readFile(resolve(temporaryRoot, entry.path, "SKILL.md"), "utf8");
    if ((await readFile(resolve(output, entry.name, "SKILL.md"), "utf8")) !== canonical)
      throw new Error(`materialized consumer skill changed: ${entry.name}`);
  }
  if ((await readFile(resolve(application, "AGENTS.md"), "utf8")) !== instructions)
    throw new Error("application-owned instructions were overwritten");
}
