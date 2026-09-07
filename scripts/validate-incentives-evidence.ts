import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, parseJson, text, texts } from "./lib/json.ts";
import type abiCatalogShape from "../knowledge/contracts/records/abis.json";
import type deploymentCatalogShape from "../knowledge/contracts/records/deployments.json";
import type emissionEvidenceShape from "../knowledge/protocols/incentives/evidence/emissions-mainnet-2026-08-21.json";
import type topologyShape from "../knowledge/protocols/incentives/evidence/mainnet-topology-2026-08-18.json";
import type readIntegrationShape from "../knowledge/protocols/incentives/evidence/read-integration-2026-08-18.json";
import type reproductionShape from "../knowledge/protocols/incentives/evidence/source-reproduction-2026-08-18.json";
import type validatorEvidenceShape from "../knowledge/protocols/incentives/evidence/validator-allocation-mainnet-2026-08-24.json";
import type writerIntegrationShape from "../knowledge/protocols/incentives/evidence/writer-integration-2026-08-18.json";
import type fixturesShape from "../knowledge/protocols/incentives/fixtures/formulas.json";
import type validatorFixturesShape from "../knowledge/protocols/incentives/fixtures/validator-allocation.json";
import type incentivesIndexShape from "../knowledge/protocols/incentives/index.json";
import type boostShape from "../knowledge/protocols/incentives/records/boost.json";
import type contractRolesShape from "../knowledge/protocols/incentives/records/contracts.json";
import type emissionsShape from "../knowledge/protocols/incentives/records/emissions.json";
import type gaugesShape from "../knowledge/protocols/incentives/records/gauges-rewards.json";
import type locksShape from "../knowledge/protocols/incentives/records/locks.json";
import type operationsShape from "../knowledge/protocols/incentives/records/operations.json";
import type validatorModelShape from "../knowledge/protocols/incentives/records/validator-voting-rewards.json";
import type votingShape from "../knowledge/protocols/incentives/records/voting.json";
import type sourcesShape from "../knowledge/protocols/incentives/sources/catalog.json";

type IncentivesIndex = typeof incentivesIndexShape;
type ContractRoles = typeof contractRolesShape;
type Sources = typeof sourcesShape;
type Locks = typeof locksShape;
type Boost = typeof boostShape;
type Voting = typeof votingShape;
type Gauges = typeof gaugesShape;
type Emissions = typeof emissionsShape;
type ValidatorModel = typeof validatorModelShape;
type Operations = typeof operationsShape;
type Fixtures = typeof fixturesShape;
type ValidatorFixtures = typeof validatorFixturesShape;
type Topology = typeof topologyShape;
type EmissionEvidence = typeof emissionEvidenceShape;
type ValidatorEvidence = typeof validatorEvidenceShape;
type Reproduction = typeof reproductionShape;
type ReadIntegration = typeof readIntegrationShape;
type WriterIntegration = typeof writerIntegrationShape;
type DeploymentCatalog = typeof deploymentCatalogShape;
type AbiCatalog = typeof abiCatalogShape;
type DeploymentRecord = DeploymentCatalog["records"][number];
type AbiRecord = AbiCatalog["records"][number];

interface ContractInput {
  role: string;
  address: string;
  implementation?: string | null;
  observedReferences?: Record<string, string>;
  sourceVerification?: string;
  explorerVerification?: string;
  proxyInitialization?: { maxLockTimeSeconds: string };
  storageObservations?: { maxLockTime: { decodedSeconds: string; slot: string } };
  observedValues?: { documentedClGaugeFactoryApproved?: boolean };
}

interface ContractObservation {
  role: string;
  address: string;
  implementation: string | null;
  observedReferences: Record<string, string>;
  sourceVerification: string;
  explorerVerification: string;
  proxyInitialization: { maxLockTimeSeconds: string };
  storageObservations: { maxLockTime: { decodedSeconds: string; slot: string } };
  observedValues: { documentedClGaugeFactoryApproved: boolean };
}

interface NetworkCoordinate {
  networkId: string;
  blockNumber: number;
}

interface TimedPowerInput {
  amount: bigint;
  maxLockSeconds: bigint;
  lockEnd: bigint;
  at: bigint;
  boost?: bigint;
}

interface BoostInput {
  gaugeWeight: bigint;
  votingVeTotalWeight: bigint;
  boostableVeTotalWeight: bigint;
  boostableVeWeight: bigint;
}

interface EpochEmissionInput {
  epochIndex: bigint;
  preEmissionTotalSupplyRaw: bigint;
}

interface EpochRebaseInput {
  emissionRaw: bigint;
  preEmissionTotalSupplyRaw: bigint;
  period: bigint;
  priorBoundaryUnboostedVotingPowerRaw: bigint;
  emissionsEnabled?: bigint;
}

interface EpochResult {
  start: bigint;
  voteStart: bigint;
  voteEnd: bigint;
  next: bigint;
}

