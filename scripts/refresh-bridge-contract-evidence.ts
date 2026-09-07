import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type contractBaselineEvidenceShape from "../knowledge/contracts/evidence/bridge-contracts-2026-08-24.json";
import type contractAbisShape from "../knowledge/contracts/records/abis.json";
import type contractDeploymentsShape from "../knowledge/contracts/records/deployments.json";
import type contractSourcesShape from "../knowledge/contracts/sources/catalog.json";
import type contractsIndexShape from "../knowledge/contracts/index.json";
import type bridgeNativeEvidenceShape from "../knowledge/workflows/bridges/evidence/native-mainnet-2026-08-18.json";
import type bridgesIndexShape from "../knowledge/workflows/bridges/index.json";
import type bridgeRolesShape from "../knowledge/workflows/bridges/records/contracts.json";
import type bridgeSourcesShape from "../knowledge/workflows/bridges/sources/catalog.json";
import { object, parseJson, texts } from "./lib/json.ts";

type DeploymentRecord = (typeof contractDeploymentsShape)["records"][number];

interface CaptureBlock {
  number: number;
  hash: string;
  timestamp: string;
}

interface CaptureNetwork {
  chainId: number;
  rpcUrl: string;
  clientVersion: string;
  snapshot: CaptureBlock;
  blocks: Record<number, CaptureBlock>;
  contracts: Record<string, { code: string }>;
}

interface BoundaryCall {
  error: { code: number; message: string };
}

interface BridgeCapture {
  schemaVersion: number;
  capturedAt: string;
  networks: Record<string, CaptureNetwork>;
  assetsBridgeV13Calls: {
    selector: string;
    immediatelyBeforeActivation: BoundaryCall;
    activationBlock: unknown;
    latest: unknown;
  };
}

