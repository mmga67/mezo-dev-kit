import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAbiProvenance, assertDeploymentProvenance } from "./lib/contract-provenance.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

type JsonObject = Record<string, unknown>;

async function loadJson(path: string): Promise<JsonObject> {
  return object(JSON.parse(await readFile(path, "utf8")) as unknown, path);
}

function clone<T>(value: T): T {
  return structuredClone(value);
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

const abiCatalog = await loadJson(join(repositoryRoot, "knowledge/contracts/records/abis.json"));
const deploymentCatalog = await loadJson(
  join(repositoryRoot, "knowledge/contracts/records/deployments.json"),
);
const abi = firstRecord(abiCatalog.records, "ABI records");
const pythAbi = findRecord(abiCatalog.records, "oracle.pyth-price-feed", "Pyth ABI record");
const deployment = firstRecord(deploymentCatalog.records, "deployment records");

assertAbiProvenance(abi);
assertAbiProvenance(pythAbi);
assertDeploymentProvenance(deployment);

const missingClassAbi = clone(abi);
delete missingClassAbi.provenanceClass;
expectFailure(
  "missing ABI class",
  () => {
    assertAbiProvenance(missingClassAbi);
  },
  /invalid provenance class/,
);

const singleArtifactOfficialAbi = clone(abi);
const singleSourceArtifact = firstRecord(
  singleArtifactOfficialAbi.sourceArtifacts,
  "source artifacts",
);
singleArtifactOfficialAbi.sourceArtifacts = [singleSourceArtifact];
singleArtifactOfficialAbi.intendedNetworkIds = [
  text(singleSourceArtifact.networkId, "source network"),
];
expectFailure(
  "single-artifact official ABI",
  () => {
    assertAbiProvenance(singleArtifactOfficialAbi);
  },
  /at least two network artifacts/,
);

const mismatchedNetworkAbi = clone(abi);
mismatchedNetworkAbi.intendedNetworkIds = ["mezo-mainnet"];
expectFailure(
  "mismatched ABI network scope",
  () => {
    assertAbiProvenance(mismatchedNetworkAbi);
  },
  /exactly cover/,
);

const reproductionWithoutEvidence = clone(deployment);
reproductionWithoutEvidence.provenanceClass = "deployed-executable-reproduction";
expectFailure(
  "reproduction without evidence",
  () => {
    assertDeploymentProvenance(reproductionWithoutEvidence);
  },
  /reproduction evidence is required/,
);

const precompileWithProxyType = clone(deployment);
precompileWithProxyType.provenanceClass = "official-client-precompile-source";
precompileWithProxyType.provenanceEvidence = { clientPrecompile: {} };
expectFailure(
  "precompile class with proxy type",
  () => {
    assertDeploymentProvenance(precompileWithProxyType);
  },
  /requires contractType precompile/,
);

const liveConfigurationWithoutEvidence = clone(deployment);
liveConfigurationWithoutEvidence.provenanceClass =
  "official-deployment-repository-live-configuration";
expectFailure(
  "deployment repository without live configuration",
  () => {
    assertDeploymentProvenance(liveConfigurationWithoutEvidence);
  },
  /live configuration evidence is required/,
);

const uupsWithProxyAdmin = clone(deployment);
uupsWithProxyAdmin.provenanceClass = "official-deployment-repository-live-configuration";
uupsWithProxyAdmin.provenanceEvidence = { liveConfiguration: {} };
uupsWithProxyAdmin.contractType = "erc1967-proxy";
uupsWithProxyAdmin.proxy = {
  standard: "eip-1967-uups",
  adminSlot: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  adminAddress: proxyAdminAddress(deployment),
};
expectFailure(
  "UUPS proxy with proxy-admin metadata",
  () => {
    assertDeploymentProvenance(uupsWithProxyAdmin);
  },
  /must not declare an admin slot/,
);

process.stdout.write("Contract provenance negative tests passed.\n");

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function firstRecord(value: unknown, label: string): JsonObject {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must not be empty`);
  return object(value[0] as unknown, `${label}[0]`);
}

function findRecord(value: unknown, id: string, label: string): JsonObject {
  if (!Array.isArray(value)) throw new Error(`${label} collection must be an array`);
  const records: unknown[] = value;
  const record = records.find(
    (entry) => typeof entry === "object" && entry !== null && (entry as JsonObject).id === id,
  );
  if (!record) throw new Error(`${label} is missing`);
  return object(record, label);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function proxyAdminAddress(deploymentRecord: JsonObject): string {
  if (typeof deploymentRecord.proxy !== "object" || deploymentRecord.proxy === null) {
    return "0x0000000000000000000000000000000000000001";
  }
  const proxy = object(deploymentRecord.proxy, "deployment proxy");
  return typeof proxy.adminAddress === "string"
    ? proxy.adminAddress
    : "0x0000000000000000000000000000000000000001";
}
