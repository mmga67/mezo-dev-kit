import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, parseJson, text, type JsonObject } from "./lib/json.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = join(root, "knowledge", "workflows", "bridges");
interface Reference extends JsonObject {
  moduleId: string;
  resourceId: string;
  recordId?: string;
}
interface Envelope extends JsonObject {
  id: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  owner: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: unknown[];
  workflowStatus?: string;
  evidenceStatus?: string;
}
interface Index extends Envelope {
  schemaVersion: number;
  knowledgeVersion: string;
  kind: string;
  moduleId: string;
  extensions: JsonObject & {
    workflowStatus: string;
    canonicalNetworkReferences: Reference[];
    contractRoleMapReference: Reference;
  };
}
interface IdRecord extends JsonObject {
  id: string;
}
interface ProviderCatalog extends Envelope {
  records: IdRecord[];
}
interface Representation extends JsonObject {
  id: string;
  network: string;
  deploymentObservation?: string;
  evidenceObservation?: string;
}
interface AssetRecord extends IdRecord {
  representations: Representation[];
}
interface AssetCatalog extends Envelope {
  records: AssetRecord[];
}
interface Route extends IdRecord {
  providerId: string;
  assetId: string;
  sourceRepresentationId: string;
  destinationRepresentationId: string;
  status: string;
  configurationEvidence: string[];
  completedTransferEvidence: string;
}
interface RouteCatalog extends Envelope {
  records: Route[];
}
interface ContractRole extends IdRecord {
  providerId: string;
  networkId: string;
  evidenceObservationId: string;
  deploymentReference: Reference;
  abiReference: Reference;
  role: string;
}
interface RoleMap extends Envelope {
  scope: { networkIds: string[] };
  networkReferences: Reference[];
  evidenceReferences: Reference[];
  records: ContractRole[];
}
interface LifecycleState extends IdRecord {
  terminal: boolean;
}
interface Lifecycle extends Envelope {
  providerId: string;
  states: LifecycleState[];
}
interface NativeLifecycle extends Envelope {
  providerId: string;
  sharedStates: LifecycleState[];
  directions: unknown[];
}
interface SourceArtifact extends IdRecord {
  sha256: string;
  evidenceReference: Reference;
}
interface Sources extends Envelope {
  sources: IdRecord[];
  evidenceArtifacts: SourceArtifact[];
}
interface NetworkSnapshot extends IdRecord {
  blockHash: string;
  blockNumber: number;
  chainId?: number;
}
interface Peer extends JsonObject {
  manager: string;
  transceiver: string;
  tokenDecimals: number;
}
interface HistoryBoundary extends JsonObject {
  lastMatchingBlock: number;
  currentWrapperFromBlock: number;
  currentDeploymentReference: Reference;
}
interface DeploymentObservation extends IdRecord {
  managerAddress: string;
  transceiverAddress: string;
  transceiverManagerBinding: string;
  threshold: number;
  paused: boolean;
  peers: Peer[];
  address: string;
  sourceBTCToken: string;
  historicalCodeBoundary: HistoryBoundary;
  currentSourceSequenceTip: number;
  blockObservation: string;
  implementations: ImplementationGeneration[];
  currentFixedBlock: CurrentProxy;
}
interface TransferEndpoint extends JsonObject {
  transactionHash: string;
  blockHash: string;
  receiptStatus: string;
  event: string;
  blockNumber: number;
  implementation?: string;
  recipientBalanceAfterRaw: string;
  recipientBalanceBeforeRaw: string;
  postSequenceTip: number;
  preSequenceTip: number;
  withdrawalFeeRaw: string;
  recipientAmountRaw: string;
}
interface Transfer extends IdRecord {
  source: TransferEndpoint;
  destination: TransferEndpoint;
  transferDigest: string;
  providerId: string;
  sequence: number;
  recipient: string;
  sourceToken: string;
  destinationToken: string;
  completionProof: string;
  amountRaw: string;
  grossAmountRaw: string;
  recipientHash: string;
  sourceNetwork: string;
  destinationNetwork: string;
}
interface OfficialSource extends JsonObject {
  tag: string;
  commit: string;
  liveClientVersion: string;
}
interface Erc20Mapping extends JsonObject {
  sourceToken: string;
  mezoToken: string;
}
interface EvidenceSet extends Envelope {
  kind: string;
  methodology: unknown[];
  networkSnapshots: NetworkSnapshot[];
  deploymentObservations: DeploymentObservation[];
  completedTransfers: Transfer[];
  officialSource: OfficialSource;
  erc20Mappings: Erc20Mapping[];
}
interface ImplementationGeneration extends JsonObject {
  address: string;
  fromBlock: number;
  toBlockInclusive: number | null;
}
interface CurrentProxy extends JsonObject {
  blockObservation: string;
  implementation: string;
  proxyRuntimeByteLength: number;
  implementationRuntimeByteLength: number;
  proxyRuntimeSha256: string;
  implementationRuntimeSha256: string;
  sequence: number;
  tbtcToken: string;
  attestationThreshold: number;
  bridgeValidatorsCount: number;
  erc20TokensCount: number;
  maxERC20Tokens: number;
  owner: string;
  minTBTCAmountRaw: string;
  sampleERC20Minimum: { token: string; minERC20AmountRaw: string };
}
interface DeploymentValue extends JsonObject {
  address: string;
  networkId: string;
  contractId: string;
  status: string;
  supportStatus: string;
  reviewStatus: string;
  validity: { currentCodeFrom: { blockNumber: number } };
}
interface AbiValue extends JsonObject {
  contractId: string;
  supportStatus: string;
  reviewStatus: string;
  intendedNetworkIds: string[];
}