const [capturePath] = process.argv.slice(2);
if (!capturePath) {
  throw new Error("usage: node scripts/refresh-bridge-contract-evidence.ts <capture-json>");
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsRoot = join(repositoryRoot, "knowledge", "contracts");
const bridgesRoot = join(repositoryRoot, "knowledge", "workflows", "bridges");
const v13ActivationBlock = 11_358_000;
const historicalDeploymentId =
  "bridge.native-assets-precompile@mezo-mainnet#v6-wrapper-v5-execution";
const currentDeploymentId = "bridge.native-assets-precompile@mezo-mainnet#v6-wrapper-v6-execution";
const currentObservationId = "observe-bridge-native-assets-precompile-mezo-mainnet-v6-execution";
const reviewWindowMilliseconds = 30 * 24 * 60 * 60 * 1_000;

const capture = await readJson<BridgeCapture>(resolve(capturePath));
assert(capture.schemaVersion === 1, "capture schemaVersion must be 1");
assertTimestamp(capture.capturedAt, "capture capturedAt");

const mezo = capture.networks["mezo-mainnet"];
assert(mezo, "capture is missing mezo-mainnet");
assert(
  mezo.clientVersion.startsWith("Mezod/13.0.0/"),
  `expected the v13 client, received ${mezo.clientVersion}`,
);
assert(
  mezo.snapshot.number >= v13ActivationBlock,
  `Mezo block ${mezo.snapshot.number} has not reached v13 block ${v13ActivationBlock}`,
);
const activationBlock = mezo.blocks[v13ActivationBlock];
assert(activationBlock?.number === v13ActivationBlock, "v13 activation block is missing");

const boundaryCalls = capture.assetsBridgeV13Calls;
assert(boundaryCalls.selector === "0x8210110d", "v13 selector proof is missing");
assert(
  boundaryCalls.immediatelyBeforeActivation.error.message.includes(
    "method not found in precompile",
  ),
  "generation-6 selector unexpectedly succeeded before v13",
);
const activationChains = decodeUint8Array(boundaryCalls.activationBlock);
const latestChains = decodeUint8Array(boundaryCalls.latest);
assert(
  activationChains.length === 2 && activationChains[0] === 0 && activationChains[1] === 1,
  "v13 activation did not seed the expected Ethereum and Bitcoin bridge-out chains",
);
assert(
  latestChains.length === activationChains.length &&
    latestChains.every((value, index) => value === activationChains[index]),
  "latest bridge-out chains differ from the activation state",
);

const capturedPrecompile = mezo.contracts["bridge.native-assets-precompile"];
assert(capturedPrecompile, "Assets Bridge precompile is missing from the capture");
const currentCodeSha256 = bytecodeSha256(capturedPrecompile.code);

const contractsIndexPath = join(contractsRoot, "index.json");
const contractsIndex = await readJson<typeof contractsIndexShape>(contractsIndexPath);
const baselineResource = contractsIndex.resources.find(
  (resource) =>
    resource.role === "evidence" && /^contract-bridge-probes-\d{4}-\d{2}-\d{2}$/.test(resource.id),
);
assert(baselineResource, "indexed pre-v13 bridge evidence resource is missing");
const baselineEvidencePath = join(contractsRoot, baselineResource.path);
const baselineEvidence = await readJson<typeof contractBaselineEvidenceShape>(baselineEvidencePath);
const historicalObservation = baselineEvidence.observations.find(
  (observation) => observation.deploymentId === historicalDeploymentId,
);
assert(historicalObservation, "historical Assets Bridge observation is missing");
assert(
  historicalObservation.runtime.addressCodeSha256 === currentCodeSha256,
  "Assets Bridge wrapper bytecode changed across v13; source review is required",
);
const lastPriorCodeBlock = historicalObservation.runtime.lastPriorCodeBlock;
assert(lastPriorCodeBlock, "historical Assets Bridge prior code block is missing");

const activation = {
  blockNumber: activationBlock.number,
  transactionHash: null,
  blockHash: activationBlock.hash,
  blockTimestamp: activationBlock.timestamp,
  activationKind: "hard-fork",
  release: "v13.0.0",
};
const currentObservation = {
  ...historicalObservation,
  id: currentObservationId,
  deploymentId: currentDeploymentId,
  observedAt: capture.capturedAt,
  observationBlock: {
    number: mezo.snapshot.number,
    hash: mezo.snapshot.hash,
    timestamp: mezo.snapshot.timestamp,
  },
  methods: unique([
    ...historicalObservation.methods.filter((method) => !method.startsWith("fresh pre-v13")),
    "web3_clientVersion post-v13 boundary check",
    "eth_call generation-6 selector immediately before and at activation",
    "eth_call generation-6 selector at latest block",
  ]),
  activation,
  runtime: {
    addressCodeSha256: currentCodeSha256,
    implementationCodeSha256: null,
    sourceBytecodeSha256: historicalObservation.runtime.sourceBytecodeSha256,
    liveClientVersion: mezo.clientVersion,
    activeExecutionVersion: 6,
    wrapperInterfaceGeneration: 6,
    wrapperInstalledAtBlock: lastPriorCodeBlock.number + 1,
    v13ActivationBlock: activationBlock.number,
    enabledBridgeOutChainsAtActivation: activationChains,
    enabledBridgeOutChainsAtObservation: latestChains,
    selectorBoundaryProof: {
      selector: boundaryCalls.selector,
      immediatelyBeforeActivation: {
        blockNumber: v13ActivationBlock - 1,
        outcome: "method-not-found",
        errorCode: boundaryCalls.immediatelyBeforeActivation.error.code,
      },
      activation: {
        blockNumber: v13ActivationBlock,
        decodedResult: activationChains,
      },
      latest: {
        blockNumber: mezo.snapshot.number,
        decodedResult: latestChains,
      },
    },
  },
};

const evidenceDate = capture.capturedAt.slice(0, 10);
const evidenceId = `contract-bridge-v13-probes-${evidenceDate}`;
const evidenceRelativePath = `evidence/bridge-v13-contracts-${evidenceDate}.json`;
const evidencePath = join(contractsRoot, evidenceRelativePath);
const reviewAfter = new Date(
  Date.parse(capture.capturedAt) + reviewWindowMilliseconds,
).toISOString();
const evidence = {
  schemaVersion: 1,
  kind: "contract-observation-set",
  id: evidenceId,
  owner: "contracts-registry",
  status: "verified",
  supportStatus: "none",
  reviewStatus: "accepted",
  verifiedAt: capture.capturedAt,
  reviewAfter,
  scope: {
    networkIds: ["mezo-mainnet"],
    deploymentIds: [currentDeploymentId],
  },
  limitations: [
    "This observation proves the v13 Assets Bridge execution boundary only; it does not create route, quote, relayer, or writer support.",
    "bridge evidence review accepted the generation-6 deployment for bounded registry use; route, quote, relayer, and writer support remain absent.",
    "Enabled bridge-out chains are volatile state and do not prove end-to-end delivery, asset support, or availability.",
  ],
  observedFrom: capture.capturedAt,
  observedThrough: capture.capturedAt,
  methodology: [
    "Pinned the official v13 Assets Bridge version map, upgrade handler, ABI, interface, and wrapper bytecode by exact source commit.",
    "Captured Mezo chain identity, live client version, latest block identity, activation-block identity, and current precompile bytecode.",
    "Confirmed wrapper-v6 bytecode continuity against the accepted pre-v13 observation.",
    "Called the generation-6-only getBridgeOutChains selector immediately before and at activation to prove the execution-version transition.",
    "Decoded the activation and latest results as enabled target chains 0 (Ethereum) and 1 (Bitcoin) without submitting a transaction.",
  ],
  networkSnapshots: [
    {
      networkId: "mezo-mainnet",
      evmChainId: mezo.chainId,
      blockNumber: mezo.snapshot.number,
      blockHash: mezo.snapshot.hash,
      blockTimestamp: mezo.snapshot.timestamp,
      rpcUrl: mezo.rpcUrl,
      explorerApiUrl: "https://api.explorer.mezo.org",
    },
  ],
  observations: [currentObservation],
};

const existingV13ResourceIndex = contractsIndex.resources.findIndex(
  (resource) =>
    resource.role === "evidence" &&
    /^contract-bridge-v13-probes-\d{4}-\d{2}-\d{2}$/.test(resource.id),
);
const v13Resource = {
  id: evidenceId,
  role: "evidence",
  kind: "contract-observation-set",
  path: evidenceRelativePath,
  recordIds: [currentObservationId],
  recordCollectionPointer: "/observations",
};
if (existingV13ResourceIndex === -1) {
  contractsIndex.resources.push(v13Resource);
} else {
  contractsIndex.resources[existingV13ResourceIndex] = v13Resource;
}
contractsIndex.verifiedAt = capture.capturedAt;
const deploymentResource = contractsIndex.resources.find(
  (resource) => resource.id === "contract-deployments",
);
assert(deploymentResource, "contract deployment resource is missing");
deploymentResource.recordIds = unique([
  ...texts(deploymentResource.recordIds, "contract deployment record IDs"),
  currentDeploymentId,
]);

baselineEvidence.reviewAfter = reviewAfter;
baselineEvidence.limitations = baselineEvidence.limitations.map((item) =>
  item.startsWith("This pre-v13 recheck")
    ? `This observation is the accepted pre-v13 boundary. Post-v13 execution is recorded separately by Contracts resource ${evidenceId}.`
    : item.startsWith("The 6-hour review window")
      ? "The historical boundary is retained for activation provenance; current behavior must resolve through the post-v13 evidence resource."
      : item,
);

const deploymentsPath = join(contractsRoot, "records", "deployments.json");
const deployments = await readJson<typeof contractDeploymentsShape>(deploymentsPath);
deployments.verifiedAt = capture.capturedAt;
const historicalDeployment = deployments.records.find(
  (deployment) => deployment.id === historicalDeploymentId,
);
assert(historicalDeployment, "historical Assets Bridge deployment is missing");
const historicalProvenance = object(
  historicalDeployment.provenanceEvidence,
  "historical Assets Bridge provenance",
);
const historicalClientPrecompile = object(
  historicalProvenance.clientPrecompile,
  "historical Assets Bridge client provenance",
);
historicalDeployment.validity.effectiveUntilExclusive = activation;
historicalDeployment.status = "verified-superseded";
historicalDeployment.supportStatus = "historical";
historicalDeployment.limitations = [
  "This accepted record is historical after v13 activated Assets Bridge execution generation 6 at block 11358000.",
  "Its wrapper bytecode remains installed, but generation-5 method availability must not be used for post-v13 calls.",
  "registry provenance review registry acceptance created no route, quote, relayer, or writer support.",
];

const currentDeployment = {
  ...structuredClone(historicalDeployment),
  id: currentDeploymentId,
  validity: {
    deploymentFrom: activation,
    currentCodeFrom: historicalDeployment.validity.currentCodeFrom,
    effectiveUntilExclusive: null,
  },
  runtime: {
    observedAt: capture.capturedAt,
    blockNumber: mezo.snapshot.number,
    blockHash: mezo.snapshot.hash,
    addressCodeSha256: currentCodeSha256,
    implementationCodeSha256: null,
  },
  provenanceEvidence: {
    clientPrecompile: {
      ...historicalClientPrecompile,
      release: "v13.0.0",
      liveClientGeneration: `${mezo.clientVersion} with Assets Bridge execution generation 6 and wrapper-v6 bytecode; generation-6-only selector availability is proven at block ${v13ActivationBlock}.`,
      fixedBlockReference: {
        moduleId: "contracts",
        resourceId: evidenceId,
        recordId: currentObservationId,
      },
      activationBoundaryReference: {
        moduleId: "contracts",
        resourceId: evidenceId,
        recordId: currentObservationId,
      },
      nodeVersionEvidenceReference: {
        moduleId: "contracts",
        resourceId: evidenceId,
        recordId: currentObservationId,
      },
    },
  },
  evidenceReference: {
    moduleId: "contracts",
    resourceId: evidenceId,
    recordId: currentObservationId,
  },
  status: "verified-current",
  supportStatus: "supported",
  reviewStatus: "accepted",
  limitations: [
    "The v13 client executes Assets Bridge generation 6 with the previously installed wrapper-v6 bytecode.",
    "The generation-6-only getBridgeOutChains selector is proven at activation and latest, but other mutable state and every writer precondition require fresh reads and exact-call simulation.",
    "bridge evidence review accepted this generation-6 deployment for bounded registry use; it creates no route, quote, relayer, or writer support.",
  ],
} as DeploymentRecord;
const currentDeploymentIndex = deployments.records.findIndex(
  (deployment) => deployment.id === currentDeploymentId,
);
if (currentDeploymentIndex === -1) deployments.records.push(currentDeployment);
else deployments.records[currentDeploymentIndex] = currentDeployment;
const supportedDeployments = deployments.records.filter(
  (deployment) => deployment.supportStatus === "supported",
).length;
const proposedDeployments = deployments.records.filter(
  (deployment) => deployment.supportStatus === "proposed",
).length;
const historicalDeployments = deployments.records.filter(
  (deployment) => deployment.supportStatus === "historical",
).length;
deployments.limitations = deployments.limitations.map((item) =>
  item.startsWith("The catalog contains")
    ? `The catalog contains ${supportedDeployments} supported deployments, ${proposedDeployments} proposed deployments, and ${historicalDeployments} superseded historical deployments; record-level lifecycle and provenance govern use.`
    : item,
);

const abisPath = join(contractsRoot, "records", "abis.json");
const abis = await readJson<typeof contractAbisShape>(abisPath);
const assetsBridgeAbi = abis.records.find(
  (record) => record.id === "bridge.native-assets-precompile",
);
assert(assetsBridgeAbi, "Assets Bridge ABI record is missing");
const assetsBridgeSourceArtifact = assetsBridgeAbi.sourceArtifacts.find(
  (artifact) =>
    "version" in artifact && "networkId" in artifact && artifact.networkId === "mezo-mainnet",
);
assert(assetsBridgeSourceArtifact, "Assets Bridge ABI source artifact is missing");
assert("version" in assetsBridgeSourceArtifact, "Assets Bridge ABI source version is missing");
assetsBridgeSourceArtifact.version = "wrapper-v6/execution-v6";
assetsBridgeAbi.limitations = [
  "The accepted full wrapper-v6 ABI matches the installed bytecode and official v13 source.",
  "Generation-6-only selector availability is proven at the v13 activation boundary; ABI acceptance does not create route or writer support.",
];

const sourcesPath = join(contractsRoot, "sources", "catalog.json");
const sources = await readJson<typeof contractSourcesShape>(sourcesPath);
sources.verifiedAt = capture.capturedAt;
const nativeBridgeEvidenceSource = sources.sources.find(
  (source) => source.id === "native-bridge-etherscan-executable-reproduction",
);
assert(nativeBridgeEvidenceSource, "Native Bridge evidence source is missing");
nativeBridgeEvidenceSource.sha256 = textSha256(jsonText(baselineEvidence));
nativeBridgeEvidenceSource.retrievedAt = capture.capturedAt;
const assetsBridgeSource = sources.sources.find(
  (source) => source.id === "official-mezod-assets-bridge-current",
);
assert(assetsBridgeSource, "Assets Bridge source record is missing");
assetsBridgeSource.note =
  "Exact official Assets Bridge wrapper-v6 interface, ABI, runtime bytecode, and version-map source matching the installed wrapper and active v13 execution generation 6.";
const upgradeScheduleSource = sources.sources.find(
  (source) => source.id === "official-mezod-v13-upgrade-schedule",
);
assert(upgradeScheduleSource, "v13 schedule source record is missing");
upgradeScheduleSource.note =
  "Official upgrade schedule that established v13.0.0 activation at Mezo Mainnet block 11358000; deployed activation is proven by the post-v13 observation resource.";

const bridgesIndexPath = join(bridgesRoot, "index.json");
const bridgesIndex = await readJson<typeof bridgesIndexShape>(bridgesIndexPath);
bridgesIndex.verifiedAt = capture.capturedAt;
bridgesIndex.reviewAfter = reviewAfter;
bridgesIndex.extensions.currentContractEvidenceReference = {
  moduleId: "contracts",
  resourceId: evidenceId,
};
bridgesIndex.extensions.blockers = unique(
  bridgesIndex.extensions.blockers.filter(
    (blocker) =>
      !blocker.includes("qualified Contracts review") &&
      !blocker.includes("qualified bridge and security review") &&
      !blocker.includes("v13") &&
      !blocker.includes("scheduled") &&
      !blocker.includes("post-v13"),
  ),
);

const roleMapPath = join(bridgesRoot, "records", "contracts.json");
const roleMap = await readJson<typeof bridgeRolesShape>(roleMapPath);
roleMap.verifiedAt = capture.capturedAt;
roleMap.reviewAfter = reviewAfter;
roleMap.limitations = roleMap.limitations.map((item) =>
  item.startsWith("The August 18 Native evidence")
    ? `The August 18 Native evidence remains historical. Accepted Contracts evidence ${evidenceId} proves v13 execution generation 6 for current behavior; route and writer support remain absent.`
    : item,
);
const nativeRole = roleMap.records.find(
  (record) => record.id === "native-assets-bridge-mezo-mainnet",
);
assert(nativeRole, "Native Assets Bridge role is missing");
nativeRole.deploymentReference.recordId = currentDeploymentId;

const nativeEvidencePath = join(bridgesRoot, "evidence", "native-mainnet-2026-08-18.json");
const nativeEvidence = await readJson<typeof bridgeNativeEvidenceShape>(nativeEvidencePath);
nativeEvidence.verifiedAt = capture.capturedAt;
nativeEvidence.reviewAfter = reviewAfter;
nativeEvidence.methodology = unique([
  ...nativeEvidence.methodology.filter((item) => !item.includes("remained pre-v13")),
  `Re-reviewed the historical lifecycle evidence against Contracts resource ${evidenceId}; wrapper-v6 bytecode remained exact and generation-6-only selector behavior changed precisely at v13 block ${v13ActivationBlock}.`,
]);
nativeEvidence.limitations = nativeEvidence.limitations.map((item) =>
  item.startsWith("The Mezo runtime in this evidence remains historical")
    ? `The Mezo runtime in this evidence remains historical. Current execution identity resolves through accepted Contracts resource ${evidenceId}, which proves wrapper-v6/execution-generation-6 behavior after block ${v13ActivationBlock}.`
    : item,
);

const bridgeSourcesPath = join(bridgesRoot, "sources", "catalog.json");
const bridgeSources = await readJson<typeof bridgeSourcesShape>(bridgeSourcesPath);
const nativeEvidenceArtifact = bridgeSources.evidenceArtifacts.find(
  (artifact) => artifact.id === "bridge-native-evidence",
);
assert(nativeEvidenceArtifact, "Native Bridge workflow evidence artifact is missing");
nativeEvidenceArtifact.sha256 = textSha256(jsonText(nativeEvidence));

await Promise.all([
  writeJson(evidencePath, evidence),
  writeJson(baselineEvidencePath, baselineEvidence),
  writeJson(contractsIndexPath, contractsIndex),
  writeJson(deploymentsPath, deployments),
  writeJson(abisPath, abis),
  writeJson(sourcesPath, sources),
  writeJson(bridgesIndexPath, bridgesIndex),
  writeJson(roleMapPath, roleMap),
  writeJson(nativeEvidencePath, nativeEvidence),
  writeJson(bridgeSourcesPath, bridgeSources),
]);

process.stdout.write(
  `Recorded accepted Assets Bridge v13 execution generation 6 as ${evidenceId}; route and writer support remain absent.\n`,
);

function decodeUint8Array(value: unknown): number[] {
  assert(
    typeof value === "string" && /^0x(?:[a-fA-F0-9]{64})+$/.test(value),
    "invalid ABI-encoded uint8 array",
  );
  const words = value
    .slice(2)
    .match(/.{64}/g)
    ?.map((word) => BigInt(`0x${word}`));
  assert(words && words.length >= 2, "uint8 array result is incomplete");
  assert(words[0] === 32n, "uint8 array offset is invalid");
  const length = Number(words[1]);
  assert(Number.isSafeInteger(length), "uint8 array length is unsafe");
  assert(words.length === length + 2, "uint8 array length does not match payload");
  return words.slice(2).map((word) => {
    assert(word <= 255n, "uint8 array contains an out-of-range value");
    return Number(word);
  });
}

function bytecodeSha256(value: string): string {
  assert(/^0x(?:[a-fA-F0-9]{2})+$/.test(value), "invalid bytecode");
  return createHash("sha256")
    .update(Buffer.from(value.slice(2), "hex"))
    .digest("hex");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertTimestamp(value: unknown, label: string): void {
  assert(typeof value === "string" && Number.isFinite(Date.parse(value)), `${label} is invalid`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, jsonText(value), "utf8");
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function textSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
