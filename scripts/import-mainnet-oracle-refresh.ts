import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { object, objects, parseJson, text, type JsonObject } from "./lib/json.ts";

// Re-verification of the accepted 1.4.6 generation only. Upgrades require a separate review.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [capturePath] = process.argv.slice(2);
assert(
  capturePath && process.argv.length === 3,
  "usage: node scripts/import-mainnet-oracle-refresh.ts <mainnet-capture-json>",
);
const captureBytes = await readFile(capturePath);
const capture = object(parseJson(captureBytes.toString(), capturePath), "capture");
assert(capture.kind === "price-source-capture", "invalid capture kind");
equal(capture.networkIds, ["mezo-mainnet"], "capture must contain only mainnet");
const capturedAt = text(capture.capturedAt, "capturedAt");
const now = Date.parse(capturedAt);
assert(
  Number.isFinite(now) && now <= Date.now() && Date.now() - now < 86_400_000,
  "capture must be from the last 24 hours",
);
const date = capturedAt.slice(0, 10);
const reviewAfter = new Date(now + 7 * 86_400_000).toISOString();
const contractId = `contract-oracle-probes-mezo-mainnet-${date}`;
const priceId = `price-fixed-block-observations-mezo-mainnet-${date}`;
const captureId = `oracle-capture-mezo-mainnet-${date}`;
const captureRelative = `artifacts/oracle-captures/mezo-mainnet-${date}.json`;
const oldContracts = await json("knowledge/contracts/evidence/oracle-contracts-2026-08-27.json");
const oldPrices = await json("knowledge/prices/evidence/fixed-block-observations-2026-08-27.json");
const contractIndex = await json("knowledge/contracts/index.json");
const priceIndex = await json("knowledge/prices/index.json");
const deployments = await json("knowledge/contracts/records/deployments.json");
const priceSources = await json("knowledge/prices/sources/catalog.json");
const sourceFeeds = await json("knowledge/prices/records/sources-feeds.json");
const network = object(
  object(capture.observations, "observations")["mezo-mainnet"],
  "mainnet capture",
);
equal(
  Object.keys(object(capture.observations, "observations")),
  ["mezo-mainnet"],
  "unexpected captured network",
);
const block = object(network.block, "block");
assert(
  network.chainId === 31612 && network.networkId === "mezo-mainnet",
  "mainnet chain identity drift",
);
assert(
  typeof block.number === "number" && Number.isSafeInteger(block.number),
  "invalid block number",
);
assert(/^0x[0-9a-f]{64}$/.test(text(block.hash, "block hash")), "invalid block hash");
assert(
  Math.abs(now - Date.parse(text(block.timestamp, "block timestamp"))) < 300_000,
  "capture block is not recent",
);
const contracts = object(network.contracts, "contracts");
const pyth = object(contracts.pyth, "pyth");
const skip = object(contracts.skipBtcUsd, "skip");
const adapter = object(contracts.musdPriceFeed, "adapter");
const oldObservation = find(oldContracts.observations, "networkId", "mezo-mainnet");
const deployment = find(deployments.records, "id", "oracle.pyth-price-feed@mezo-mainnet");
const priorReference = object(deployment.evidenceReference, "current evidence reference");
const currentRuntime = object(deployment.runtime, "current runtime");
assert(
  typeof block.number === "number" &&
    (block.number > Number(currentRuntime.blockNumber) ||
      (block.number === currentRuntime.blockNumber &&
        block.hash === currentRuntime.blockHash &&
        priorReference.resourceId === contractId)),
  "capture cannot roll back current mainnet evidence",
);
let supersedes: unknown = priorReference;
if (priorReference.resourceId === contractId) {
  const existing = await json(
    `knowledge/contracts/evidence/oracle-contracts-mezo-mainnet-${date}.json`,
  );
  supersedes = find(existing.observations, "networkId", "mezo-mainnet").supersedes;
  assert(supersedes, "existing refresh lacks supersession provenance");
}
const oldProxy = object(oldObservation.proxy, "old proxy");
const oldRuntime = object(oldObservation.runtime, "old runtime");
assert(
  block.number > Number(object(oldObservation.observationBlock, "old block").number),
  "capture must advance the evidence block",
);
equal(pyth.address, deployment.address, "proxy identity drift");
equal(pyth.implementation, oldProxy.currentImplementationAddress, "implementation drift");
equal(pyth.implementationSlot, oldProxy.implementationSlot, "implementation slot drift");
equal(
  text(pyth.implementationSlotValue, "slot value").slice(-40),
  text(pyth.implementation, "implementation").slice(2),
  "slot value drift",
);
equal(pyth.codeSha256, oldRuntime.addressCodeSha256, "proxy runtime drift");
equal(
  pyth.implementationCodeSha256,
  oldRuntime.implementationCodeSha256,
  "implementation runtime drift",
);
equal(pyth.version, oldRuntime.version, "Pyth version drift");
const history = objects(pyth.implementationHistory, "captured history");
const oldHistory = objects(oldProxy.implementationHistory, "accepted history");
assert(history.length === oldHistory.length, "upgrade history length drift");
for (const [index, generation] of history.entries()) {
  const accepted = oldHistory[index];
  assert(accepted, "missing accepted generation");
  equal(
    generation.implementationAddress,
    accepted.implementationAddress,
    "history implementation drift",
  );
  const actual = object(generation.effectiveFrom, "captured transition");
  const expected = object(accepted.effectiveFrom, "accepted transition");
  for (const field of ["blockNumber", "blockHash", "blockTimestamp", "transactionHash"])
    equal(actual[field], expected[field], `history ${field} drift`);
  if (expected.logIndex !== undefined)
    equal(actual.logIndex, expected.logIndex, "history log index drift");
  equal(generation.implementationAt, accepted.implementationAddress, "historical at-slot drift");
  equal(
    generation.implementationBefore,
    index === 0
      ? "0x0000000000000000000000000000000000000000"
      : oldHistory[index - 1]?.implementationAddress,
    "historical before-slot drift",
  );
}
const official = object(capture.officialPyth, "official Pyth source");
const provenance = object(oldObservation.sourceProvenance, "accepted source provenance");
for (const field of ["repository", "commit", "releaseCommit", "version", "artifacts"])
  equal(official[field], provenance[field], `source ${field} drift`);