const readJson = async <T>(path: string): Promise<T> =>
  parseJson(await readFile(path, "utf8"), path) as T;
const load = async <T>(resourceId: string): Promise<T> =>
  (await loadKnowledgeReference(root, { moduleId: "workflows/bridges", resourceId })).document as T;
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const unique = (values: readonly (string | number)[], label: string): void => {
  assert(new Set(values).size === values.length, `${label} must be unique`);
};
const hash = /^0x[a-f0-9]{64}$/;
const address = /^0x[a-f0-9]{40}$/;
const sha256 = /^[a-f0-9]{64}$/;
const fileSha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const assertEnvelope = (record: Envelope, label: string, domainStatus?: string): void => {
  assert(record.status === "verified", `${label} common status is invalid`);
  assert(record.supportStatus === "none", `${label} support must remain none`);
  assert(record.reviewStatus === "accepted", `${label} qualified review is not recorded`);
  assert(record.owner === "workflows/bridges", `${label} owner is invalid`);
  assert(Number.isFinite(Date.parse(record.verifiedAt)), `${label} verifiedAt is invalid`);
  assert(Number.isFinite(Date.parse(record.reviewAfter)), `${label} reviewAfter is invalid`);
  assert(Date.parse(record.reviewAfter) > Date.now(), `${label} review window expired`);
  assert(
    Array.isArray(record.limitations) && record.limitations.length > 0,
    `${label} limitations are missing`,
  );
  if (domainStatus)
    assert(
      record.workflowStatus === domainStatus || record.evidenceStatus === domainStatus,
      `${label} domain status is invalid`,
    );
};

const index = await readJson<Index>(join(base, "index.json"));
assert(index.schemaVersion === 1, "bridge index schemaVersion must be 1");
assert(
  index.knowledgeVersion === "0.4" && index.kind === "knowledge-module-index",
  "bridge index must use v0.4",
);
assert(
  index.moduleId === "workflows/bridges" && index.id === index.moduleId,
  "bridge module identity is invalid",
);
assertEnvelope(index, "bridge index");
assert(
  index.extensions.workflowStatus === "evidence-verified-promotion-blocked",
  "bridge status must retain the promotion gate",
);
assert(index.supportStatus === "none", "bridge evidence must not imply route support");
assert(index.reviewStatus === "accepted", "bridge qualified review is not recorded");
for (const reference of index.extensions.canonicalNetworkReferences)
  await loadKnowledgeReference(root, reference);

