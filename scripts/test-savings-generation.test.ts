import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { object, parseJson } from "./lib/json.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = "scripts/generate-savings-package.ts";

test("Savings generation is reproducible and rejects a drifted built input", async () => {
  await scratch(async (directory) => {
    expect(run(directory, ["--check"]).status).toBe(0);
    const target = resolve(directory, "packages/protocols/musd-savings/src/model.generated.ts");
    await writeFile(target, `${await readFile(target, "utf8")}\n// drift\n`);
    expect(run(directory, ["--check"]).stderr).toContain("Savings generated inputs drifted");
    expect(run(directory, []).status).toBe(0);
    expect(run(directory, ["--check"]).status).toBe(0);
  });
});
test("a modified explorer artifact cannot reuse its old source digest", async () => {
  await scratch(async (directory) => {
    const target = resolve(
      directory,
      "knowledge/contracts/artifacts/dynamic-interfaces/savings-gauge-explorer.json",
    );
    await writeFile(target, `${await readFile(target, "utf8")} `);
    const result = run(directory, []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("role source drift");
  });
});
test("rejected interface review prevents generation even if source bytes are unchanged", async () => {
  await scratch(async (directory) => {
    const target = resolve(
      directory,
      "knowledge/contracts/records/savings-dynamic-read-interfaces.json",
    );
    const catalog = object(parseJson(await readFile(target, "utf8"), target), target);
    catalog.reviewStatus = "rejected";
    await writeFile(target, JSON.stringify(catalog));
    const result = run(directory, []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unsupported dynamic interface lifecycle");
  });
});
test("a rejected Savings module cannot inherit an accepted record's status", async () => {
  await scratch(async (directory) => {
    const target = resolve(directory, "knowledge/protocols/musd/savings/index.json");
    const text = await readFile(target, "utf8");
    await writeFile(
      target,
      text.replace('"reviewStatus": "accepted"', '"reviewStatus": "rejected"'),
    );
    const result = run(directory, []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unaccepted module 'protocols/musd/savings'");
  });
});
function run(directory: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [resolve(directory, generator), ...args], {
    cwd: directory,
    encoding: "utf8",
  });
}
async function scratch(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mdk-savings-generation-"));
  try {
    await cp(resolve(root, "knowledge"), resolve(directory, "knowledge"), { recursive: true });
    await mkdir(resolve(directory, "scripts/lib"), { recursive: true });
    await cp(resolve(root, generator), resolve(directory, generator));
    await cp(
      resolve(root, "scripts/lib/knowledge-reference.ts"),
      resolve(directory, "scripts/lib/knowledge-reference.ts"),
    );
    const output = "packages/protocols/musd-savings/src/model.generated.ts";
    await mkdir(dirname(resolve(directory, output)), { recursive: true });
    await cp(resolve(root, output), resolve(directory, output));
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