const explorer = object(object(capture.explorer, "explorer")["mezo-mainnet"], "mainnet explorer");
const oldExplorer = object(oldObservation.explorer, "accepted explorer");
for (const [actualKey, expectedKey] of [
  ["pythImplementation", "activeContract"],
  ["pythProxy", "proxyContract"],
  ["providerUpgradedPythImplementation", "effectiveAbiSource"],
] as const) {
  const actual = object(explorer[actualKey], actualKey);
  const expected = object(oldExplorer[expectedKey], expectedKey);
  for (const field of [
    "address",
    "name",
    "compilerVersion",
    "proxyType",
    "isVerified",
    "isFullyVerified",
    "isPartiallyVerified",
  ])
    equal(actual[field], expected[field], `${actualKey} ${field} drift`);
}
equal(
  object(contracts.providerUpgradedPyth, "provider generation").implementationCodeSha256,
  object(oldExplorer.effectiveAbiSource, "accepted ABI source").deployedBytecodeSha256,
  "provider generation runtime drift",
);
const abi = parseJson(
  await readFile(
    resolve(root, "knowledge/contracts/artifacts/abis/oracle/pyth-price-feed.json"),
    "utf8",
  ),
  "Pyth ABI",
);
equal(
  object(explorer.providerUpgradedPythImplementation, "ABI source").abi,
  abi,
  "effective ABI drift",
);
const oldSkip = find(oldPrices.observations, "id", "observe-skip-mezo-mainnet-2026-08-27");
const oldPyth = find(oldPrices.observations, "id", "observe-pyth-mezo-mainnet-2026-08-27");
equal(adapter.oracle, skip.address, "MUSD oracle drift");
equal(
  adapter.oracle,
  object(oldSkip.protocolAdapterObservation, "accepted adapter").configuredOracle,
  "configured oracle identity drift",
);
const round = object(skip.latestRoundData, "Skip round");
equal(adapter.fetchPrice, round.answer, "MUSD/Skip price mismatch");
equal(skip.decimals, 18, "Skip decimals drift");
equal(adapter.targetDigits, 18, "adapter scaling drift");
equal(round.answeredInRound, "0", "Skip round shape drift");
equal(
  skip.description,
  object(oldSkip.interfaceObservation, "Skip interface").description,
  "Skip description outcome drift",
);
for (const feed of objects(oldPyth.feeds, "accepted feeds")) {
  const fresh = object(object(pyth.feeds, "captured feeds")[text(feed.pair, "pair")], "feed");
  equal(fresh.feedId, feed.feedId, "feed identity drift");
  equal(fresh.maxAgeSeconds, feed.maxAgeSeconds, "feed max age drift");
  const attempt = object(fresh.freshResult, "freshness result");
  assert(
    attempt.ok === false && object(attempt.error, "stale error").data === "0x19abf40e",
    "feed freshness outcome changed; separate review required",
  );
  equal(
    fresh.diagnosticResult,
    feed.diagnosticResult,
    "diagnostic payload changed; separate review required",
  );
}
const captureReference = { moduleId: "contracts", resourceId: captureId };
const captureSha256 = createHash("sha256").update(captureBytes).digest("hex");
const snapshot = {
  networkId: "mezo-mainnet",
  evmChainId: network.chainId,
  blockNumber: block.number,
  blockHash: block.hash,
  blockTimestamp: block.timestamp,
  rpcUrl: network.rpcUrl,
  explorerApiUrl: network.explorerApiUrl,
};
const observation = structuredClone(oldObservation);
observation.id = `observe-oracle-pyth-price-feed-mezo-mainnet-${date}`;
observation.observedAt = capturedAt;
observation.methods = objectsToStrings(oldObservation.methods).map((method) =>
  method.replace(
    "on both Mezo networks",
    "on mainnet against the previously accepted canonical ABI",
  ),
);
observation.sourceProvenance = {
  ...provenance,
  interpretation:
    "The fresh mainnet proxy returns 1.4.6 with unchanged runtime and implementation history. Its full ABI matches the freshly retrieved fully verified mainnet provider generation and the accepted canonical ABI. Historical cross-network reconciliation remains in the August 27 evidence; no new testnet verification is claimed.",
};
observation.observationBlock = block;
observation.supersedes = supersedes;
const contractEvidence = {
  ...oldContracts,
  id: contractId,
  verifiedAt: capturedAt,
  reviewAfter,
  observedFrom: capturedAt,
  observedThrough: capturedAt,
  scope: { networkIds: ["mezo-mainnet"], deploymentIds: [deployment.id] },
  networkSnapshots: [snapshot],
  observations: [observation],
  captureReference,
  captureSha256,
  methodology: objectsToStrings(oldContracts.methodology).map((method) =>
    method.replace(
      "both fully verified provider-upgraded Mezo generation ABIs",
      "the fully verified mainnet provider-generation ABI and the accepted canonical ABI",
    ),
  ),
  limitations: [
    ...objectsToStrings(oldContracts.limitations).map((limitation) =>
      limitation.replace("both Mezo explorers", "the mainnet explorer within this capture"),
    ),
    "mainnet evidence refresh reverified mainnet only. Testnet August 27 evidence remains expired and blocks full-registry acceptance.",
  ],
};
const priceObservations = objects(oldPrices.observations, "price observations")
  .filter(({ networkId }) => networkId === "mezo-mainnet")
  .map((entry) => structuredClone(entry));