const [
  providers,
  assets,
  routes,
  contractRoles,
  lifecycle,
  nativeLifecycle,
  sources,
  nttEvidence,
  nativeEvidenceResource,
] = await Promise.all([
  load<ProviderCatalog>("bridge-providers"),
  load<AssetCatalog>("bridge-assets"),
  load<RouteCatalog>("bridge-routes"),
  load<RoleMap>("bridge-contract-roles"),
  load<Lifecycle>("bridge-ntt-lifecycle"),
  load<NativeLifecycle>("bridge-native-lifecycle"),
  load<Sources>("bridge-sources"),
  load<EvidenceSet>("bridge-musd-ntt-evidence"),
  load<EvidenceSet>("bridge-native-evidence"),
]);
const envelopes: readonly (readonly [string, Envelope, string])[] = [
  ["providers", providers, "evidence-verified-promotion-blocked"],
  ["assets", assets, "evidence-verified-promotion-blocked"],
  ["routes", routes, "evidence-verified-promotion-blocked"],
  ["contract roles", contractRoles, "evidence-verified-promotion-blocked"],
  ["NTT lifecycle", lifecycle, "verified-source-model-not-supported"],
  ["Native lifecycle", nativeLifecycle, "verified-source-model-not-supported"],
  ["sources", sources, "evidence-verified-promotion-blocked"],
];
for (const [label, record, status] of envelopes) assertEnvelope(record, label, status);
const evidenceSets = [nttEvidence, nativeEvidenceResource];

const resolvedRoleMap = await loadKnowledgeReference(
  root,
  index.extensions.contractRoleMapReference,
);
assert(
  object(resolvedRoleMap.document, "resolved role map").id === contractRoles.id,
  "contract role-map reference differs",
);
assert(
  contractRoles.networkReferences.length === 3,
  "contract role map must reference all three canonical networks",
);
for (const reference of contractRoles.networkReferences) {
  const resolved = await loadKnowledgeReference(root, reference);
  const resolvedNetworkId = text(
    object(resolved.document, "resolved role-map network").id,
    "resolved role-map network ID",
  );
  assert(
    contractRoles.scope.networkIds.includes(resolvedNetworkId),
    `role-map network ${resolvedNetworkId} is outside scope`,
  );
}
for (const reference of contractRoles.evidenceReferences) {
  const resolved = await loadKnowledgeReference(root, reference);
  const resolvedEvidenceId = text(
    object(resolved.document, "resolved role-map evidence").id,
    "resolved role-map evidence ID",
  );
  assert(
    evidenceSets.some((evidence) => evidence.id === resolvedEvidenceId),
    `role-map evidence ${resolvedEvidenceId} is outside scope`,
  );
}

const providerIds = providers.records.map((item) => item.id);
const assetIds = assets.records.map((item) => item.id);
const representations = assets.records.flatMap((item) => item.representations);
const representationIds = representations.map((item) => item.id);
unique(providerIds, "provider IDs");
unique(assetIds, "asset IDs");
unique(representationIds, "representation IDs");
unique(
  routes.records.map((item) => item.id),
  "route IDs",
);
assert(
  providerIds.includes("wormhole-ntt") && providerIds.includes("mezo-native-bridge"),
  "provider separation is incomplete",
);
assert(lifecycle.providerId === "wormhole-ntt", "NTT lifecycle provider mismatch");
assert(nativeLifecycle.providerId === "mezo-native-bridge", "Native lifecycle provider mismatch");
assert(
  lifecycle.states.some((item) => item.id === "completed" && item.terminal),
  "NTT completion state is missing",
);
assert(
  lifecycle.states.some((item) => item.id === "ambiguous" && !item.terminal),
  "ambiguous evidence must remain non-terminal",
);
assert(
  nativeLifecycle.sharedStates.some((item) => item.id === "completed" && item.terminal),
  "Native completion state is missing",
);
assert(
  nativeLifecycle.directions.length === 2,
  "Native lifecycle must keep both provider directions explicit",
);

