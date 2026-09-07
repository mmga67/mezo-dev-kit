import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generator = "scripts/generate-vault-package.ts";

test("Vault generation is reproducible and rejects a drifted built input", async () => {
  await scratch(async (directory) => {
    expect(run(directory, ["--check"]).status).toBe(0);
    const target = resolve(
      directory,
      "packages/protocols/usdc-lending-vault/src/model.generated.ts",
    );
    await writeFile(target, `${await readFile(target, "utf8")}\n// drift\n`);
    expect(run(directory, ["--check"]).stderr).toContain("Vault generated inputs drifted");
    expect(run(directory, []).status).toBe(0);
    expect(run(directory, ["--check"]).status).toBe(0);
  });
});
test("changed source bytes cannot reuse the vault interface digest", async () => {
  await scratch(async (directory) => {
    const target = resolve(
      directory,
      "knowledge/contracts/artifacts/dynamic-interfaces/vault-vault-gauge-explorer.json",
    );
    const contents = await readFile(target, "utf8");
    await writeFile(
      target,
      contents.replace(/"deployed_bytecode": "0x[0-9a-f]+"/, '"deployed_bytecode": "0x1234"'),
    );
    expect(run(directory, []).stderr).toContain("vault source digest drift");
  });
});
test("a rejected vault module cannot inherit an accepted record's status", async () => {
  await scratch(async (directory) => {
    const target = resolve(directory, "knowledge/protocols/vaults/usdc-lending/index.json");
    await writeFile(
      target,
      (await readFile(target, "utf8")).replace(
        '"reviewStatus": "accepted"',
        '"reviewStatus": "rejected"',
      ),
    );
    expect(run(directory, []).stderr).toContain("unaccepted module");
  });
});
function run(directory: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [resolve(directory, generator), ...args], {
    cwd: directory,
    encoding: "utf8",
  });
}
async function scratch(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mdk-vault-generation-"));
  try {
    await cp(resolve(root, "knowledge"), resolve(directory, "knowledge"), { recursive: true });
    await mkdir(resolve(directory, "scripts/lib"), { recursive: true });
    await cp(resolve(root, generator), resolve(directory, generator));
    await cp(
      resolve(root, "scripts/lib/knowledge-reference.ts"),
      resolve(directory, "scripts/lib/knowledge-reference.ts"),
    );
    await cp(resolve(root, "scripts/lib/json.ts"), resolve(directory, "scripts/lib/json.ts"));
    const output = "packages/protocols/usdc-lending-vault/src/model.generated.ts";
    await mkdir(dirname(resolve(directory, output)), { recursive: true });
    await cp(resolve(root, output), resolve(directory, output));
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
