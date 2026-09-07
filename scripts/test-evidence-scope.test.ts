import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { parseEvidenceArguments, requiresEvidenceFreshness } from "./lib/evidence-scope.ts";
import { object, objects, parseJson, type JsonObject } from "./lib/json.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("network selection is explicit and the default includes full-registry freshness", () => {
  expect(parseEvidenceArguments([])).toEqual({ network: undefined, paths: [] });
  expect(
    parseEvidenceArguments(["out", "docs", "client", "pyth", "--network", "mezo-mainnet"], 4),
  ).toEqual({ network: "mezo-mainnet", paths: ["out", "docs", "client", "pyth"] });
  const deployments = [
    { networkId: "mezo-mainnet", evidenceReference: { resourceId: "fresh" } },
    { networkId: "mezo-testnet", evidenceReference: { resourceId: "expired" } },
  ];
  expect(requiresEvidenceFreshness("expired", undefined, deployments)).toBe(true);
  expect(requiresEvidenceFreshness("expired", "mezo-testnet", deployments)).toBe(true);
  expect(requiresEvidenceFreshness("expired", "mezo-mainnet", deployments)).toBe(false);
  expect(requiresEvidenceFreshness("fresh", "mezo-mainnet", deployments)).toBe(true);
});
test.for([
  ["--network"],
  ["--network", "mezo-mainnnet"],
  ["--network", "all"],
  ["--network", "mezo-mainnet", "--network", "mezo-testnet"],
  ["--skip-expired"],
  ["unexpected"],
])("invalid scope arguments fail closed: %j", (args) => {
  expect(() => parseEvidenceArguments(args)).toThrow();
});