const deployments = new Map<string, DeploymentObservation>();
const transfers = new Map<string, Transfer>();
for (const evidence of evidenceSets) {
  assertEnvelope(evidence, evidence.id, "verified-evidence-not-support");
  assert(evidence.methodology.length >= 5, `${evidence.id} methodology is incomplete`);
  for (const snapshot of evidence.networkSnapshots) {
    assert(hash.test(snapshot.blockHash), `${snapshot.id} block hash is invalid`);
    assert(Number.isSafeInteger(snapshot.blockNumber), `${snapshot.id} block number is invalid`);
  }
  for (const deployment of evidence.deploymentObservations) {
    assert(!deployments.has(deployment.id), `duplicate deployment observation ${deployment.id}`);
    if (evidence.kind === "bridge-deployment-and-transfer-observation-set") {
      assert(
        address.test(deployment.managerAddress),
        `${deployment.id} manager address is invalid`,
      );
      assert(
        address.test(deployment.transceiverAddress),
        `${deployment.id} transceiver address is invalid`,
      );
      assert(
        deployment.transceiverManagerBinding === deployment.managerAddress,
        `${deployment.id} transceiver binding differs`,
      );
      assert(
        deployment.threshold > 0 && deployment.paused === false,
        `${deployment.id} is not an active unpaused snapshot`,
      );
      for (const peer of deployment.peers) {
        assert(/^0x[a-f0-9]{64}$/.test(peer.manager), `${deployment.id} peer manager is invalid`);
        assert(
          /^0x[a-f0-9]{64}$/.test(peer.transceiver),
          `${deployment.id} peer transceiver is invalid`,
        );
        assert(peer.tokenDecimals === 18, `${deployment.id} MUSD peer decimals differ`);
      }
    } else {
      assert(
        evidence.kind === "mezo-native-bridge-evidence",
        `${evidence.id} evidence kind is unknown`,
      );
      assert(address.test(deployment.address), `${deployment.id} address is invalid`);
    }
    deployments.set(deployment.id, deployment);
  }
  for (const transfer of evidence.completedTransfers) {
    assert(!transfers.has(transfer.id), `duplicate completed transfer ${transfer.id}`);
    assert(
      hash.test(transfer.source.transactionHash) && hash.test(transfer.destination.transactionHash),
      `${transfer.id} transaction hash is invalid`,
    );
    assert(
      hash.test(transfer.source.blockHash) && hash.test(transfer.destination.blockHash),
      `${transfer.id} block hash is invalid`,
    );
    assert(
      transfer.source.receiptStatus === "success",
      `${transfer.id} source receipt did not succeed`,
    );
    assert(
      transfer.destination.receiptStatus === "success",
      `${transfer.id} destination receipt did not succeed`,
    );
    if (evidence.kind === "bridge-deployment-and-transfer-observation-set") {
      assert(hash.test(transfer.transferDigest), `${transfer.id} digest is invalid`);
      assert(
        transfer.source.event === "TransferSent(bytes32)",
        `${transfer.id} source event is invalid`,
      );
      assert(
        transfer.destination.event === "TransferRedeemed(bytes32)",
        `${transfer.id} destination event is invalid`,
      );
    } else {
      assert(
        transfer.providerId === "mezo-native-bridge",
        `${transfer.id} Native provider mismatch`,
      );
      assert(
        Number.isSafeInteger(transfer.sequence) && transfer.sequence > 0,
        `${transfer.id} sequence is invalid`,
      );
      assert(address.test(transfer.recipient), `${transfer.id} recipient is invalid`);
      assert(
        address.test(transfer.sourceToken) && address.test(transfer.destinationToken),
        `${transfer.id} token identity is invalid`,
      );
      assert(
        typeof transfer.completionProof === "string" && transfer.completionProof.length > 0,
        `${transfer.id} completion proof is missing`,
      );
      if (transfer.id === "native-usdc-ethereum-to-mezo-completed") {
        assert(
          BigInt(transfer.destination.recipientBalanceAfterRaw) -
            BigInt(transfer.destination.recipientBalanceBeforeRaw) ===
            BigInt(transfer.amountRaw),
          "Native inbound recipient balance delta differs",
        );
        assert(
          transfer.destination.postSequenceTip - transfer.destination.preSequenceTip === 1,
          "Native inbound sequence did not advance by one",
        );
      }
      if (transfer.id === "native-btc-mezo-to-ethereum-completed") {
        assert(
          BigInt(transfer.destination.withdrawalFeeRaw) +
            BigInt(transfer.destination.recipientAmountRaw) ===
            BigInt(transfer.grossAmountRaw),
          "Native outbound gross/fee/net reconciliation differs",
        );
        assert(hash.test(transfer.recipientHash), "Native outbound recipient hash is invalid");
      }
    }
    transfers.set(transfer.id, transfer);
  }
}

