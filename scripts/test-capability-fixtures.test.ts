import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "vitest";

import { prepareCapabilityFixtures } from "./prepare-capability-fixtures.ts";

test("fixture snapshots keep private versions equal while changing built exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdk-capability-fixtures-"));
  try {
    await prepareCapabilityFixtures(root);
    for (const snapshot of ["before", "added", "removed", "internal-only", "conflict"]) {
      const directory = join(root, snapshot);
      const build = spawnSync(
        process.execPath,
        [resolve("node_modules/typescript/bin/tsc"), "--project", join(directory, "tsconfig.json")],
        { encoding: "utf8" },
      );
      expect(build.error).toBeUndefined();
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const probe = join(directory, "probe.ts");
      await writeFile(
        probe,
        'const api = await import("@mezo-dev-kit/synthetic-widgets"); process.stdout.write(JSON.stringify({keys:Object.keys(api).sort(),read:api.readWidget().value.toString(),summary:api.summarizeWidgets?.([api.readWidget()]).toString()}));\n',
      );
      const result = spawnSync(process.execPath, [probe], { cwd: directory, encoding: "utf8" });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        snapshot === "added"
          ? { keys: ["readWidget", "summarizeWidgets"], read: "7", summary: "7" }
          : { keys: ["readWidget"], read: "7" },
      );
      expect(JSON.parse(await readFile(join(directory, "package.json"), "utf8"))).toMatchObject({
        version: "0.0.0-private",
      });
    }
    const missingProbe = join(root, "missing-build", "probe.ts");
    await writeFile(missingProbe, 'await import("@mezo-dev-kit/synthetic-widgets");\n');
    const missing = spawnSync(process.execPath, [missingProbe], {
      cwd: join(root, "missing-build"),
      encoding: "utf8",
    });
    expect(missing.error).toBeUndefined();
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("ERR_MODULE_NOT_FOUND");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

test("fixture preparation refuses to overwrite an existing task", async () => {
  const root = await mkdtemp(join(tmpdir(), "mdk-capability-existing-"));
  try {
    await writeFile(join(root, "keep.txt"), "existing work");
    await expect(prepareCapabilityFixtures(root)).rejects.toThrow("Fixture target must be empty");
    expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("existing work");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
