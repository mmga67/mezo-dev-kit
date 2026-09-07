import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertNetworkCapabilityProfile } from "./lib/network-profile.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

type JsonObject = Record<string, unknown>;

async function loadJson(path: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(path, "utf8")) as unknown, path);
}

function expectFailure(label: string, operation: () => void, pattern: RegExp): void {
  try {
    operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pattern.test(message)) return;
    throw new Error(`${label} failed for the wrong reason: ${message}`, { cause: error });
  }
  throw new Error(`${label} unexpectedly passed`);
}

const mezo = await loadJson(join(repositoryRoot, "knowledge/networks/records/mezo-mainnet.json"));
const ethereum = await loadJson(
  join(repositoryRoot, "knowledge/networks/records/ethereum-mainnet.json"),
);

assertNetworkCapabilityProfile(mezo);
assertNetworkCapabilityProfile(ethereum);

const fakeCosmos = structuredClone(ethereum);
object(fakeCosmos.values, "ethereum values").cosmosChainId = "invented-1";
expectFailure(
  "plain EVM profile with Cosmos ID",
  () => {
    assertNetworkCapabilityProfile(fakeCosmos);
  },
  /cannot invent a Cosmos chain ID/,
);

const missingCosmos = structuredClone(mezo);
delete object(object(missingCosmos.values, "Mezo values").nativeCurrency, "native currency")
  .cosmosEvmDenom;
expectFailure(
  "Cosmos-EVM profile without denomination",
  () => {
    assertNetworkCapabilityProfile(missingCosmos);
  },
  /Cosmos EVM denomination/,
);

const falseCosmosCapability = structuredClone(mezo);
object(object(falseCosmosCapability.values, "Mezo values").capabilities, "capabilities").cosmosSdk =
  false;
expectFailure(
  "Cosmos-EVM profile with false capability",
  () => {
    assertNetworkCapabilityProfile(falseCosmosCapability);
  },
  /must declare Cosmos SDK capability/,
);

const unknownProfile = structuredClone(ethereum);
object(unknownProfile.values, "ethereum values").profile = "external";
expectFailure(
  "unknown network profile",
  () => {
    assertNetworkCapabilityProfile(unknownProfile);
  },
  /capability profile is invalid/,
);

process.stdout.write("Network capability-profile negative tests passed.\n");

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}