const roleIds = contractRoles.records.map((record) => record.id);
unique(roleIds, "bridge contract role IDs");
assert(
  contractRoles.records.length === 8,
  "bridge role map must cover six NTT and two Native deployment roles",
);
for (const role of contractRoles.records) {
  assert(providerIds.includes(role.providerId), `${role.id} provider is absent`);
  assert(
    contractRoles.scope.networkIds.includes(role.networkId),
    `${role.id} network is outside role-map scope`,
  );
  const observed = deployments.get(role.evidenceObservationId);
  assert(observed, `${role.id} evidence observation is absent`);
  const [deploymentResult, abiResult] = await Promise.all([
    loadKnowledgeReference(root, role.deploymentReference),
    loadKnowledgeReference(root, role.abiReference),
  ]);
  const deployment = object(deploymentResult.value, `${role.id} deployment`) as DeploymentValue;
  const abi = object(abiResult.value, `${role.id} ABI`) as AbiValue;
  const observedAddress =
    role.role === "ntt-manager"
      ? observed.managerAddress
      : role.role === "wormhole-transceiver"
        ? observed.transceiverAddress
        : observed.address;
  assert(
    deployment.address === observedAddress,
    `${role.id} deployment address differs from bridge evidence`,
  );
  assert(deployment.networkId === role.networkId, `${role.id} deployment network differs`);
  assert(
    deployment.contractId === abi.contractId,
    `${role.id} deployment and ABI contract IDs differ`,
  );
  assert(deployment.status === "verified-current", `${role.id} deployment is not current`);
  assert(
    deployment.supportStatus === "supported",
    `${role.id} deployment registry support must be accepted`,
  );
  assert(
    deployment.reviewStatus === "accepted",
    `${role.id} deployment registry review must be accepted`,
  );
  assert(abi.supportStatus === "supported", `${role.id} ABI registry support must be accepted`);
  assert(abi.reviewStatus === "accepted", `${role.id} ABI registry review must be accepted`);
  assert(abi.intendedNetworkIds.includes(role.networkId), `${role.id} ABI network scope differs`);
  if (role.role === "native-assets-precompile") {
    const observedSnapshot = nativeEvidenceResource.networkSnapshots.find(
      (snapshot) => snapshot.id === observed.blockObservation,
    );
    assert(observedSnapshot !== undefined, `${role.id} evidence snapshot is missing`);
    assert(
      deployment.validity.currentCodeFrom.blockNumber > observedSnapshot.blockNumber,
      `${role.id} must preserve the historical-evidence/current-wrapper boundary`,
    );
  }
}

for (const representation of representations) {
  if (representation.deploymentObservation) {
    assert(
      deployments.has(representation.deploymentObservation),
      `${representation.id} deployment observation is missing`,
    );
  } else {
    assert(
      representation.evidenceObservation !== undefined,
      `${representation.id} evidence observation is missing`,
    );
    assert(
      deployments.has(representation.evidenceObservation) ||
        transfers.has(representation.evidenceObservation),
      `${representation.id} evidence observation is missing`,
    );
  }
}

for (const route of routes.records) {
  assert(providerIds.includes(route.providerId), `${route.id} provider is missing`);
  assert(assetIds.includes(route.assetId), `${route.id} asset is missing`);
  assert(
    representationIds.includes(route.sourceRepresentationId),
    `${route.id} source representation is missing`,
  );
  assert(
    representationIds.includes(route.destinationRepresentationId),
    `${route.id} destination representation is missing`,
  );
  assert(route.status === "evidence-verified-not-supported", `${route.id} must not imply support`);
  for (const id of route.configurationEvidence)
    assert(deployments.has(id), `${route.id} deployment evidence ${id} is missing`);
  const transfer = transfers.get(route.completedTransferEvidence);
  assert(transfer, `${route.id} completed transfer evidence is missing`);
  const source = representations.find((item) => item.id === route.sourceRepresentationId);
  const destination = representations.find((item) => item.id === route.destinationRepresentationId);
  assert(source !== undefined, `${route.id} source representation is missing`);
  assert(destination !== undefined, `${route.id} destination representation is missing`);
  assert(
    transfer.sourceNetwork === source.network,
    `${route.id} source network differs from evidence`,
  );
  assert(
    transfer.destinationNetwork === destination.network,
    `${route.id} destination network differs from evidence`,
  );
}

