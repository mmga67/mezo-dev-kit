import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

// Synthetic bytecode isolates the comparison boundary; it is not deployment evidence.
test.for([
  {
    label: "omitted empty immutable map",
    runtime: "600160020000",
    references: undefined,
    passes: true,
  },
  {
    label: "runtime mismatch without immutables",
    runtime: "600160030000",
    references: undefined,
    passes: false,
  },
  {
    label: "malformed explicit immutable map",
    runtime: "600160020000",
    references: null,
    passes: false,
  },
])("source comparison: $label", async ({ runtime, references, passes }) => {
  const directory = await mkdtemp(join(tmpdir(), "mdk-build-comparison-"));
  try {
    await mkdir(join(directory, "out", "Synthetic.sol"), { recursive: true });
    await writeFile(
      join(directory, "explorer.json"),
      JSON.stringify({
        name: "Synthetic",
        compiler_version: "synthetic-test",
        constructor_args: null,
        creation_bytecode: "600160020000",
        deployed_bytecode: runtime,
        implementations: [],
        is_fully_verified: false,
        is_partially_verified: false,
        is_changed_bytecode: false,
      }),
    );
    await writeFile(
      join(directory, "out", "Synthetic.sol", "Synthetic.json"),
      JSON.stringify({
        bytecode: { object: "600160020000" },
        deployedBytecode: {
          object: "600160020000",
          ...(references === undefined ? {} : { immutableReferences: references }),
        },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/evidence/compare-explorer-build.ts"), directory],
      { encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    expect(result.status === 0, result.stderr || result.stdout).toBe(passes);
    if (passes)
      expect(JSON.parse(result.stdout)).toMatchObject({
        runtime: { executableExact: true, immutableSubstitutions: 0 },
      });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.for([
  { label: "single RPC envelopes", batch: false, runtime: "600160020000", error: null },
  {
    label: "RPC batches selected by response ID",
    batch: true,
    runtime: "600160020000",
    error: null,
  },
  { label: "selected RPC error", batch: true, runtime: null, error: "RPC response runtime failed" },
  { label: "runtime mismatch in a batch", batch: true, runtime: "600160030000", error: "mismatch" },
])("standard JSON comparison: $label", async ({ batch, runtime, error }) => {
  const directory = await mkdtemp(join(tmpdir(), "mdk-standard-build-comparison-"));
  try {
    const compilerPath = join(directory, "compiler.json");
    const creationPath = join(directory, "creation.json");
    const runtimePath = join(directory, "runtime.json");
    await writeFile(
      compilerPath,
      JSON.stringify({
        contracts: {
          "Synthetic.sol": {
            Synthetic: {
              abi: [],
              evm: {
                bytecode: { object: "600160020000" },
                deployedBytecode: { object: "600160020000", immutableReferences: {} },
              },
            },
          },
        },
      }),
    );
    const creationResponse = {
      jsonrpc: "2.0",
      id: "creation",
      result: { input: "0x600160020000" },
    };
    const runtimeResponse =
      runtime === null
        ? { jsonrpc: "2.0", id: "runtime", error: { code: -32000, message: "archive unavailable" } }
        : { jsonrpc: "2.0", id: "runtime", result: `0x${runtime}` };
    // An unrelated result must not accidentally substitute for the selected ID.
    const unrelated = { jsonrpc: "2.0", id: "unrelated", result: "0x" };
    await writeFile(
      creationPath,
      JSON.stringify(batch ? [unrelated, creationResponse] : creationResponse),
    );
    await writeFile(
      runtimePath,
      JSON.stringify(batch ? [unrelated, runtimeResponse] : runtimeResponse),
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve("scripts/evidence/compare-standard-json-build.ts"),
        compilerPath,
        "Synthetic.sol",
        "Synthetic",
        creationPath,
        "creation",
        runtimePath,
        "runtime",
      ],
      { encoding: "utf8" },
    );
    expect(result.error).toBeUndefined();
    if (error === null) {
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        creation: { fullExact: true, executableExact: true },
        runtime: { fullExact: true, executableExact: true, immutableSubstitutions: 0 },
      });
    } else if (error === "mismatch") {
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ runtime: { executableExact: false } });
    } else {
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(error);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
