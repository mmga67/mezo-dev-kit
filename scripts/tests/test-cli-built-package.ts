import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReferenceBundle, packPrivateArtifacts } from "@mezo-dev-kit/cli";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = await mkdtemp(join(tmpdir(), "mdk-packed-proof-"));
async function pnpm(cwd: string, args: readonly string[]): Promise<string> {
  const result = await promisify(execFile)("pnpm", [...args], {
    cwd,
    env: { ...process.env, CI: "true" },
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return result.stdout;
}
function resultData(output: string): Record<string, unknown> {
  const value: unknown = JSON.parse(output);
  assert.ok(typeof value === "object" && value !== null && "data" in value);
  assert.ok(typeof value.data === "object" && value.data !== null);
  return value.data as Record<string, unknown>;
}
try {
  const source = resolve(root, "packages/cli/dist/assets");
  await rm(source, { recursive: true, force: true });
  const bundle = await buildReferenceBundle({
    sourceRoot: root,
    outputRoot: source,
    revision: null,
  });
  const repeated = await buildReferenceBundle({
    sourceRoot: root,
    outputRoot: join(temporary, "repeated"),
    revision: null,
  });
  assert.equal(bundle.id, repeated.id, "Bundle generation must be deterministic");
  assert.ok(bundle.resources.length > 100);
  assert.ok(bundle.exclusions.length > 0);
  assert.equal(bundle.skills.length, 2);
  for (const resource of bundle.resources.filter((item) => item.kind === "knowledge"))
    assert.deepEqual(
      await readFile(join(source, resource.path)),
      await readFile(join(root, resource.sourcePath)),
      "Knowledge records retain original bytes and evidence envelope",
    );
  for (const skill of bundle.skills)
    for (const file of skill.files)
      assert.deepEqual(
        await readFile(join(source, "skills", skill.name, file.path)),
        await readFile(join(root, "agents/consumer/skills", skill.name, file.path)),
      );
  const artifacts = join(temporary, "artifacts");
  const packed = await packPrivateArtifacts(root, artifacts);
  assert.equal(packed.packages.length, bundle.packages.length + 1);
  const project = join(temporary, "consumer");
  const create = [
    "create",
    project,
    "--template",
    "typescript",
    "--artifacts",
    join(artifacts, "manifest.json"),
  ];
  await promisify(execFile)(
    process.execPath,
    [resolve(root, "packages/cli/dist/bin.js"), ...create, "--dry-run"],
    { cwd: root },
  );
  assert.ok(!(await readdir(temporary)).includes("consumer"));
  await promisify(execFile)(
    process.execPath,
    [resolve(root, "packages/cli/dist/bin.js"), ...create],
    { cwd: root },
  );
  await pnpm(project, ["install", "--offline", "--ignore-scripts"]);
  const second = join(temporary, "created-by-installed-cli");
  await pnpm(project, [
    "exec",
    "mdk",
    "create",
    second,
    "--template",
    "typescript",
    "--artifacts",
    join(artifacts, "manifest.json"),
    "--offline",
    "--json",
  ]);
  assert.match(await readFile(join(second, ".gitignore"), "utf8"), /node_modules\//);
  assert.ok((await readdir(join(second, "src"))).includes("network.ts"));
  await pnpm(project, [
    "exec",
    "mdk",
    "init",
    "--domains",
    "typescript,foundation",
    "--offline",
    "--json",
  ]);
  await pnpm(project, ["start"]);
  await pnpm(project, ["check"]);
  const search = resultData(
    await pnpm(project, ["exec", "mdk", "docs", "search", "borrowing", "--json"]),
  );
  assert.ok(Array.isArray(search.resources) && search.resources.length > 0);
  await pnpm(project, [
    "exec",
    "mdk",
    "docs",
    "fetch",
    "api:musd-borrowing",
    "--offline",
    "--json",
  ]);
  await pnpm(project, ["exec", "mdk", "docs", "show", "api:musd-borrowing", "--offline", "--json"]);
  const all = resultData(
    await pnpm(project, ["exec", "mdk", "docs", "fetch", "--all", "--offline", "--json"]),
  );
  assert.equal(all.complete, true);
  assert.ok(Array.isArray(all.verified));
  assert.equal(all.verified.length, bundle.resources.length);
  const doctor = resultData(await pnpm(project, ["exec", "mdk", "doctor", "--offline", "--json"]));
  assert.deepEqual(doctor.issues, []);
  assert.equal(doctor.cached, bundle.resources.length);
  const instructions = await readFile(join(project, "AGENTS.md"));
  await rm(join(project, ".agents"), { recursive: true });
  await rm(join(project, ".mdk/reference"), { recursive: true });
  await pnpm(project, ["exec", "mdk", "sync", "--locked", "--offline", "--json"]);
  await pnpm(project, ["exec", "mdk", "sync", "--locked", "--check", "--offline", "--json"]);
  assert.deepEqual(await readFile(join(project, "AGENTS.md")), instructions);
  process.stdout.write(
    `Packed CLI and ${bundle.packages.length} SDK packages passed external creation, installed-bin invocation, starter checks, ${bundle.resources.length}-resource offline retrieval and locked restoration.\n`,
  );
} finally {
  if (process.env.MDK_KEEP_CLI_FIXTURE) process.stdout.write(`Fixture retained: ${temporary}\n`);
  else await rm(temporary, { recursive: true, force: true });
}