assert(
  routes.records.length === 6,
  "the evidence slice must account for four MUSD and two Native directions",
);
assert(transfers.size === 6, "each evidence-backed direction needs one completed transfer trace");
assert(
  sources.sources.some((item) => item.id === "official-source-musd-ntt-mainnet"),
  "pinned official NTT source is missing",
);
assert(
  sources.sources.some((item) => item.id === "official-mezod-native-bridge-v12"),
  "pinned official Native source is missing",
);
for (const artifact of sources.evidenceArtifacts) {
  assert(sha256.test(artifact.sha256), `${artifact.id} digest is invalid`);
  const resolved = await loadKnowledgeReference(root, artifact.evidenceReference);
  assert((await fileSha256(resolved.path)) === artifact.sha256, `${artifact.id} digest drifted`);
}

const nativeEvidence = evidenceSets.find(
  (item) => item.id === "mezo-native-bridge-mainnet-2026-08-18",
);
assert(nativeEvidence, "Native Bridge evidence set is missing");
assert(nativeEvidence.officialSource.tag === "v12.0.0", "Native source tag drifted");
assert(
  nativeEvidence.officialSource.commit === "95a5e0eddbbb92bb0b305185e2349af4c41ac63d",
  "Native source commit drifted",
);
assert(
  nativeEvidence.officialSource.liveClientVersion.startsWith("Mezod/12.0.0/"),
  "Native live client/source version differs",
);
const nativePrecompile = deployments.get("native-mezo-assets-bridge-v12");
assert(nativePrecompile !== undefined, "Native precompile observation is missing");
assert(
  nativePrecompile.address === "0x7b7c000000000000000000000000000000000012",
  "Native precompile address drifted",
);
assert(
  nativePrecompile.sourceBTCToken === "0x18084fba666a33d37592fa2633fd49a74dd93a88",
  "Native source tBTC drifted",
);
assert(
  nativePrecompile.historicalCodeBoundary.lastMatchingBlock === 11260863,
  "Native historical wrapper boundary drifted",
);
assert(
  nativePrecompile.historicalCodeBoundary.currentWrapperFromBlock === 11260864,
  "Native current wrapper boundary drifted",
);
const currentPrecompile = await loadKnowledgeReference(
  root,
  nativePrecompile.historicalCodeBoundary.currentDeploymentReference,
);
assert(
  object(currentPrecompile.value, "current Native precompile deployment").address ===
    nativePrecompile.address,
  "Native current precompile identity differs from historical evidence",
);
assert(nativeEvidence.erc20Mappings.length === 10, "Native fixed-block mapping inventory drifted");
assert(
  nativeEvidence.erc20Mappings.some(
    (item) =>
      item.sourceToken === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" &&
      item.mezoToken === "0x04671c72aab5ac02a03c1098314b1bb6b560c197",
  ),
  "Native USDC mapping is missing",
);
const proxyHistory = deployments.get("native-ethereum-mezo-bridge-proxy-history");
assert(proxyHistory !== undefined, "Native Ethereum proxy-history observation is missing");
assert(proxyHistory.implementations.length === 5, "Native Ethereum proxy history is incomplete");
for (let index = 0; index < proxyHistory.implementations.length - 1; index += 1) {
  const current =
    proxyHistory.implementations[index] ?? fail("Native proxy history entry is missing");
  const next =
    proxyHistory.implementations[index + 1] ?? fail("Native proxy history entry is missing");
  assert(
    current.toBlockInclusive !== null && current.toBlockInclusive + 1 === next.fromBlock,
    "Native Ethereum proxy history has a gap or overlap",
  );
}
const ethereumSnapshot = nativeEvidence.networkSnapshots.find(
  (item) => item.id === "native-ethereum-mainnet-snapshot",
);
assert(ethereumSnapshot?.chainId === 1, "Native Ethereum fixed-block snapshot is missing");
const currentProxy = proxyHistory.currentFixedBlock;
assert(
  currentProxy.blockObservation === ethereumSnapshot.id,
  "Native current proxy snapshot is not block-pinned",
);
assert(
  currentProxy.implementation === "0x1f8ed8193b902185c2bd495fe9b1963dc343ba87",
  "Native current implementation drifted",
);
assert(
  proxyHistory.implementations.some(
    (item) =>
      item.address === currentProxy.implementation &&
      item.fromBlock <= ethereumSnapshot.blockNumber &&
      item.toBlockInclusive === null,
  ),
  "Native current implementation is not active in proxy history",
);
assert(
  currentProxy.proxyRuntimeByteLength > 0 && currentProxy.implementationRuntimeByteLength > 0,
  "Native current runtime evidence is empty",
);
assert(
  /^[a-f0-9]{64}$/.test(currentProxy.proxyRuntimeSha256),
  "Native proxy runtime hash is invalid",
);
assert(
  /^[a-f0-9]{64}$/.test(currentProxy.implementationRuntimeSha256),
  "Native implementation runtime hash is invalid",
);
assert(
  nativePrecompile.currentSourceSequenceTip === 35317,
  "Native Mezo sequence snapshot drifted",
);
assert(currentProxy.sequence === 35318, "Native Ethereum sequence snapshot drifted");
assert(
  currentProxy.tbtcToken === nativePrecompile.sourceBTCToken,
  "Native current Ethereum tBTC differs from Mezo source tBTC",
);
assert(
  currentProxy.attestationThreshold > 0 &&
    currentProxy.attestationThreshold <= currentProxy.bridgeValidatorsCount,
  "Native current validator threshold is invalid",
);
assert(
  currentProxy.erc20TokensCount <= currentProxy.maxERC20Tokens,
  "Native current ERC-20 count exceeds its maximum",
);
assert(address.test(currentProxy.owner), "Native current owner is invalid");
assert(BigInt(currentProxy.minTBTCAmountRaw) > 0n, "Native current tBTC minimum is invalid");
assert(
  currentProxy.sampleERC20Minimum.token === "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "Native current USDC sample token drifted",
);
assert(
  BigInt(currentProxy.sampleERC20Minimum.minERC20AmountRaw) > 0n,
  "Native current USDC minimum is invalid",
);
for (const transferId of [
  "native-usdc-ethereum-to-mezo-completed",
  "native-btc-mezo-to-ethereum-completed",
]) {
  const transfer = transfers.get(transferId);
  assert(transfer !== undefined, `${transferId} transfer evidence is missing`);
  const implementation = proxyHistory.implementations.find(
    (item) =>
      item.address === transfer.source.implementation ||
      item.address === transfer.destination.implementation,
  );
  const ethereumBlock =
    transfer.sourceNetwork === "ethereum-mainnet"
      ? transfer.source.blockNumber
      : transfer.destination.blockNumber;
  assert(implementation, `${transferId} Ethereum implementation is absent from proxy history`);
  assert(
    ethereumBlock >= implementation.fromBlock &&
      (implementation.toBlockInclusive === null ||
        ethereumBlock <= implementation.toBlockInclusive),
    `${transferId} Ethereum implementation was not active at the evidence block`,
  );
}

const [readme, candidates, gaps, generated] = await Promise.all([
  readFile(join(base, "README.md"), "utf8"),
  load<string>("bridge-candidates"),
  load<string>("bridge-gaps"),
  load<string>("bridge-reference"),
]);
assert(
  readme.includes("module support is") && readme.includes("`none`"),
  "bridge README omits support boundary",
);
assert(
  candidates.includes("Candidate") &&
    gaps.includes("registry provenance review") &&
    gaps.includes("route surface") &&
    gaps.includes("v13 evidence blocker is resolved"),
  "bridge review material is incomplete",
);
assert(
  generated.includes("Module: `workflows/bridges`") && generated.includes("Support: `none`"),
  "generated bridge reference is incomplete",
);

process.stdout.write(
  `Validated ${providerIds.length} bridge providers, ${routes.records.length} route candidates, ${deployments.size} deployment snapshots, and ${transfers.size} completed transfer traces.\n`,
);

function fail(message: string): never {
  throw new Error(message);
}