interface Envelope {
  status: string;
  supportStatus: string;
  reviewStatus: string;
  owner: string;
  verifiedAt: string;
  reviewAfter: string;
  limitations: readonly unknown[];
  protocolStatus?: string;
  evidenceStatus?: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = join(root, "knowledge", "protocols", "incentives");
const load = async <T>(resourceId: string): Promise<T> =>
  (await loadKnowledgeReference(root, { moduleId: "protocols/incentives", resourceId }))
    .document as T;
const index = parseJson(
  await readFile(join(base, "index.json"), "utf8"),
  "incentives index",
) as IncentivesIndex;
const [
  contractRoles,
  sources,
  locks,
  boost,
  voting,
  gauges,
  emissions,
  validatorModel,
  operations,
  fixtures,
  validatorFixtures,
  topology,
  emissionEvidence,
  validatorEvidence,
  reproduction,
  readIntegration,
  writerIntegration,
] = await Promise.all([
  load<ContractRoles>("incentives-contract-roles"),
  load<Sources>("incentives-sources"),
  load<Locks>("incentives-locks"),
  load<Boost>("incentives-boost"),
  load<Voting>("incentives-voting"),
  load<Gauges>("incentives-gauges-rewards"),
  load<Emissions>("incentives-emissions"),
  load<ValidatorModel>("incentives-validator-voting-rewards"),
  load<Operations>("incentives-operations"),
  load<Fixtures>("incentives-formula-fixtures"),
  load<ValidatorFixtures>("incentives-validator-allocation-fixtures"),
  load<Topology>("incentives-mainnet-topology"),
  load<EmissionEvidence>("incentives-emissions-mainnet"),
  load<ValidatorEvidence>("incentives-validator-allocation-mainnet"),
  load<Reproduction>("incentives-source-reproduction"),
  load<ReadIntegration>("incentives-read-integration"),
  load<WriterIntegration>("incentives-writer-integration"),
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizedContract(contract: ContractInput): ContractObservation {
  return {
    role: contract.role,
    address: contract.address,
    implementation: contract.implementation ?? null,
    observedReferences: contract.observedReferences ?? {},
    sourceVerification: contract.sourceVerification ?? "",
    explorerVerification: contract.explorerVerification ?? "",
    proxyInitialization: contract.proxyInitialization ?? { maxLockTimeSeconds: "" },
    storageObservations: contract.storageObservations ?? {
      maxLockTime: { decodedSeconds: "", slot: "" },
    },
    observedValues: {
      documentedClGaugeFactoryApproved:
        contract.observedValues?.documentedClGaugeFactoryApproved ?? false,
    },
  };
}

function requiredBigInt(values: Readonly<Record<string, bigint>>, key: string): bigint {
  const value = values[key];
  assert(value !== undefined, `missing bigint input ${key}`);
  return value;
}
const address = /^0x[a-f0-9]{40}$/;
const hash = /^0x[a-f0-9]{64}$/;
const sha256 = /^[a-f0-9]{64}$/;
const P = 10n ** 18n;
const WEEK = 604800n;
const fileSha256 = async (path: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");

const assertEnvelope = (
  record: Envelope,
  label: string,
  domainStatus?: string,
  reviewStatus = "accepted",
): void => {
  assert(record.status === "verified", `${label} common status is invalid`);
  assert(record.supportStatus === "none", `${label} support must remain none`);
  assert(record.reviewStatus === reviewStatus, `${label} review status is invalid`);
  assert(record.owner === "protocols/incentives", `${label} owner is invalid`);
  assert(Number.isFinite(Date.parse(record.verifiedAt)), `${label} verifiedAt is invalid`);
  assert(Number.isFinite(Date.parse(record.reviewAfter)), `${label} reviewAfter is invalid`);
  assert(Date.parse(record.reviewAfter) > Date.now(), `${label} review window expired`);
  assert(
    Array.isArray(record.limitations) && record.limitations.length > 0,
    `${label} limitations are missing`,
  );
  if (domainStatus)
    assert(
      record.protocolStatus === domainStatus || record.evidenceStatus === domainStatus,
      `${label} domain status is invalid`,
    );
};

assert(index.schemaVersion === 1, "incentives index schemaVersion must be 1");
assert(
  index.knowledgeVersion === "0.4" && index.kind === "knowledge-module-index",
  "incentives index must use v0.4",
);
assert(
  index.moduleId === "protocols/incentives" && index.id === index.moduleId,
  "incentives module identity is invalid",
);
assertEnvelope(index, "incentives index");
assert(
  index.extensions.protocolStatus === "verified-versioned",
  "incentives protocol status is invalid",
);
assert(index.supportStatus === "none", "incentives writers must remain unsupported");
assert(index.reviewStatus === "accepted", "incentives qualified review is not recorded");
assert(
  index.extensions.blockers.length === 1 &&
    index.extensions.blockers[0] ===
      "fresh writer precondition and exact-call verification for any future supported operation",
  "incentives blockers do not preserve the future-writer gate",
);
await loadKnowledgeReference(root, index.extensions.networkReference);
const resolvedRoleMap = await loadKnowledgeReference(
  root,
  index.extensions.contractRoleMapReference,
);
const resolvedRoleMapDocument = resolvedRoleMap.document as ContractRoles;
assert(resolvedRoleMapDocument.id === contractRoles.id, "contract role-map reference differs");
const envelopeRecords: readonly (readonly [string, Envelope, string?])[] = [
  ["contract roles", contractRoles],
  ["sources", sources],
  ["locks", locks],
  ["boost", boost],
  ["voting", voting],
  ["gauges", gauges],
  ["emissions", emissions, "accepted"],
  ["validator model", validatorModel],
  ["operations", operations],
  ["fixtures", fixtures],
  ["validator fixtures", validatorFixtures],
];
for (const [label, record, reviewStatus] of envelopeRecords) {
  assertEnvelope(record, label, "verified-versioned", reviewStatus);
}
assertEnvelope(topology, "topology", "verified-point-in-time");
assertEnvelope(emissionEvidence, "emissions evidence", "verified-point-in-time", "accepted");
assertEnvelope(
  validatorEvidence,
  "validator allocation evidence",
  "verified-point-in-time",
  "accepted",
);
assertEnvelope(reproduction, "source reproduction", "verified-executable-match");
assertEnvelope(readIntegration, "read integration", "verified-point-in-time");
assertEnvelope(
  writerIntegration,
  "writer integration",
  "verified-historical-integration-not-support",
);
assert(
  topology.networkSnapshot.evmChainId === 31612,
  "incentives evidence is not scoped to Mezo mainnet",
);
assert(hash.test(topology.networkSnapshot.blockHash), "incentives block hash is invalid");

const contracts = new Map<string, ContractObservation>();
const contractCoordinates = new Map<string, NetworkCoordinate>();
for (const contract of topology.contracts) {
  assert(!contracts.has(contract.role), `duplicate incentives role ${contract.role}`);
  assert(address.test(contract.address), `${contract.role} address is invalid`);
  if (contract.implementation)
    assert(address.test(contract.implementation), `${contract.role} implementation is invalid`);
  for (const value of Object.values(contract.observedReferences ?? {}))
    assert(address.test(value), `${contract.role} reference is invalid`);
  if (contract.sourceReproductionReference) {
    const sourceRecord = (await loadKnowledgeReference(root, contract.sourceReproductionReference))
      .value as Reproduction["records"][number];
    assert(
      sourceRecord.role === contract.sourceReproductionReference.recordId,
      `${contract.role} source reproduction reference differs`,
    );
  }
  contracts.set(contract.role, normalizedContract(contract));
  contractCoordinates.set(contract.role, topology.networkSnapshot);
}
for (const contract of emissionEvidence.contracts) {
  assert(!contracts.has(contract.role), `duplicate incentives role ${contract.role}`);
  assert(address.test(contract.address), `${contract.role} address is invalid`);
  if (contract.implementation)
    assert(address.test(contract.implementation), `${contract.role} implementation is invalid`);
  contracts.set(contract.role, normalizedContract(contract));
  contractCoordinates.set(contract.role, emissionEvidence.networkSnapshot);
}
for (const contract of [
  {
    role: "validator-gauge-factory",
    address: validatorEvidence.topology.gaugeFactory.address,
    implementation: null,
  },
  {
    role: "validator-voting-rewards-factory",
    address: validatorEvidence.topology.gaugeFactory.votingRewardsFactory,
    implementation: null,
  },
]) {
  assert(!contracts.has(contract.role), `duplicate incentives role ${contract.role}`);
  assert(address.test(contract.address), `${contract.role} address is invalid`);
  contracts.set(contract.role, normalizedContract(contract));
  contractCoordinates.set(contract.role, validatorEvidence.networkSnapshot);
}

const voter = contracts.get("pools-voter");
const veBTC = contracts.get("vebtc-current");
const boostVoter = contracts.get("boost-voter");
const veMEZO = contracts.get("vemezo-current");
const registry = contracts.get("factory-registry");
assert(
  voter && veBTC && boostVoter && veMEZO && registry,
  "current incentives graph is incomplete",
);
for (const role of [
  "mezo-minter",
  "mezo-rebase-distributor",
  "mezo-chain-splitter",
  "mezo-ecosystem-splitter",
  "validators-voter",
  "third-party-voter",
  "chain-splitter-epoch-governor",
  "ecosystem-splitter-epoch-governor",
]) {
  assert(contracts.has(role), `current emissions graph is missing ${role}`);
}
assert(
  voter.observedReferences.ve === veBTC.address,
  "PoolsVoter does not point to recorded current veBTC",
);
assert(
  veBTC.observedReferences.voter === voter.address,
  "current veBTC does not point back to PoolsVoter",
);
assert(
  veBTC.observedReferences.booster === boostVoter.address,
  "current veBTC does not point to BoostVoter",
);
assert(
  boostVoter.observedReferences.boostableVe === veBTC.address,
  "BoostVoter boost target differs",
);
assert(
  boostVoter.observedReferences.ve === veMEZO.address,
  "BoostVoter ve reference differs from veMEZO",
);
assert(
  veMEZO.observedReferences.voter === boostVoter.address,
  "veMEZO does not point back to BoostVoter",
);
assert(voter.sourceVerification === "fully-verified", "Voter verification status regressed");
assert(
  boostVoter.sourceVerification === "fully-verified",
  "BoostVoter verification status regressed",
);
assert(
  veBTC.sourceVerification === "explorer-partial-executable-reproduced",
  "veBTC verification distinction is missing",
);
assert(
  veMEZO.sourceVerification === "explorer-partial-executable-reproduced",
  "veMEZO verification distinction is missing",
);
assert(
  veBTC.explorerVerification === "partially-verified",
  "veBTC explorer label was silently upgraded",
);
assert(
  veMEZO.explorerVerification === "partially-verified",
  "veMEZO explorer label was silently upgraded",
);
assert(
  veBTC.proxyInitialization.maxLockTimeSeconds === "2419200",
  "veBTC initializer lock maximum changed",
);
assert(
  veBTC.storageObservations.maxLockTime.decodedSeconds === "2419200",
  "veBTC deployed lock maximum changed",
);
assert(
  veMEZO.storageObservations.maxLockTime.decodedSeconds === "125798400",
  "veMEZO deployed lock maximum changed",
);
assert(
  veBTC.storageObservations.maxLockTime.slot === veMEZO.storageObservations.maxLockTime.slot,
  "ve storage layouts disagree on maxLockTime slot",
);
assert(
  topology.documentationConflict.deployedPoolsVoterVeReference === veBTC.address,
  "documentation conflict does not use deployed ve reference",
);
assert(
  topology.documentationConflict.publishedVeBTCAddress !== veBTC.address,
  "documentation conflict unexpectedly disappeared",
);
assert(
  registry.observedValues.documentedClGaugeFactoryApproved === true,
  "CL gauge factory approval observation is missing",
);

assert(
  contractRoles.networkReference.moduleId === "networks",
  "contract role map network module differs",
);
const roleNetwork = await loadKnowledgeReference(root, contractRoles.networkReference);
const roleNetworkDocument = roleNetwork.document as { id: string };
assert(
  roleNetworkDocument.id === topology.networkSnapshot.networkId,
  "contract role map network differs from topology",
);
const roleTopology = await loadKnowledgeReference(root, contractRoles.topologyEvidenceReference);
const roleTopologyDocument = roleTopology.document as Topology;
assert(roleTopologyDocument.id === topology.id, "contract role map topology evidence differs");
const roleEmissions = await loadKnowledgeReference(root, contractRoles.emissionsEvidenceReference);
const roleEmissionsDocument = roleEmissions.document as EmissionEvidence;
assert(
  roleEmissionsDocument.id === emissionEvidence.id,
  "contract role map emissions evidence differs",
);
const roleValidators = await loadKnowledgeReference(root, contractRoles.validatorEvidenceReference);
const roleValidatorsDocument = roleValidators.document as ValidatorEvidence;
assert(
  roleValidatorsDocument.id === validatorEvidence.id,
  "contract role map validator evidence differs",
);
assert(
  contractRoles.records.length === contracts.size,
  "contract role map size differs from deployed topology",
);
for (const role of contractRoles.records) {
  const observed = contracts.get(role.id);
  assert(observed, `contract role ${role.id} is absent from the topology evidence`);
  const [deploymentResult, abiResult] = await Promise.all([
    loadKnowledgeReference(root, role.deploymentReference),
    loadKnowledgeReference(root, role.abiReference),
  ]);
  const deployment = deploymentResult.value as DeploymentRecord;
  const abi = abiResult.value as AbiRecord;
  assert(
    deployment.contractId === abi.contractId,
    `${role.id} deployment and ABI contract IDs differ`,
  );
  const coordinate = contractCoordinates.get(role.id);
  assert(coordinate, `${role.id} observation coordinate is missing`);
  assert(deployment.networkId === coordinate.networkId, `${role.id} deployment network differs`);
  assert(
    deployment.address === observed.address,
    `${role.id} deployment address differs from topology evidence`,
  );
  assert(deployment.status === "verified-current", `${role.id} deployment is not current`);
  assert(
    deployment.supportStatus === "supported",
    `${role.id} deployment registry support differs`,
  );
  assert(deployment.reviewStatus === "accepted", `${role.id} deployment registry review differs`);
  assert(abi.supportStatus === "supported", `${role.id} ABI registry support differs`);
  assert(abi.reviewStatus === "accepted", `${role.id} ABI registry review differs`);
  assert(
    abi.intendedNetworkIds.includes(deployment.networkId),
    `${role.id} ABI network scope differs`,
  );
  assert(
    deployment.validity.currentCodeFrom.blockNumber <= coordinate.blockNumber &&
      deployment.validity.effectiveUntilExclusive === null,
    `${role.id} deployment validity does not cover the topology block`,
  );
  if (observed.implementation) {
    assert(
      deployment.proxy?.currentImplementationAddress === observed.implementation,
      `${role.id} implementation differs from topology evidence`,
    );
  } else {
    assert(deployment.proxy === null, `${role.id} topology says direct but deployment says proxy`);
  }
}

assert(
  reproduction.evidenceStatus === "verified-executable-match",
  "source reproduction status regressed",
);
const reproduced = new Map(reproduction.records.map((record) => [record.role, record]));
for (const role of ["vebtc-current-implementation", "vemezo-current-implementation"]) {
  const record = reproduced.get(role);
  assert(record, `missing reproduction record ${role}`);
  assert(record.creation && record.runtime, `${role} executable comparison is missing`);
  assert(
    record.explorerVerification.fullyVerified === false,
    `${role} explorer label was upgraded`,
  );
  assert(
    record.explorerVerification.partiallyVerified === true,
    `${role} partial label is missing`,
  );
  assert(
    record.creation.executableExact === true && record.runtime.executableExact === true,
    `${role} executable mismatch`,
  );
  assert(
    record.creation.fullExact === false && record.runtime.fullExact === false,
    `${role} metadata distinction disappeared`,
  );
  assert(
    record.runtime.explorerFullSha256 === record.runtime.fixedBlockRpcFullSha256,
    `${role} RPC runtime differs from explorer`,
  );
  assert(sha256.test(record.explorerResponseSha256), `${role} response digest is invalid`);
}

assert(
  readIntegration.evidenceStatus === "verified-point-in-time",
  "read integration status regressed",
);
assert(
  readIntegration.reviewStatus === "accepted",
  "read integration qualified review is not recorded",
);
assert(
  Date.parse(readIntegration.reviewAfter) > Date.now(),
  "read integration review window expired",
);
assert(
  readIntegration.networkSnapshot.blockNumber === topology.networkSnapshot.blockNumber,
  "read integration block differs from topology",
);
assert(
  readIntegration.networkSnapshot.blockHash === topology.networkSnapshot.blockHash,
  "read integration block hash differs from topology",
);
assert(
  writerIntegration.evidenceStatus === "verified-historical-integration-not-support",
  "writer integration status is unsafe",
);
assert(
  writerIntegration.reviewStatus === "accepted",
  "writer integration qualified review is not recorded",
);
assert(
  Date.parse(writerIntegration.reviewAfter) > Date.now(),
  "writer integration review window expired",
);
assert(
  writerIntegration.networkId === topology.networkSnapshot.networkId,
  "writer integration network differs from topology",
);
assert(
  writerIntegration.evmChainId === topology.networkSnapshot.evmChainId,
  "writer integration chain differs from topology",
);

const writerOperations = new Map(writerIntegration.operations.map((record) => [record.id, record]));
assert(writerOperations.size === 2, "writer integration must retain two scoped operations");
const createLock = writerOperations.get("vebtc-create-lock-historical-replay");
const replaceVote = writerOperations.get("pools-vote-replacement-historical-replay");
assert(createLock && replaceVote, "writer integration operations are incomplete");
for (const record of writerOperations.values()) {
  assert(
    address.test(record.target) && address.test(record.sender),
    `${record.id} address is invalid`,
  );
  assert(
    hash.test(record.transactionHash) && hash.test(record.blockHash),
    `${record.id} transaction/block hash is invalid`,
  );
  assert(hash.test(record.preState.blockHash), `${record.id} pre-state block hash is invalid`);
  assert(
    record.blockNumber === record.preState.blockNumber + 1,
    `${record.id} pre-state is not the parent block`,
  );
  assert(record.receipt.status === "success", `${record.id} receipt did not succeed`);
  assert(
    record.call.calldata.startsWith(record.call.selector),
    `${record.id} selector/calldata differs`,
  );
}
assert(createLock.target === veBTC.address, "createLock integration targets the wrong veBTC");
assert(createLock.receipt.nftTransfer, "createLock NFT transfer is missing");
const createLockNftTransfer = createLock.receipt.nftTransfer;
assert(
  createLock.preStateReplay.decodedTokenId === createLockNftTransfer.tokenId,
  "createLock replay token differs from receipt",
);
assert(
  createLockNftTransfer.to === createLock.sender,
  "createLock NFT recipient differs from sender",
);
assert(
  createLock.stateReconciliation.ownerBefore === "0x0000000000000000000000000000000000000000",
  "createLock owner pre-state is not empty",
);
assert(
  createLock.stateReconciliation.ownerAfter === createLock.sender,
  "createLock owner post-state differs",
);
assert(
  createLock.stateReconciliation.lockBefore.amount === "0",
  "createLock lock existed before inclusion",
);
assert(
  createLock.stateReconciliation.lockAfter.amount === createLock.call.amountRaw,
  "createLock post-state amount differs from calldata",
);
assert(
  createLock.receipt.underlyingTransferRaw === createLock.call.amountRaw,
  "createLock underlying transfer differs from calldata",
);
assert(
  createLock.receipt.lockEventAmountRaw === createLock.call.amountRaw,
  "createLock event amount differs from calldata",
);
assert(
  createLock.stateReconciliation.lockAfter.end === createLock.receipt.lockEventEnd,
  "createLock event/post-state end differs",
);
assert(replaceVote.target === voter.address, "vote integration targets the wrong Voter");
assert(
  replaceVote.receipt.abstained && replaceVote.receipt.voted,
  "replacement vote events are missing",
);
const replacementAbstained = replaceVote.receipt.abstained;
const replacementVoted = replaceVote.receipt.voted;
assert(
  JSON.stringify(replaceVote.receipt.eventOrder) === JSON.stringify(["Abstained", "Voted"]),
  "replacement vote event order differs",
);
assert(
  replacementAbstained.tokenId === replaceVote.call.tokenId,
  "replacement abstain token differs",
);
assert(replacementVoted.tokenId === replaceVote.call.tokenId, "replacement vote token differs");
assert(replacementVoted.pool === replaceVote.call.pools[0], "replacement vote pool differs");
assert(
  replaceVote.stateReconciliation.lastVotedAfter ===
    String(Math.floor(Date.parse(replaceVote.blockTimestamp) / 1000)),
  "replacement lastVoted does not match block timestamp",
);
assert(
  BigInt(replaceVote.stateReconciliation.lastVotedBefore) <
    BigInt(replaceVote.stateReconciliation.lastVotedAfter),
  "replacement lastVoted did not advance",
);
assert(
  replaceVote.stateReconciliation.selectedPoolVoteBefore === replacementAbstained.weight,
  "replacement pre-vote differs from abstained weight",
);
assert(
  replaceVote.stateReconciliation.selectedPoolVoteAfter === replacementVoted.weight,
  "replacement post-vote differs from voted weight",
);
assert(
  replaceVote.stateReconciliation.usedWeightBefore ===
    replaceVote.stateReconciliation.selectedPoolVoteBefore,
  "replacement pre used weight differs",
);
assert(
  replaceVote.stateReconciliation.usedWeightAfter ===
    replaceVote.stateReconciliation.selectedPoolVoteAfter,
  "replacement post used weight differs",
);
assert(
  BigInt(replacementAbstained.poolTotalWeightAfter) + BigInt(replacementVoted.weight) ===
    BigInt(replacementVoted.poolTotalWeightAfter),
  "replacement pool total does not reconcile",
);

const assets = new Map(locks.assets.map((record) => [record.id, record]));
assert(assets.get("vebtc-current")?.maxLockSeconds === "2419200", "veBTC maximum lock is wrong");
assert(
  assets.get("vemezo-current")?.maxLockSeconds === "125798400",
  "veMEZO maximum lock is wrong",
);
assert(
  boost.constants.minimumBoost === P.toString() &&
    boost.constants.maximumBoost === (5n * P).toString(),
  "boost bounds changed",
);
assert(voting.epoch.lengthSeconds === WEEK.toString(), "epoch length changed");
assert(operations.records.length >= 10, "incentives operation catalog is incomplete");
assert(
  gauges.analyticsBoundary.some((value) => value.includes("APY")),
  "analytics/protocol boundary is missing",
);
for (const record of sources.records.filter((item) => item.evidenceReference)) {
  assert(typeof record.sha256 === "string", `${record.id} evidence digest is missing`);
  assert(sha256.test(record.sha256), `${record.id} evidence digest is invalid`);
  const resolved = await loadKnowledgeReference(root, record.evidenceReference);
  assert(
    (await fileSha256(resolved.path)) === record.sha256,
    `${record.id} evidence digest drifted`,
  );
}
const whitepaper = sources.records.find((item) => item.id === "official-mezo-earn-whitepaper");
assert(
  whitepaper?.artifactReference,
  "official Mezo Earn whitepaper artifact reference is missing",
);
assert(sha256.test(whitepaper.sha256), "official Mezo Earn whitepaper digest is invalid");
const whitepaperArtifact = await loadKnowledgeReference(root, whitepaper.artifactReference);
assert(
  (await fileSha256(whitepaperArtifact.path)) === whitepaper.sha256,
  "official Mezo Earn whitepaper artifact digest drifted",
);

const epoch = (timestamp: bigint): EpochResult => {
  const start = timestamp - (timestamp % WEEK);
  return { start, voteStart: start + 3600n, voteEnd: start + WEEK - 3600n, next: start + WEEK };
};
const timedPower = ({
  amount,
  maxLockSeconds,
  lockEnd,
  at,
  boost: boostValue,
}: TimedPowerInput): { slope: bigint; power: bigint } => {
  if (at >= lockEnd) return { slope: 0n, power: 0n };
  const effective =
    boostValue === undefined || boostValue === 0n ? amount : (amount * boostValue) / P;
  const slope = effective / maxLockSeconds;
  return { slope, power: slope * (lockEnd - at) };
};
const calculateBoost = ({
  gaugeWeight,
  votingVeTotalWeight,
  boostableVeTotalWeight,
  boostableVeWeight,
}: BoostInput): bigint => {
  const votingRatio = votingVeTotalWeight === 0n ? 0n : (gaugeWeight * P) / votingVeTotalWeight;
  const boostableRatio =
    boostableVeWeight === 0n ? 0n : (boostableVeTotalWeight * P) / boostableVeWeight;
  const fraction = (4n * boostableRatio * votingRatio) / P;
  return P + fraction > 5n * P ? 5n * P : P + fraction;
};
const epochEmission = ({ epochIndex, preEmissionTotalSupplyRaw }: EpochEmissionInput): bigint => {
  const halvingPeriod = epochIndex / 104n;
  const progress = ((epochIndex % 104n) * P) / 104n;
  const tail = 200n * P;
  const start = (2500n * P) / 2n ** halvingPeriod > tail ? (2500n * P) / 2n ** halvingPeriod : tail;
  const end = start / 2n > tail ? start / 2n : tail;
  const drop = ((start - end) * progress) / P;
  const epochRate = (start - drop) / 52n;
  return (epochRate * preEmissionTotalSupplyRaw) / 10000n / P;
};
const epochRebase = ({
  emissionRaw,
  preEmissionTotalSupplyRaw,
  period,
  priorBoundaryUnboostedVotingPowerRaw,
  emissionsEnabled = 1n,
}: EpochRebaseInput): bigint => {
  if (
    emissionsEnabled === 0n ||
    emissionRaw === 0n ||
    preEmissionTotalSupplyRaw === 0n ||
    period === 0n
  )
    return 0n;
  if (priorBoundaryUnboostedVotingPowerRaw >= preEmissionTotalSupplyRaw) return 0n;
  const nonVoting = preEmissionTotalSupplyRaw - priorBoundaryUnboostedVotingPowerRaw;
  return (
    (((emissionRaw * nonVoting) / preEmissionTotalSupplyRaw) * nonVoting) /
    preEmissionTotalSupplyRaw /
    2n
  );
};

assert(
  emissionEvidence.networkSnapshot.evmChainId === 31612,
  "emissions evidence is not scoped to Mezo mainnet",
);
assert(
  hash.test(emissionEvidence.networkSnapshot.blockHash),
  "emissions evidence block hash is invalid",
);
assert(
  emissionEvidence.currentState.emissionsEnabled === true,
  "emissions were not enabled at the evidence block",
);
assert(
  emissionEvidence.currentState.maxEpochsPerUpdate === emissions.constants.maxEpochsPerUpdate,
  "catch-up cap differs from canonical record",
);
assert(
  emissionEvidence.topology.emissionBudgetSource === "mezo-minter",
  "emission source role differs",
);
assert(
  emissionEvidence.topology.rebaseDestination === "mezo-rebase-distributor",
  "rebase destination role differs",
);
assert(
  emissionEvidence.topology.rewardDestination === "mezo-chain-splitter",
  "reward destination role differs",
);
assert(
  emissionEvidence.topology.chainSplitter.firstRecipient === "mezo-ecosystem-splitter",
  "chain first destination differs",
);
assert(
  emissionEvidence.topology.chainSplitter.secondRecipient === "validators-voter",
  "validator destination differs",
);
assert(
  emissionEvidence.topology.ecosystemSplitter.firstRecipient === "pools-voter",
  "pool destination differs",
);
assert(
  emissionEvidence.topology.ecosystemSplitter.secondRecipient === "third-party-voter",
  "third-party destination differs",
);
for (const reference of Object.values(emissions.roleReferences)) {
  const resolved = await loadKnowledgeReference(root, reference);
  const resolvedValue = resolved.value as { id: string };
  assert(
    resolvedValue.id === reference.recordId,
    `emissions role reference ${reference.recordId} differs`,
  );
}
const representative = emissionEvidence.representativeEpoch;
const emissionInputs = {
  epochIndex: BigInt(representative.event.epochIndex),
  preEmissionTotalSupplyRaw: BigInt(representative.formulaInputs.preEmissionTotalSupplyRaw),
};
assert(
  epochEmission(emissionInputs).toString() === representative.event.emissionRaw,
  "representative epoch emission differs",
);
const rebaseInputs = {
  emissionRaw: BigInt(representative.event.emissionRaw),
  preEmissionTotalSupplyRaw: BigInt(representative.formulaInputs.preEmissionTotalSupplyRaw),
  period: BigInt(representative.event.period),
  priorBoundaryUnboostedVotingPowerRaw: BigInt(
    representative.formulaInputs.priorBoundaryUnboostedVotingPowerRaw,
  ),
};
assert(
  epochRebase(rebaseInputs).toString() === representative.event.rebaseRaw,
  "representative epoch rebase differs",
);
assert(
  BigInt(representative.event.emissionRaw) - BigInt(representative.event.rebaseRaw) ===
    BigInt(representative.event.rewardsRaw),
  "representative reward remainder differs",
);
assert(
  BigInt(representative.formulaInputs.preEmissionTotalSupplyRaw) +
    BigInt(representative.event.emissionRaw) ===
    BigInt(representative.event.postEmissionTotalSupplyRaw),
  "representative supply increment differs",
);
assert(
  representative.event.postEmissionTotalSupplyRaw ===
    emissionEvidence.currentState.tokenTotalSupplyRaw,
  "fixed-block supply differs from representative post-emission supply",
);
for (const split of Object.values(emissionEvidence.representativeSplits)) {
  const total = BigInt(split.firstRecipientAmountRaw) + BigInt(split.secondRecipientAmountRaw);
  const first = (total * BigInt(split.needleAtDistribution)) / 100n;
  assert(
    first.toString() === split.firstRecipientAmountRaw,
    "representative splitter first amount differs",
  );
  assert(
    (total - first).toString() === split.secondRecipientAmountRaw,
    "representative splitter remainder differs",
  );
}
assert(
  BigInt(emissionEvidence.representativeSplits.chain.firstRecipientAmountRaw) +
    BigInt(emissionEvidence.representativeSplits.chain.secondRecipientAmountRaw) ===
    BigInt(representative.event.rewardsRaw),
  "chain splitter input differs from epoch rewards",
);
assert(
  emissionEvidence.governanceObservation.newNeedle ===
    emissionEvidence.currentState.ecosystemSplitterNeedle,
  "latest ecosystem nudge differs from current needle",
);
assert(
  emissionEvidence.governanceObservation.oldNeedle ===
    String(BigInt(emissionEvidence.currentState.ecosystemSplitterNeedle) + 1n),
  "ecosystem nudge tick differs",
);
const formulaIds = new Set(emissions.formulas.map((formula) => formula.id));
for (const id of [
  "mezo-epoch-emission",
  "mezo-epoch-rebase",
  "mezo-epoch-reward-remainder",
  "mezo-splitter-allocation",
])
  assert(formulaIds.has(id), `missing emissions formula ${id}`);
assert(
  emissions.limitations.some((value) => value.includes("whitepaper")),
  "specification/deployment conflict is missing",
);
assert(
  emissions.accountingBoundaries.some((value) => value.includes("exactly once")),
  "single-mint accounting boundary is missing",
);

assert(
  validatorEvidence.networkSnapshot.evmChainId === 31612,
  "validator evidence is not scoped to Mezo mainnet",
);
assert(
  hash.test(validatorEvidence.networkSnapshot.blockHash),
  "validator evidence block hash is invalid",
);
assert(
  validatorEvidence.topology.voter.address ===
    (contracts.get("validators-voter") ?? fail("validators voter contract is missing")).address,
  "validator evidence voter differs from the accepted deployment",
);
assert(
  validatorEvidence.topology.voter.ve === veBTC.address,
  "validator voter ve reference differs from current veBTC",
);
assert(
  validatorEvidence.topology.voter.splitter ===
    (contracts.get("mezo-chain-splitter") ?? fail("chain splitter contract is missing")).address,
  "validator voter splitter reference differs",
);
assert(
  validatorEvidence.topology.gaugeFactory.approved === true,
  "validator gauge factory was not approved at the evidence block",
);
assert(
  validatorEvidence.topology.gaugeFactory.address ===
    (contracts.get("validator-gauge-factory") ?? fail("validator gauge factory is missing"))
      .address,
  "validator gauge factory evidence differs",
);
assert(
  validatorEvidence.topology.gaugeFactory.votingRewardsFactory ===
    (
      contracts.get("validator-voting-rewards-factory") ??
      fail("validator voting-rewards factory is missing")
    ).address,
  "validator voting-rewards factory evidence differs",
);
for (const reference of Object.values(validatorModel.roleReferences)) {
  const resolved = await loadKnowledgeReference(root, reference);
  const resolvedValue = resolved.value as { id: string };
  assert(
    resolvedValue.id === reference.recordId,
    `validator role reference ${reference.recordId} differs`,
  );
}

const availableValue = (outcome: unknown, label: string): string => {
  assert(typeof outcome === "object" && outcome !== null, `${label} is invalid`);
  assert("status" in outcome && outcome.status === "available", `${label} is unavailable`);
  assert("value" in outcome && typeof outcome.value === "string", `${label} value is invalid`);
  return outcome.value;
};
const currentValidatorState = validatorEvidence.currentBoundaryState;
assert(
  currentValidatorState.gauges.length === currentValidatorState.gaugeCount,
  "validator gauge count differs from current state",
);
const currentGaugeWeightSum = currentValidatorState.gauges.reduce(
  (sum, gauge) => sum + BigInt(availableValue(gauge.weightRaw, `${gauge.address} weight`)),
  0n,
);
assert(
  currentGaugeWeightSum.toString() === currentValidatorState.sumGaugeWeightsRaw,
  "validator gauge weight sum differs",
);
assert(
  currentValidatorState.sumGaugeWeightsRaw === currentValidatorState.totalWeightRaw &&
    currentValidatorState.weightSumMatches === true,
  "validator totalWeight does not equal summed gauge weights",
);
for (const gauge of currentValidatorState.gauges) {
  assert(address.test(gauge.address), "validator gauge address is invalid");
  for (const [field, outcome] of Object.entries(gauge)) {
    if (typeof outcome !== "object" || outcome === null || !("status" in outcome)) {
      continue;
    }
    assert(
      outcome.status === "available" ||
        (outcome.status === "unavailable" &&
          "reason" in outcome &&
          typeof outcome.reason === "string"),
      `${gauge.address} ${field} partial outcome is invalid`,
    );
  }
  if (gauge.voter.status === "available") {
    assert(gauge.voter.value === validatorEvidence.topology.voter.address, "gauge voter differs");
  }
  if (gauge.rewardToken.status === "available") {
    assert(
      gauge.rewardToken.value === validatorEvidence.topology.voter.rewardToken,
      "gauge reward token differs",
    );
  }
}
const history = validatorEvidence.lifecycleHistory;
assert(
  history.eventCounts.reduce((sum, entry) => sum + entry.count, 0) === history.voterLogCount,
  "validator event counts do not reconcile",
);
assert(
  history.validatorGaugeCreations.length === currentValidatorState.gaugeCount &&
    history.currentGaugeListMatchesCreationHistory === true,
  "validator gauge creation history differs from the current cohort",
);
for (const event of [...history.validatorGaugeCreations, ...history.validatorDepartures]) {
  assert(hash.test(event.blockHash), `${event.event} block hash is invalid`);
  assert(hash.test(event.transactionHash), `${event.event} transaction hash is invalid`);
}

const validatorVote = validatorEvidence.representativeVote;
const validatorExternalTotal = validatorVote.allocations.reduce(
  (sum, allocation) => sum + BigInt(allocation.externalWeight),
  0n,
);
assert(
  validatorExternalTotal.toString() === validatorVote.externalVoteWeightTotal,
  "validator external vote total differs",
);
const validatorExpectedAllocations = validatorVote.allocations.map(
  (allocation) =>
    (BigInt(allocation.externalWeight) * BigInt(validatorVote.boostedVotingPowerRaw)) /
    validatorExternalTotal,
);
assert(
  validatorExpectedAllocations.every(
    (value, index) =>
      value.toString() ===
      (validatorVote.allocations[index] ?? fail(`validator allocation ${index} is missing`))
        .expectedGaugeVoteRaw,
  ),
  "validator vote allocation formula differs",
);
const validatorUsedWeight = validatorExpectedAllocations.reduce((sum, value) => sum + value, 0n);
assert(
  validatorUsedWeight.toString() === validatorVote.expectedUsedWeightRaw &&
    validatorVote.expectedUsedWeightRaw === validatorVote.postUsedWeightRaw,
  "validator used weight differs",
);
assert(
  (BigInt(validatorVote.boostedVotingPowerRaw) - validatorUsedWeight).toString() ===
    validatorVote.allocationFloorDustRaw,
  "validator allocation floor dust differs",
);
assert(
  BigInt(validatorVote.rawLockedBTC.amountRaw) <= BigInt(validatorVote.unboostedVotingPowerRaw) &&
    BigInt(validatorVote.unboostedVotingPowerRaw) <= BigInt(validatorVote.boostedVotingPowerRaw),
  "validator raw/unboosted/boosted quantities are conflated",
);
const abstainedWeight = validatorVote.abstainedEvents.reduce(
  (sum, event) => sum + BigInt(event.parameters.weight),
  0n,
);
const votedWeight = validatorVote.votedEvents.reduce(
  (sum, event) => sum + BigInt(event.parameters.weight),
  0n,
);
assert(
  abstainedWeight.toString() === validatorVote.abstainedWeightSumRaw &&
    votedWeight.toString() === validatorVote.votedWeightSumRaw,
  "validator vote event sums differ",
);
assert(
  BigInt(validatorVote.totalWeightPreRaw) - abstainedWeight + votedWeight ===
    BigInt(validatorVote.totalWeightPostRaw),
  "validator totalWeight transition differs",
);
assert(validatorVote.totalWeightTransitionMatches === true, "validator transition flag differs");

const validatorNotification = validatorEvidence.representativeRewardNotification;
const notificationAmount = BigInt(validatorNotification.event.parameters.amount);
const notificationTotalWeight = BigInt(validatorNotification.preState.totalWeightRaw);
const notificationIndex = (notificationAmount * P) / (notificationTotalWeight || 1n);
assert(
  notificationIndex.toString() === validatorNotification.indexDeltaRaw,
  "validator notification index differs",
);
const notificationWeightSum = validatorNotification.perGaugeIndexShares.reduce(
  (sum, gauge) => sum + BigInt(gauge.weightRaw),
  0n,
);
const notificationShareSum = validatorNotification.perGaugeIndexShares.reduce((sum, gauge) => {
  const share = (BigInt(gauge.weightRaw) * notificationIndex) / P;
  assert(share.toString() === gauge.indexShareRaw, `${gauge.gauge} index share differs`);
  return sum + share;
}, 0n);
assert(
  notificationWeightSum.toString() === validatorNotification.preState.sumGaugeWeightsRaw &&
    notificationWeightSum === notificationTotalWeight,
  "validator notification weight snapshot differs",
);
assert(
  notificationShareSum.toString() === validatorNotification.shareSumRaw &&
    (notificationAmount - notificationShareSum).toString() === validatorNotification.floorDustRaw,
  "validator notification share dust differs",
);

const validatorDistribution = validatorEvidence.representativeDistribution;
const distributionAmount = validatorDistribution.event.parameters.amount;
const downstreamNotifyEvent =
  validatorDistribution.downstreamNotifyEvents[0] ??
  fail("validator downstream notification is missing");
assert(
  validatorDistribution.downstreamNotifyEvents.length === 1 &&
    downstreamNotifyEvent.amountRaw === distributionAmount &&
    downstreamNotifyEvent.address === validatorDistribution.gauge,
  "validator distribution does not match downstream gauge notification",
);
assert(
  validatorDistribution.rewardTokenTransfers.some(
    (transfer) =>
      transfer.from === validatorEvidence.topology.voter.address &&
      transfer.to === validatorDistribution.gauge &&
      transfer.amountRaw === distributionAmount,
  ),
  "validator distribution reward-token transfer differs",
);
const distributionTimestamp = BigInt(validatorDistribution.timestampRaw);
const distributionNext = distributionTimestamp - (distributionTimestamp % WEEK) + WEEK;
const distributionPreFinish = BigInt(
  availableValue(validatorDistribution.prePeriodFinish, "distribution pre period finish"),
);
const distributionPreRate = BigInt(
  availableValue(validatorDistribution.preRewardRate, "distribution pre reward rate"),
);
const distributionLeftover =
  distributionTimestamp < distributionPreFinish
    ? (distributionPreFinish - distributionTimestamp) * distributionPreRate
    : 0n;
const distributionRate =
  (BigInt(distributionAmount) + distributionLeftover) / (distributionNext - distributionTimestamp);
assert(
  distributionLeftover.toString() === validatorDistribution.rolloverLeftoverRaw,
  "validator distribution leftover differs",
);
assert(
  distributionRate.toString() === validatorDistribution.expectedPostRewardRateRaw &&
    distributionRate.toString() ===
      availableValue(validatorDistribution.observedPostRewardRate, "post reward rate"),
  "validator distribution reward rate differs",
);
assert(
  distributionNext.toString() === validatorDistribution.expectedPostPeriodFinish &&
    distributionNext.toString() ===
      availableValue(validatorDistribution.observedPostPeriodFinish, "post period finish"),
  "validator distribution period finish differs",
);
assert(
  availableValue(validatorDistribution.postClaimable, "post distribution claimable") === "0",
  "validator voter claimable was not cleared after distribution",
);

const validatorClaim = validatorEvidence.representativeClaim;
assert(validatorClaim.status === "available", "representative validator claim is unavailable");
assert(
  validatorClaim.rewardTransfers.some(
    (transfer) =>
      transfer.from === validatorClaim.gauge &&
      transfer.to === validatorClaim.account &&
      transfer.amountRaw === validatorClaim.amountRaw,
  ),
  "validator claim event and reward-token transfer differ",
);
assert(
  availableValue(validatorClaim.rewardsStoragePost, "post-claim rewards storage") === "0",
  "validator claim did not clear stored rewards",
);
assert(
  validatorModel.documentationDisposition.some(
    (entry) => entry.disposition === "rejected-for-current-generation",
  ),
  "validator documentation conflict is missing",
);
assert(
  validatorModel.analyticsBoundary.some((entry) => entry.includes("APR")),
  "validator analytics boundary is missing",
);

const readLock = Object.fromEntries(
  Object.entries(readIntegration.vebtcLockObservation.lock)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => [key, BigInt(value)]),
);
const readAt = BigInt(readIntegration.networkSnapshot.blockTimestamp);
const readMax = BigInt(readIntegration.vebtcLockObservation.maxLockSeconds);
const readUnboosted = timedPower({
  amount: requiredBigInt(readLock, "amount"),
  maxLockSeconds: readMax,
  lockEnd: requiredBigInt(readLock, "end"),
  at: readAt,
});
const readBoosted = timedPower({
  amount: requiredBigInt(readLock, "amount"),
  maxLockSeconds: readMax,
  lockEnd: requiredBigInt(readLock, "end"),
  at: readAt,
  boost: requiredBigInt(readLock, "storedBoost"),
});
assert(
  readUnboosted.slope.toString() === readIntegration.vebtcLockObservation.recomputed.unboostedSlope,
  "read integration unboosted slope differs",
);
assert(
  readUnboosted.power.toString() ===
    readIntegration.vebtcLockObservation.recomputed.unboostedVotingPower,
  "read integration unboosted formula differs",
);
assert(
  readUnboosted.power.toString() ===
    readIntegration.vebtcLockObservation.deployedResults.unboostedVotingPowerOfNFT,
  "read integration unboosted getter differs",
);
assert(
  readBoosted.slope.toString() === readIntegration.vebtcLockObservation.recomputed.boostedSlope,
  "read integration boosted slope differs",
);
assert(
  readBoosted.power.toString() ===
    readIntegration.vebtcLockObservation.recomputed.boostedVotingPower,
  "read integration boosted formula differs",
);
assert(
  readBoosted.power.toString() ===
    readIntegration.vebtcLockObservation.deployedResults.votingPowerOfNFT,
  "read integration boosted getter differs",
);

const readBoostInputs = Object.fromEntries(
  Object.entries(readIntegration.boostObservation.inputs).map(([key, value]) => [
    key,
    BigInt(value),
  ]),
);
const currentBoost = calculateBoost({
  gaugeWeight: requiredBigInt(readBoostInputs, "gaugeWeight"),
  votingVeTotalWeight: requiredBigInt(readBoostInputs, "votingVeTotalWeight"),
  boostableVeTotalWeight: requiredBigInt(readBoostInputs, "boostableVeTotalWeight"),
  boostableVeWeight: requiredBigInt(readBoostInputs, "boostableVeWeight"),
});
assert(
  currentBoost.toString() === readIntegration.boostObservation.recomputedBoost,
  "read integration boost formula differs",
);
assert(
  currentBoost.toString() === readIntegration.boostObservation.deployedGetBoost,
  "read integration getBoost differs",
);
assert(
  readIntegration.boostObservation.storedBoostAtLock !==
    readIntegration.boostObservation.deployedGetBoost,
  "read integration must preserve stored/current boost distinction",
);

const readEpoch = epoch(BigInt(readIntegration.epochObservation.inputTimestamp));
const epochKeyMap: readonly (readonly [
  keyof EpochResult,
  keyof typeof readIntegration.epochObservation.recomputedResults,
])[] = [
  ["start", "epochStart"],
  ["next", "epochNext"],
  ["voteStart", "epochVoteStart"],
  ["voteEnd", "epochVoteEnd"],
];
for (const [key, resultKey] of epochKeyMap) {
  assert(
    readEpoch[key].toString() === readIntegration.epochObservation.recomputedResults[resultKey],
    `read integration ${resultKey} formula differs`,
  );
  assert(
    readEpoch[key].toString() === readIntegration.epochObservation.deployedResults[resultKey],
    `read integration ${resultKey} getter differs`,
  );
}

for (const fixture of fixtures.records) {
  const values: Record<string, bigint> = {};
  for (const [key, value] of Object.entries(fixture.inputs)) {
    if (Array.isArray(value)) continue;
    assert(
      typeof value === "string" || typeof value === "number" || typeof value === "boolean",
      `${fixture.id} input ${key} is not scalar`,
    );
    values[key] = BigInt(value);
  }
  if (fixture.formulaId === "rounded-unlock-time") {
    const timestamp = requiredBigInt(values, "timestamp");
    const result = ((timestamp + requiredBigInt(values, "requestedDuration")) / WEEK) * WEEK;
    assert(
      result.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} unlock result differs`,
    );
    if (fixture.expectedValidity === false)
      assert(result <= timestamp, `${fixture.id} unexpectedly valid`);
  } else if (
    fixture.formulaId === "unboosted-timed-voting-power" ||
    fixture.formulaId === "boosted-timed-voting-power"
  ) {
    const boostValue = values.boost;
    const result = timedPower({
      amount: requiredBigInt(values, "amount"),
      maxLockSeconds: requiredBigInt(values, "maxLockSeconds"),
      lockEnd: requiredBigInt(values, "lockEnd"),
      at: requiredBigInt(values, "at"),
      ...(boostValue === undefined ? {} : { boost: boostValue }),
    });
    assert(
      result.power.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} power differs`,
    );
    if (fixture.expectedSlope)
      assert(result.slope.toString() === fixture.expectedSlope, `${fixture.id} slope differs`);
  } else if (fixture.formulaId === "vebtc-boost-factor") {
    const result = calculateBoost({
      gaugeWeight: requiredBigInt(values, "gaugeWeight"),
      votingVeTotalWeight: requiredBigInt(values, "votingVeTotalWeight"),
      boostableVeTotalWeight: requiredBigInt(values, "boostableVeTotalWeight"),
      boostableVeWeight: requiredBigInt(values, "boostableVeWeight"),
    });
    assert(
      result.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} boost differs`,
    );
  } else if (fixture.formulaId === "epoch-boundaries") {
    const result = epoch(requiredBigInt(values, "timestamp"));
    const expected = object(fixture.expected, `${fixture.id} expected epoch`);
    for (const key of ["start", "voteStart", "voteEnd", "next"] as const) {
      assert(
        result[key].toString() === text(expected[key], `${fixture.id} expected ${key}`),
        `${fixture.id} ${key} differs`,
      );
    }
  } else if (fixture.formulaId === "proportional-vote-allocation") {
    const relative = texts(fixture.inputs.relativeWeights, `${fixture.id} relative weights`).map(
      BigInt,
    );
    const total = relative.reduce((sum, value) => sum + value, 0n);
    const votingPower = requiredBigInt(values, "votingPower");
    const allocations = relative.map((value) => (value * votingPower) / total);
    const used = allocations.reduce((sum, value) => sum + value, 0n);
    const expected = object(fixture.expected, `${fixture.id} expected allocation`);
    assert(
      JSON.stringify(allocations.map(String)) ===
        JSON.stringify(texts(expected.allocations, `${fixture.id} expected allocations`)),
      `${fixture.id} allocations differ`,
    );
    assert(
      used.toString() === text(expected.usedWeight, `${fixture.id} expected used weight`),
      `${fixture.id} used weight differs`,
    );
    assert(
      (votingPower - used).toString() ===
        text(expected.unallocatedFloorDust, `${fixture.id} expected floor dust`),
      `${fixture.id} dust differs`,
    );
  } else if (fixture.formulaId === "emission-global-index-increment") {
    const amount = requiredBigInt(values, "amount");
    const totalWeight = requiredBigInt(values, "totalWeight");
    const result = (amount * P) / (totalWeight > 1n ? totalWeight : 1n);
    assert(
      result.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} index differs`,
    );
  } else if (fixture.formulaId === "gauge-emission-share") {
    const result =
      (requiredBigInt(values, "poolWeight") * requiredBigInt(values, "indexDelta")) / P;
    assert(
      result.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} share differs`,
    );
  } else if (fixture.formulaId === "mezo-epoch-emission") {
    const result = epochEmission({
      epochIndex: requiredBigInt(values, "epochIndex"),
      preEmissionTotalSupplyRaw: requiredBigInt(values, "preEmissionTotalSupplyRaw"),
    });
    assert(
      result.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} emission differs`,
    );
  } else if (fixture.formulaId === "mezo-epoch-rebase") {
    const emissionsEnabled = values.emissionsEnabled;
    const result = epochRebase({
      emissionRaw: requiredBigInt(values, "emissionRaw"),
      preEmissionTotalSupplyRaw: requiredBigInt(values, "preEmissionTotalSupplyRaw"),
      period: requiredBigInt(values, "period"),
      priorBoundaryUnboostedVotingPowerRaw: requiredBigInt(
        values,
        "priorBoundaryUnboostedVotingPowerRaw",
      ),
      ...(emissionsEnabled === undefined ? {} : { emissionsEnabled }),
    });
    assert(
      result.toString() === text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} rebase differs`,
    );
  } else if (fixture.formulaId === "mezo-epoch-reward-remainder") {
    assert(
      (requiredBigInt(values, "emissionRaw") - requiredBigInt(values, "rebaseRaw")).toString() ===
        text(fixture.expected, `${fixture.id} expected value`),
      `${fixture.id} reward remainder differs`,
    );
  } else if (fixture.formulaId === "mezo-splitter-allocation") {
    const currentBalance = requiredBigInt(values, "currentBalanceRaw");
    const first = (currentBalance * requiredBigInt(values, "needle")) / 100n;
    const second = currentBalance - first;
    const expected = object(fixture.expected, `${fixture.id} expected split`);
    assert(
      first.toString() ===
        text(expected.firstRecipientAmountRaw, `${fixture.id} expected first amount`),
      `${fixture.id} first split differs`,
    );
    assert(
      second.toString() ===
        text(expected.secondRecipientAmountRaw, `${fixture.id} expected second amount`),
      `${fixture.id} second split differs`,
    );
  } else if (fixture.formulaId === "mezo-epoch-catch-up-count") {
    const elapsed =
      (requiredBigInt(values, "currentPeriod") - requiredBigInt(values, "activePeriod")) /
      requiredBigInt(values, "week");
    const maximumPerUpdate = requiredBigInt(values, "maximumPerUpdate");
    const processed = elapsed < maximumPerUpdate ? elapsed : maximumPerUpdate;
    const expected = object(fixture.expected, `${fixture.id} expected catch-up counts`);
    assert(
      elapsed.toString() === text(expected.elapsed, `${fixture.id} expected elapsed count`),
      `${fixture.id} elapsed count differs`,
    );
    assert(
      processed.toString() === text(expected.processed, `${fixture.id} expected processed count`),
      `${fixture.id} processed count differs`,
    );
    assert(
      (elapsed - processed).toString() ===
        text(expected.remaining, `${fixture.id} expected remaining count`),
      `${fixture.id} remaining count differs`,
    );
  } else {
    throw new Error(`unknown incentives fixture formula ${fixture.formulaId}`);
  }
}

for (const fixture of validatorFixtures.records) {
  if (fixture.formulaId === "validator-vote-allocation") {
    const votingPower = BigInt(
      text(fixture.inputs.boostedVotingPowerRaw, `${fixture.id} boosted voting power`),
    );
    const relative = texts(fixture.inputs.externalWeights, `${fixture.id} external weights`).map(
      BigInt,
    );
    if (relative.length === 0) {
      assert(
        fixture.expected.outcome === "reset-without-division" &&
          fixture.expected.usedWeightRaw === "0",
        `${fixture.id} empty reset differs`,
      );
      continue;
    }
    const total = relative.reduce((sum, value) => sum + value, 0n);
    const allocations = relative.map((value) => (value * votingPower) / total);
    if (fixture.expected.outcome === "revert-ZeroBalance") {
      assert(allocations[0] === 0n, `${fixture.id} does not reach ZeroBalance`);
      continue;
    }
    const used = allocations.reduce((sum, value) => sum + value, 0n);
    assert(
      JSON.stringify(allocations.map(String)) === JSON.stringify(fixture.expected.gaugeVotesRaw),
      `${fixture.id} validator allocations differ`,
    );
    assert(used.toString() === fixture.expected.usedWeightRaw, `${fixture.id} used weight differs`);
    assert(
      (votingPower - used).toString() === fixture.expected.allocationFloorDustRaw,
      `${fixture.id} vote dust differs`,
    );
  } else if (fixture.formulaId === "validator-reward-index-notification") {
    const amount = BigInt(text(fixture.inputs.notifiedRewardRaw, `${fixture.id} notified reward`));
    const totalWeight = BigInt(
      text(
        fixture.inputs.preNotificationTotalWeightRaw,
        `${fixture.id} pre-notification total weight`,
      ),
    );
    const indexDelta = (amount * P) / (totalWeight > 0n ? totalWeight : 1n);
    assert(indexDelta.toString() === fixture.expected.indexDelta18, `${fixture.id} index differs`);
    if (fixture.inputs.gaugeWeightsRaw) {
      const shares = fixture.inputs.gaugeWeightsRaw.map(
        (weight) => (BigInt(weight) * indexDelta) / P,
      );
      const shareSum = shares.reduce((sum, value) => sum + value, 0n);
      assert(
        JSON.stringify(shares.map(String)) === JSON.stringify(fixture.expected.gaugeSharesRaw),
        `${fixture.id} shares differ`,
      );
      assert(
        shareSum.toString() === fixture.expected.gaugeShareSumRaw,
        `${fixture.id} sum differs`,
      );
      assert(
        (amount - shareSum).toString() === fixture.expected.floorDustRaw,
        `${fixture.id} dust differs`,
      );
    } else if (fixture.id === "validator-index-pinned-notification") {
      assert(
        fixture.expected.gaugeShareSumRaw === validatorNotification.shareSumRaw &&
          fixture.expected.floorDustRaw === validatorNotification.floorDustRaw,
        `${fixture.id} pinned evidence differs`,
      );
    } else {
      assert(fixture.expected.gaugeShareSumRaw === "0", `${fixture.id} zero-weight sum differs`);
      assert(
        fixture.expected.unallocatedRaw === amount.toString(),
        `${fixture.id} residual differs`,
      );
    }
  } else if (fixture.formulaId === "validator-gauge-distribution-gate") {
    const claimable = BigInt(
      text(fixture.inputs.updatedClaimableRaw, `${fixture.id} updated claimable`),
    );
    const left = BigInt(text(fixture.inputs.gaugeLeftRaw, `${fixture.id} gauge left`));
    const distribute = claimable > left && claimable > WEEK;
    assert(distribute === fixture.expected.distribute, `${fixture.id} gate differs`);
    if (distribute)
      assert(claimable.toString() === fixture.expected.amountRaw, `${fixture.id} amount differs`);
  } else if (fixture.formulaId === "validator-gauge-reward-rate") {
    const timestamp = BigInt(text(fixture.inputs.timestamp, `${fixture.id} timestamp`));
    const nextEpoch = timestamp - (timestamp % WEEK) + WEEK;
    const priorFinish = BigInt(
      text(fixture.inputs.priorPeriodFinish, `${fixture.id} prior period finish`),
    );
    const priorRate = BigInt(
      text(fixture.inputs.priorRewardRateRaw, `${fixture.id} prior reward rate`),
    );
    const leftover = timestamp < priorFinish ? (priorFinish - timestamp) * priorRate : 0n;
    const rate =
      (BigInt(text(fixture.inputs.distributionAmountRaw, `${fixture.id} distribution amount`)) +
        leftover) /
      (nextEpoch - timestamp);
    assert(nextEpoch.toString() === fixture.expected.nextEpoch, `${fixture.id} next epoch differs`);
    assert(
      (nextEpoch - timestamp).toString() === fixture.expected.timeUntilNext,
      `${fixture.id} remaining time differs`,
    );
    assert(leftover.toString() === fixture.expected.leftoverRaw, `${fixture.id} leftover differs`);
    assert(rate.toString() === fixture.expected.newRewardRateRaw, `${fixture.id} rate differs`);
    assert(nextEpoch.toString() === fixture.expected.periodFinish, `${fixture.id} finish differs`);
  } else if (fixture.formulaId === "validator-partial-result") {
    assert(
      fixture.expected.status === "unavailable" &&
        fixture.expected.value === null &&
        fixture.expected.syntheticZero === false,
      `${fixture.id} partial-result contract differs`,
    );
  } else {
    throw new Error(`unknown validator fixture formula ${fixture.formulaId}`);
  }
}

const [readme, gaps, candidates, generated] = await Promise.all([
  readFile(join(base, "README.md"), "utf8"),
  load<string>("incentives-gaps"),
  load<string>("incentives-candidates"),
  load<string>("incentives-reference"),
]);
assert(readme.includes("support is `none`"), "incentives README omits the support boundary");
assert(
  gaps.includes("registry provenance review") &&
    gaps.includes("accepted Contracts records") &&
    candidates.includes("Candidate"),
  "incentives review material is incomplete",
);
assert(
  generated.includes("Module: `protocols/incentives`") && generated.includes("Support: `none`"),
  "generated incentives reference is incomplete",
);
process.stdout.write(
  `Validated ${contracts.size} deployed roles, ${reproduction.records.length} source records, current emission and validator-allocation graphs, ${operations.records.length} operations, ${fixtures.records.length + validatorFixtures.records.length} formula fixtures, and ${writerOperations.size} historical writer integrations; reader and writer support remain gated.`,
);

function fail(message: string): never {
  throw new Error(message);
}