test("mainnet acceptance cannot turn the expired testnet or full-registry gate green", async () => {
  await scratch(async (directory) => {
    // Fixtures deliberately choose relative dates; no frozen validator clock or live RPC.
    await adjustWindows(directory);
    for (const script of ["validate-contract-knowledge.ts", "validate-price-knowledge.ts"]) {
      const mainnet = run(directory, script, ["--network", "mezo-mainnet"]);
      expect(mainnet.stderr).toBe("");
      expect(mainnet.status).toBe(0);
      expect(mainnet.stdout, script).toContain("mezo-mainnet");
      const testnet = run(directory, script, ["--network", "mezo-testnet"]);
      expect(testnet.status).not.toBe(0);
      expect(testnet.stderr).toMatch(/expired/);
      const all = run(directory, script, []);
      expect(all.status).not.toBe(0);
      expect(all.stderr).toMatch(/expired/);
    }
  });
});
test("a mainnet evidence deadline cannot be bypassed by choosing mainnet scope", async () => {
  await scratch(async (directory) => {
    await adjustWindows(directory);
    for (const module of ["contracts", "prices"]) {
      const path = await currentEvidencePath(directory, module);
      await mutate(path, (document) => {
        document.reviewAfter = "2000-01-01T00:00:00Z";
      });
      await syncSourceDigests(directory);
      const result = run(
        directory,
        module === "contracts" ? "validate-contract-knowledge.ts" : "validate-price-knowledge.ts",
        ["--network", "mezo-mainnet"],
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("expired");
    }
  });
});
test("mapping mainnet to other network or older block evidence fails even when fresh", async () => {
  await scratch(async (directory) => {
    await adjustWindows(directory);
    for (const path of [
      "knowledge/prices/evidence/fixed-block-observations-2026-08-27.json",
      "knowledge/contracts/evidence/oracle-contracts-2026-08-27.json",
    ])
      await mutate(resolve(directory, path), (document) => {
        document.reviewAfter = new Date(Date.now() + 86_400_000).toISOString();
      });
    await syncSourceDigests(directory);
    await mutate(resolve(directory, "knowledge/prices/index.json"), (document) => {
      const refs = object(
        object(document.extensions, "extensions").currentEvidenceByNetwork,
        "refs",
      );
      refs["mezo-mainnet"] = refs["mezo-testnet"];
    });
    const result = run(directory, "validate-price-knowledge.ts", ["--network", "mezo-mainnet"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("block mismatch");
    await mutate(resolve(directory, "knowledge/contracts/records/deployments.json"), (document) => {
      const records = objects(document.records, "records");
      const mainnet = records.find(({ id }) => id === "oracle.pyth-price-feed@mezo-mainnet");
      const testnet = records.find(({ id }) => id === "oracle.pyth-price-feed@mezo-testnet");
      if (!mainnet || !testnet) throw new Error("fixture missing Pyth deployments");
      mainnet.evidenceReference = testnet.evidenceReference;
    });
    const resultContracts = run(directory, "validate-contract-knowledge.ts", [
      "--network",
      "mezo-mainnet",
    ]);
    expect(resultContracts.status).not.toBe(0);
    expect(resultContracts.stderr).toContain("evidence does not link back");
  });
});

test("a modified capture cannot keep its accepted evidence digest", async () => {
  await scratch(async (directory) => {
    await adjustWindows(directory);
    const evidence = await read(await currentEvidencePath(directory, "contracts"));
    const index = await read(resolve(directory, "knowledge/contracts/index.json"));
    const reference = object(evidence.captureReference, "capture ref");
    const resource = objects(index.resources, "resources").find(
      ({ id }) => id === reference.resourceId,
    );
    if (!resource) throw new Error("fixture capture missing");
    const path = resolve(directory, "knowledge/contracts", String(resource.path));
    await writeFile(path, `${await readFile(path, "utf8")} `);
    const result = run(directory, "validate-contract-knowledge.ts", ["--network", "mezo-mainnet"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("oracle capture digest drifted");
  });
});

test.for(["rollback", "historical-storage"] as const)(
  "mainnet importer rejects %s before changing canonical records",
  async (scenario) => {
    await scratch(async (directory) => {
      const evidence = await read(await currentEvidencePath(directory, "contracts"));
      const index = await read(resolve(directory, "knowledge/contracts/index.json"));
      const captureRef = object(evidence.captureReference, "capture ref");
      const resource = objects(index.resources, "resources").find(
        ({ id }) => id === captureRef.resourceId,
      );
      if (!resource) throw new Error("fixture capture missing");
      const capture = await read(resolve(directory, "knowledge/contracts", String(resource.path)));
      const capturedAt = new Date().toISOString();
      capture.capturedAt = capturedAt;
      const network = object(
        object(capture.observations, "observations")["mezo-mainnet"],
        "network",
      );
      const block = object(network.block, "block");
      block.timestamp = capturedAt;
      block.number = Number(block.number) + (scenario === "rollback" ? -1 : 1);
      if (scenario === "historical-storage") {
        const pyth = object(object(network.contracts, "contracts").pyth, "pyth");
        const history = objects(pyth.implementationHistory, "history");
        if (!history[1]) throw new Error("fixture history missing");
        history[1].implementationBefore = "0x0000000000000000000000000000000000000000";
      }
      const capturePath = resolve(directory, "capture.json");
      await writeFile(capturePath, JSON.stringify(capture));
      const deploymentPath = resolve(directory, "knowledge/contracts/records/deployments.json");
      const before = await readFile(deploymentPath, "utf8");
      const result = run(directory, "import-mainnet-oracle-refresh.ts", [capturePath]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        scenario === "rollback" ? "cannot roll back" : "historical before-slot drift",
      );
      expect(await readFile(deploymentPath, "utf8")).toBe(before);
    });
  },
);

async function adjustWindows(directory: string): Promise<void> {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  // Only fixture envelopes required by these validators are advanced. The old
  // oracle set and aggregate Prices deadline stay explicitly expired.
  for (const path of [
    "knowledge/contracts/index.json",
    "knowledge/contracts/sources/catalog.json",
    "knowledge/contracts/records/abis.json",
    "knowledge/contracts/records/deployments.json",
  ]) {
    await mutate(resolve(directory, path), (document) => {
      document.reviewAfter = future;
    });
  }
  const contractsIndex = await read(resolve(directory, "knowledge/contracts/index.json"));
  for (const resource of objects(contractsIndex.resources, "resources")) {
    if (resource.role !== "evidence") continue;
    const path = resolve(directory, "knowledge/contracts", String(resource.path));
    await mutate(path, (document) => {
      if (document.reviewAfter !== null && document.id !== "contract-oracle-probes-2026-08-27")
        document.reviewAfter = future;
    });
  }
  await mutate(await currentEvidencePath(directory, "prices"), (document) => {
    document.reviewAfter = future;
  });
  await syncSourceDigests(directory);
}
async function syncSourceDigests(directory: string): Promise<void> {
  // Source digest fixture updates follow the modified fixture evidence bytes.
  for (const module of ["contracts", "prices"]) {
    const path = resolve(directory, `knowledge/${module}/sources/catalog.json`);
    const document = await read(path);
    const entries = objects(
      module === "contracts" ? document.sources : document.records,
      "sources",
    );
    const { createHash } = await import("node:crypto");
    for (const entry of entries) {
      if (!entry.reference) continue;
      const ref = object(entry.reference, "source ref");
      if (ref.moduleId !== module) continue;
      const index = await read(resolve(directory, `knowledge/${module}/index.json`));
      const resource = objects(index.resources, "resources").find(
        ({ id }) => id === ref.resourceId,
      );
      if (!resource) throw new Error("fixture source resource missing");
      entry.sha256 = createHash("sha256")
        .update(await readFile(resolve(directory, `knowledge/${module}`, String(resource.path))))
        .digest("hex");
    }
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
  }
}
async function currentEvidencePath(directory: string, module: string): Promise<string> {
  const index = await read(resolve(directory, `knowledge/${module}/index.json`));
  const resource = objects(index.resources, "resources").find(
    ({ id }) =>
      typeof id === "string" &&
      id.startsWith(
        module === "contracts"
          ? "contract-oracle-probes-mezo-mainnet-"
          : "price-fixed-block-observations-mezo-mainnet-",
      ),
  );
  if (!resource) throw new Error("fixture mainnet evidence missing");
  return resolve(directory, `knowledge/${module}`, String(resource.path));
}
async function read(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(path, "utf8"), path), path);
}
async function mutate(path: string, change: (document: JsonObject) => void): Promise<void> {
  const document = await read(path);
  change(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
}
function run(directory: string, script: string, args: string[]): ReturnType<typeof spawnSync> {
  const result = spawnSync(process.execPath, [resolve(directory, "scripts", script), ...args], {
    cwd: directory,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
}
async function scratch(action: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(resolve(tmpdir(), "mdk-evidence-scope-"));
  try {
    await cp(resolve(root, "knowledge"), resolve(directory, "knowledge"), { recursive: true });
    await cp(resolve(root, "scripts"), resolve(directory, "scripts"), { recursive: true });
    await cp(resolve(root, "docs"), resolve(directory, "docs"), { recursive: true });
    await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
