import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { expect, test } from "vitest";
import { validateHistoricalIncentiveAbi } from "../lib/historical-incentive-abi.ts";
import { object, objects, parseJson, type JsonObject } from "../lib/json.ts";

const root = resolve(import.meta.dirname, "../..");
const read = async (path: string) => object(parseJson(await readFile(path, "utf8"), path), path);
const reference = {
  moduleId: "contracts",
  resourceId: "contract-historical-abi-bindings",
  recordId: "incentives.ve-btc",
};

test.for(["accepted", "pending", "range", "ABI bytes", "observation", "runtime", "current ABI"])(
  "historical ABI qualification rejects mismatched provenance: %s",
  async (mutation) => {
    const directory = await mkdtemp(resolve(tmpdir(), "mdk-historical-abi-"));
    try {
      const files = [
        "index.json",
        "records/historical-abi-bindings.json",
        "evidence/incentives-contracts-2026-08-21.json",
        "artifacts/historical-abis/vebtc-before-2026-10-06.json",
        "artifacts/abis/incentives/ve-btc.json",
      ];
      for (const path of files) {
        const target = resolve(directory, "knowledge/contracts", path);
        await mkdir(dirname(target), { recursive: true });
        await cp(resolve(root, "knowledge/contracts", path), target);
      }
      const deployment = objects(
        (await read(resolve(root, "knowledge/contracts/records/deployments.json"))).records,
        "deployments",
      ).find((r) => r.contractId === reference.recordId)!;
      const abi = objects(
        (await read(resolve(root, "knowledge/contracts/records/abis.json"))).records,
        "ABIs",
      ).find((r) => r.id === reference.recordId)!;
      const path = resolve(directory, "knowledge/contracts/records/historical-abi-bindings.json");
      const catalog = await read(path);
      const records = objects(catalog.records, "bindings");
      const binding = records.find((r) => r.id === reference.recordId)!;
      const generation = object(binding.generationRange, "generation");
      const implementation = String(generation.implementationAddress);
      if (mutation === "pending") binding.reviewStatus = "pending-qualified-review";
      if (mutation === "range") object(generation.effectiveUntilExclusive, "end").blockNumber = 1;
      if (mutation === "runtime")
        object(binding.runtime, "runtime").implementationCodeSha256 = "0".repeat(64);
      if (mutation === "observation")
        object(binding.evidenceReference, "reference").recordId =
          "observe-incentives-ve-mezo-mezo-mainnet";
      catalog.records = records;
      await writeFile(path, JSON.stringify(catalog));
      if (mutation === "ABI bytes" || mutation === "current ABI") {
        const relative = mutation === "ABI bytes" ? files[3]! : files[4]!;
        const abiPath = resolve(directory, "knowledge/contracts", relative);
        const entries = objects(parseJson(await readFile(abiPath, "utf8"), "ABI"), "ABI");
        const getter: JsonObject = entries.find((e) => e.name === "balanceOf")!;
        getter.name = "changedBalanceOf";
        await writeFile(abiPath, JSON.stringify(entries));
      }
      const result = validateHistoricalIncentiveAbi(
        directory,
        reference,
        deployment,
        abi,
        implementation,
      );
      if (mutation === "accepted") await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