for (const entry of priceObservations) {
  entry.id = text(entry.id, "observation id").replace("2026-08-27", date);
  entry.observedAt = capturedAt;
  entry.block = block;
}
const newSkip = priceObservations[0];
const newPyth = priceObservations[1];
assert(newSkip && newPyth, "mainnet price observations missing");
newSkip.rawDatum = {
  price: round.answer,
  expo: -18,
  decimals: 18,
  roundId: round.roundId,
  startedAt: round.startedAt,
  updatedAt: round.updatedAt,
  answeredInRound: round.answeredInRound,
  confidence: null,
};
object(newSkip.protocolAdapterObservation, "adapter observation").fetchPrice = adapter.fetchPrice;
object(newPyth.proxy, "price proxy").activationHistoryReference = {
  moduleId: "contracts",
  resourceId: contractId,
  recordId: observation.id,
};
const priceEvidence = {
  ...oldPrices,
  id: priceId,
  verifiedAt: capturedAt,
  reviewAfter,
  scope: { ...object(oldPrices.scope, "price scope"), networkIds: ["mezo-mainnet"] },
  networkSnapshots: [snapshot],
  observations: priceObservations,
  captureReference,
  captureSha256,
  limitations: [
    ...objectsToStrings(oldPrices.limitations).map((limitation) =>
      limitation.replace("on both networks", "on mainnet"),
    ),
    "Mainnet-only re-verification. Testnet evidence remains expired; no Pyth liveness or public reader support is promoted.",
  ],
};
deployment.runtime = {
  ...object(deployment.runtime, "runtime"),
  observedAt: capturedAt,
  blockNumber: block.number,
  blockHash: block.hash,
};
deployment.evidenceReference = {
  moduleId: "contracts",
  resourceId: contractId,
  recordId: observation.id,
};
const config = object(
  object(deployment.provenanceEvidence, "provenance").liveConfiguration,
  "live configuration",
);
config.activationHistoryReference = deployment.evidenceReference;
config.configurationReference = { moduleId: "prices", resourceId: priceId, recordId: newPyth.id };
config.networkEvidenceReference = config.configurationReference;
const contractPath = `evidence/oracle-contracts-mezo-mainnet-${date}.json`;
const pricePath = `evidence/fixed-block-observations-mezo-mainnet-${date}.json`;
addResource(contractIndex, {
  id: captureId,
  role: "artifact",
  kind: "price-source-capture",
  path: captureRelative,
});
addResource(
  contractIndex,
  {
    id: contractId,
    role: "evidence",
    kind: "contract-observation-set",
    path: contractPath,
    recordIds: [observation.id],
    recordCollectionPointer: "/observations",
  },
  "contract-reference",
);
addResource(
  priceIndex,
  {
    id: priceId,
    role: "evidence",
    kind: "price-fixed-block-observation-set",
    path: pricePath,
    recordIds: priceObservations.map(({ id }) => id),
    recordCollectionPointer: "/observations",
  },
  "price-reference",
);
object(priceIndex.extensions, "price extensions").currentEvidenceByNetwork = {
  "mezo-mainnet": { moduleId: "prices", resourceId: priceId },
  "mezo-testnet": { moduleId: "prices", resourceId: oldPrices.id },
};
const pythSource = find(sourceFeeds.sources, "id", "source.pyth-core-v1");
pythSource.currentEvidenceByNetwork = object(
  priceIndex.extensions,
  "extensions",
).currentEvidenceByNetwork;
const encodedPrices = encode(priceEvidence);
const sourceId = `price-fixed-block-capture-mezo-mainnet-${date}`;
const sourceRecords = objects(priceSources.records, "price sources").filter(
  ({ id }) => id !== sourceId,
);
sourceRecords.push({
  id: sourceId,
  kind: "fixed-block-read-only-probes",
  reference: { moduleId: "prices", resourceId: priceId },
  sha256: createHash("sha256").update(encodedPrices).digest("hex"),
  retrievedAt: capturedAt,
  establishes: "Mainnet-only full re-verification; testnet freshness is not renewed.",
});
priceSources.records = sourceRecords;
find(priceIndex.resources, "id", "price-sources").recordIds = sourceRecords.map(({ id }) => id);
// All comparison gates precede writes. Older evidence bytes and testnet records stay unchanged.
await mkdir(resolve(root, "knowledge/contracts/artifacts/oracle-captures"), { recursive: true });
await writeFile(resolve(root, "knowledge/contracts", captureRelative), captureBytes);
for (const [path, value] of [
  [`knowledge/contracts/${contractPath}`, contractEvidence],
  [`knowledge/prices/${pricePath}`, priceEvidence],
  ["knowledge/contracts/records/deployments.json", deployments],
  ["knowledge/contracts/index.json", contractIndex],
  ["knowledge/prices/index.json", priceIndex],
  ["knowledge/prices/sources/catalog.json", priceSources],
  ["knowledge/prices/records/sources-feeds.json", sourceFeeds],
] as const)
  await writeFile(resolve(root, path), encode(value));
process.stdout.write(`Imported ${contractId} and ${priceId}; testnet freshness unchanged.\n`);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string): void {
  assert(isDeepStrictEqual(actual, expected), message);
}
async function json(path: string): Promise<JsonObject> {
  return object(parseJson(await readFile(resolve(root, path), "utf8"), path), path);
}
function find(value: unknown, field: string, expected: string): JsonObject {
  const found = objects(value, field).find((entry) => entry[field] === expected);
  assert(found, `missing ${expected}`);
  return found;
}
function encode(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
function objectsToStrings(value: unknown): string[] {
  assert(
    Array.isArray(value) && value.every((item: unknown) => typeof item === "string"),
    "limitations must be strings",
  );
  return value;
}
function addResource(index: JsonObject, resource: JsonObject, generatedId?: string): void {
  const resources = objects(index.resources, "resources").filter(({ id }) => id !== resource.id);
  resources.push(resource);
  index.resources = resources;
  if (generatedId) {
    const generated = find(resources, "id", generatedId);
    const refs = objects(generated.generatedFrom, "generatedFrom").filter(
      ({ resourceId }) => resourceId !== resource.id,
    );
    refs.push({ moduleId: index.moduleId, resourceId: resource.id });
    generated.generatedFrom = refs;
  }
}
