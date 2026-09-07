import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, parseJson, type JsonObject } from "./lib/json.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const borrowingDirectory = join(repositoryRoot, "knowledge", "protocols", "musd", "borrowing");
const musdDirectory = resolve(borrowingDirectory, "..");
const idPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const hashPattern = /^0x[a-f0-9]{64}$/;
const rawWordPattern = /^0x[a-f0-9]{64}$/;
const exactAddressPattern = /(?<![a-fA-F0-9])0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;
const allowedStability = new Set([
  "stable-design",
  "versioned-design",
  "governed-state",
  "deployment-state",
]);

interface StatusRecord extends JsonObject {
  status: string;
  protocolStatus?: string;
  extensions?: JsonObject & { protocolStatus?: string };
  supportStatus: string;
  reviewStatus: string;
}

interface EvidenceReference extends JsonObject {
  sourceArtifactId: string;
  locator: string;
}

interface DomainRecord extends JsonObject {
  id: string;
  stability: string;
  claim: string;
  evidence: EvidenceReference[];
  expression: string;
  formulaId: string;
  inputs: Record<string, string>;
  expected: unknown;
  ownerContractId: string;
  getter: string;
  changeMechanism: string;
  observedValues: Record<string, unknown>;
  support: string;
  documentationDiscrepancy: string;
  contractId: string;
  preconditions: JsonObject;
  stateChanges: unknown[];
  events: string[];
  failureBoundaries: unknown[];
  feeBehavior: string;
}

interface DomainCatalog extends StatusRecord {
  schemaVersion: number;
  owner: string;
  kind: string;
  records: DomainRecord[];
  constants: Record<string, string>;
  observationArtifactId: string;
  rejectedInheritedRules: unknown[];
}

type CatalogName =
  "position" | "formulas" | "fixtures" | "parameters" | "operations" | "liquidations";

interface BorrowingIndex extends StatusRecord {
  schemaVersion: number;
  kind: string;
  moduleId: string;
  owner: string;
  verifiedAt: string;
  extensions: JsonObject & {
    protocolSource: { sourceId: string; commit: string };
    deploymentScope: { networkIds: string[]; contractModuleId: string; networkModuleId: string };
    blockedCapabilities: unknown[];
    resolvedDiscrepancies: (JsonObject & {
      id: string;
      resolution: string;
      staleEvidenceArtifactId: string;
      candidateId: string;
    })[];
  };
  protocolSource: { sourceId: string; commit: string };
  deploymentScope: { networkIds: string[]; contractModuleId: string; networkModuleId: string };
  blockedCapabilities: unknown[];
  resolvedDiscrepancies: (JsonObject & {
    id: string;
    resolution: string;
    staleEvidenceArtifactId: string;
    candidateId: string;
  })[];
  catalogs: Record<CatalogName, string>;
  candidateInventory: string;
  derivedReference: string;
  skill: string;
  evidence: string[];
}

interface Source extends JsonObject {
  id: string;
  commit?: string;
}

interface Artifact extends JsonObject {
  id: string;
  path: string;
  sha256: string;
}

interface SourceCatalog extends StatusRecord {
  sources: Source[];
  artifacts: Artifact[];
}

interface Deployment extends JsonObject {
  id: string;
  contractId: string;
  networkId: string;
  runtime: { blockNumber: number; blockHash: string };
}

interface Endpoint extends JsonObject {
  id: string;
  networkId: string;
}

interface Snapshot extends JsonObject {
  networkId: string;
  endpointId: string;
  blockNumber: number;
  blockHash: string;
}

interface ParameterRead extends JsonObject {
  function: string;
  deploymentId: string;
  rawResult: string;
  decoded: string | boolean;
}

interface NetworkObservation extends JsonObject {
  id: string;
  networkId: string;
  reads: ParameterRead[];
}

interface ObservationSet extends JsonObject {
  schemaVersion: number;
  kind: string;
  observedAt: string;
  reviewAfter: string;
  networkSnapshots: Snapshot[];
  observations: NetworkObservation[];
}

interface FormulaInputs {
  collateral: bigint;
  price: bigint;
  debt: bigint;
  principal: bigint;
  annualRateBps: bigint;
  elapsedSeconds: bigint;
  requestedDebt: bigint;
  borrowingRate: bigint;
  refinancingFeePercentage: bigint;
  netDebt: bigint;
  borrowingFee: bigint;
  gasCompensation: bigint;
  minimumCollateralRatio: bigint;
  payment: bigint;
  interestOwed: bigint;
  entireCollateral: bigint;
  percentDivisor: bigint;
  interest: bigint;
  stabilityPoolDeposits: bigint;
  liquidatableCollateral: bigint;
  stake: bigint;
  cumulativePerUnit: bigint;
  snapshotPerUnit: bigint;
  totalStakes: bigint;
  amount: bigint;
  previousError: bigint;
  collateralRatio: bigint;
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function assertString(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a non-empty string`);
}

function assertUnique(values: readonly (string | number)[], label: string): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate '${value}'`);
    seen.add(value);
  }
}

function assertStatus(record: StatusRecord, label: string, expectedSupport = "supported"): void {
  assert(record.status === "verified", `${label} status must be verified`);
  assert(
    record.protocolStatus === "verified-versioned" ||
      record.extensions?.protocolStatus === "verified-versioned",
    `${label} protocol status is invalid`,
  );
  assert(record.supportStatus === expectedSupport, `${label} support status is invalid`);
  assert(record.reviewStatus === "accepted", `${label} review must be accepted`);
}

function assertTimestamp(value: unknown, label: string): void {
  assertString(value, label);
  assert(Number.isFinite(Date.parse(value)), `${label} must be an RFC 3339 timestamp`);
}

function bigint(value: unknown, label: string): bigint {
  assert(
    typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value),
    `${label} must be an unsigned decimal string`,
  );
  return BigInt(value);
}

async function loadJson<T>(path: string): Promise<T> {
  return parseJson(await readFile(path, "utf8"), path) as T;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

const index = await loadJson<BorrowingIndex>(join(borrowingDirectory, "index.json"));
assert(index.schemaVersion === 1, "borrowing index schemaVersion must be 1");
assert(
  index.kind === "knowledge-module-index" && index.moduleId === "protocols/musd/borrowing",
  "borrowing index kind is invalid",
);
assert(index.owner === "protocols/musd/borrowing", "borrowing index owner is invalid");
assertStatus(index, "borrowing index");
assertTimestamp(index.verifiedAt, "borrowing index verifiedAt");
Object.assign(index, {
  protocolSource: index.extensions.protocolSource,
  deploymentScope: index.extensions.deploymentScope,
  blockedCapabilities: index.extensions.blockedCapabilities,
  resolvedDiscrepancies: index.extensions.resolvedDiscrepancies,
  catalogs: {
    position: "records/position.json",
    formulas: "records/formulas.json",
    fixtures: "fixtures/formulas.json",
    parameters: "records/parameters.json",
    operations: "records/operations.json",
    liquidations: "records/liquidations.json",
  },
  candidateInventory: "review/candidates.md",
  derivedReference: "../../../../docs/reference/musd-borrowing.md",
  skill: "../../../../agents/skills/mdk-musd-borrowing/SKILL.md",
  evidence: ["evidence/parameter-reads-2026-08-18.json"],
});
assert(
  /^[a-f0-9]{40}$/.test(index.protocolSource?.commit),
  "borrowing source commit must be a full SHA",
);
assertUnique(index.deploymentScope.networkIds, "borrowing network scope");
assert(
  Array.isArray(index.blockedCapabilities) && index.blockedCapabilities.length === 0,
  "borrowing index has an unexpected capability block",
);
assert(
  Array.isArray(index.resolvedDiscrepancies) && index.resolvedDiscrepancies.length > 0,
  "borrowing index must retain resolved evidence discrepancies",
);
const refinanceDiscrepancy = index.resolvedDiscrepancies.find(
  (item) => item.id === "refinance-fee-docs-vs-deployment",
);
assert(
  refinanceDiscrepancy?.resolution === "deployment-evidence-prevails",
  "refinance discrepancy resolution is invalid",
);
assert(
  refinanceDiscrepancy?.staleEvidenceArtifactId === "docs-borrow-fees",
  "refinance stale evidence is not identified",
);

for (const path of [
  index.candidateInventory,
  index.derivedReference,
  index.skill,
  ...index.evidence,
]) {
  assert(await exists(resolve(borrowingDirectory, path)), `indexed file ${path} is missing`);
}

const sources = await loadJson<SourceCatalog>(join(musdDirectory, "sources", "catalog.json"));
assertStatus(sources, "MUSD source catalog", "none");
const sourcesById = new Map(sources.sources.map((source) => [source.id, source]));
const artifactsById = new Map(sources.artifacts.map((artifact) => [artifact.id, artifact]));
assertUnique(
  sources.artifacts.map((artifact) => artifact.id),
  "MUSD source artifact IDs",
);
assert(
  sourcesById.get(index.protocolSource.sourceId)?.commit === index.protocolSource.commit,
  "borrowing and MUSD source commits differ",
);

function assertEvidence(records: readonly EvidenceReference[], label: string): void {
  assert(records.length > 0, `${label} needs evidence`);
  let authoritative = 0;
  for (const evidence of records) {
    const artifact = artifactsById.get(evidence.sourceArtifactId);
    assert(artifact, `${label} references unknown artifact ${evidence.sourceArtifactId}`);
    assertString(evidence.locator, `${label} evidence locator`);
    authoritative += 1;
  }
  assert(authoritative > 0, `${label} needs authoritative evidence`);
}

assert(
  index.deploymentScope.contractModuleId === "contracts",
  "borrowing contract module ID is invalid",
);
const abiCatalogDocument = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-abis",
  })
).document;
const deploymentCatalogDocument = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "contracts",
    resourceId: "contract-deployments",
  })
).document;
const abiRecords = objects(object(abiCatalogDocument, "ABI catalog").records, "ABI records");
const deploymentRecords = objects(
  object(deploymentCatalogDocument, "deployment catalog").records,
  "deployment records",
) as Deployment[];
const contractIds = new Set(abiRecords.map((record) => record.contractId));
const deploymentsById = new Map(deploymentRecords.map((record) => [record.id, record]));
const networks = await Promise.all(
  index.deploymentScope.networkIds.map(async (networkId) =>
    object(
      (
        await loadKnowledgeReference(repositoryRoot, {
          moduleId: "networks",
          resourceId: networkId,
        })
      ).document,
      `network ${networkId}`,
    ),
  ),
);
assert(
  index.deploymentScope.networkModuleId === "networks",
  "borrowing network module ID is invalid",
);
const networksById = new Map(networks.map((network) => [network.id, network]));
const endpointCatalogDocument = (
  await loadKnowledgeReference(repositoryRoot, {
    moduleId: "networks",
    resourceId: "rpc-endpoints",
  })
).document;
const endpointRecords = objects(
  object(endpointCatalogDocument, "endpoint catalog").records,
  "endpoint records",
) as Endpoint[];
const endpointsById = new Map(endpointRecords.map((endpoint) => [endpoint.id, endpoint]));

for (const networkId of index.deploymentScope.networkIds) {
  assert(networksById.has(networkId), `unknown borrowing network ${networkId}`);
}

const catalogNames: CatalogName[] = [
  "position",
  "formulas",
  "fixtures",
  "parameters",
  "operations",
  "liquidations",
];
const catalogs = {} as Record<CatalogName, DomainCatalog>;
for (const name of catalogNames) {
  const path = index.catalogs[name];
  catalogs[name] = await loadJson<DomainCatalog>(join(borrowingDirectory, path));
  assert(catalogs[name].schemaVersion === 1, `${name} schemaVersion must be 1`);
  assert(catalogs[name].owner === index.owner, `${name} owner is invalid`);
  assertStatus(catalogs[name], name, name === "fixtures" ? "none" : "supported");
}

const expectedKinds: Record<CatalogName, string> = {
  position: "musd-borrowing-position-model",
  formulas: "musd-borrowing-formula-catalog",
  fixtures: "musd-borrowing-formula-fixtures",
  parameters: "musd-borrowing-parameter-catalog",
  operations: "musd-borrowing-operation-catalog",
  liquidations: "musd-liquidation-model",
};
for (const name of catalogNames) {
  const kind = expectedKinds[name];
  assert(catalogs[name].kind === kind, `${name} kind is invalid`);
  assert(
    Array.isArray(catalogs[name].records) && catalogs[name].records.length > 0,
    `${name} records are missing`,
  );
  assertUnique(
    catalogs[name].records.map((record) => record.id),
    `${name} IDs`,
  );
  for (const record of catalogs[name].records)
    assert(idPattern.test(record.id), `${name} ID '${record.id}' is invalid`);
}

assert(catalogs.position.records.length >= 8, "position model is incomplete");
for (const record of catalogs.position.records) {
  assert(allowedStability.has(record.stability), `position ${record.id} stability is invalid`);
  assertString(record.claim, `position ${record.id} claim`);
  assertEvidence(record.evidence, `position ${record.id}`);
}

const formulaIds = new Set(catalogs.formulas.records.map((record) => record.id));
assert(catalogs.formulas.records.length >= 13, "formula catalog is incomplete");
for (const record of catalogs.formulas.records) {
  assertString(record.expression, `formula ${record.id} expression`);
  assertEvidence(record.evidence, `formula ${record.id}`);
}

const D = bigint(catalogs.formulas.constants.decimalPrecision, "decimalPrecision");
const N = bigint(catalogs.formulas.constants.nicrPrecision, "nicrPrecision");
const BPS = bigint(catalogs.formulas.constants.basisPoints, "basisPoints");
const YEAR = bigint(catalogs.formulas.constants.secondsInProtocolYear, "secondsInProtocolYear");
const MAX = bigint(catalogs.formulas.constants.uint256Max, "uint256Max");

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function evaluateFixture(fixture: DomainRecord): unknown {
  const input = Object.fromEntries(
    Object.entries(fixture.inputs).map(([key, value]) => [
      key,
      bigint(value, `${fixture.id}.${key}`),
    ]),
  ) as unknown as FormulaInputs;
  switch (fixture.formulaId) {
    case "collateral-value":
      return ((input.collateral * input.price) / D).toString();
    case "collateral-ratio":
      return (input.debt === 0n ? MAX : (input.collateral * input.price) / input.debt).toString();
    case "nominal-collateral-ratio":
      return (input.principal === 0n ? MAX : (input.collateral * N) / input.principal).toString();
    case "simple-interest":
      return (
        (input.principal * input.annualRateBps * input.elapsedSeconds) /
        (BPS * YEAR)
      ).toString();
    case "borrowing-fee":
      return ((input.requestedDebt * input.borrowingRate) / D).toString();
    case "refinancing-fee": {
      const feeBase = (input.refinancingFeePercentage * input.netDebt) / 100n;
      return ((feeBase * input.borrowingRate) / D).toString();
    }
    case "net-debt-on-open":
      return (input.requestedDebt + input.borrowingFee).toString();
    case "composite-debt":
      return (input.netDebt + input.gasCompensation).toString();
    case "max-borrowing-capacity":
      return ((input.collateral * input.price) / input.minimumCollateralRatio).toString();
    case "debt-payment-split": {
      const interestAdjustment = min(input.payment, input.interestOwed);
      return {
        principalAdjustment: (input.payment - interestAdjustment).toString(),
        interestAdjustment: interestAdjustment.toString(),
      };
    }
    case "collateral-gas-compensation":
      return (input.entireCollateral / input.percentDivisor).toString();
    case "liquidation-offset": {
      const interestToOffset = min(input.interest, input.stabilityPoolDeposits);
      const principalToOffset = min(
        input.principal,
        input.stabilityPoolDeposits - interestToOffset,
      );
      const debtToOffset = interestToOffset + principalToOffset;
      const collateralToStabilityPool =
        (input.liquidatableCollateral * debtToOffset) / (input.principal + input.interest);
      return {
        principalToOffset: principalToOffset.toString(),
        interestToOffset: interestToOffset.toString(),
        collateralToStabilityPool: collateralToStabilityPool.toString(),
        principalToRedistribute: (input.principal - principalToOffset).toString(),
        interestToRedistribute: (input.interest - interestToOffset).toString(),
        collateralToRedistribute: (
          input.liquidatableCollateral - collateralToStabilityPool
        ).toString(),
      };
    }
    case "pending-reward":
      return ((input.stake * (input.cumulativePerUnit - input.snapshotPerUnit)) / D).toString();
    case "redistribution-per-unit": {
      assert(input.totalStakes > 0n, `${fixture.id} totalStakes must be nonzero`);
      const numerator = input.amount * D + input.previousError;
      const perUnit = numerator / input.totalStakes;
      return {
        perUnit: perUnit.toString(),
        nextError: (numerator - perUnit * input.totalStakes).toString(),
      };
    }
    case "reciprocal-ltv-display":
      assert(input.collateralRatio > 0n, `${fixture.id} has undefined zero-CR LTV`);
      return ((D * D) / input.collateralRatio).toString();
    default:
      fail(`no evaluator for formula ${fixture.formulaId}`);
  }
}

const coveredFormulaIds = new Set();
for (const fixture of catalogs.fixtures.records) {
  assert(
    formulaIds.has(fixture.formulaId),
    `${fixture.id} references unknown formula ${fixture.formulaId}`,
  );
  const actual = evaluateFixture(fixture);
  assert(
    JSON.stringify(actual) === JSON.stringify(fixture.expected),
    `${fixture.id} expected ${JSON.stringify(fixture.expected)} but computed ${JSON.stringify(actual)}`,
  );
  coveredFormulaIds.add(fixture.formulaId);
}
for (const formulaId of formulaIds)
  assert(coveredFormulaIds.has(formulaId), `formula ${formulaId} has no executable fixture`);

const normalMinimum = catalogs.fixtures.records.find(
  (record) => record.id === "normal-open-minimum-request",
);
const normalBelow = catalogs.fixtures.records.find(
  (record) => record.id === "normal-open-one-wei-too-low",
);
assert(normalMinimum !== undefined, "normal minimum fixture is missing");
assert(normalBelow !== undefined, "normal below-minimum fixture is missing");
const currentRate = 1000000000000000n;
assert(
  (bigint(normalMinimum.inputs.requestedDebt, "normal minimum requested debt") * currentRate) /
    D ===
    bigint(normalMinimum.inputs.borrowingFee, "normal minimum borrowing fee"),
  "minimum-request fixture fee is not independently derived",
);
assert(
  (bigint(normalBelow.inputs.requestedDebt, "below-minimum requested debt") * currentRate) / D ===
    bigint(normalBelow.inputs.borrowingFee, "below-minimum borrowing fee"),
  "one-below fixture fee is not independently derived",
);

assert(
  catalogs.parameters.records.length === 9,
  "parameter catalog must contain nine scoped records",
);
const parametersById = new Map(catalogs.parameters.records.map((record) => [record.id, record]));
for (const parameter of catalogs.parameters.records) {
  assert(
    contractIds.has(parameter.ownerContractId),
    `${parameter.id} has unknown contract ${parameter.ownerContractId}`,
  );
  assert(allowedStability.has(parameter.stability), `${parameter.id} stability is invalid`);
  assertString(parameter.getter, `${parameter.id} getter`);
  assertString(parameter.changeMechanism, `${parameter.id} change mechanism`);
  assertEvidence(parameter.evidence, `parameter ${parameter.id}`);
  for (const networkId of index.deploymentScope.networkIds) {
    assert(
      Object.hasOwn(parameter.observedValues, networkId),
      `${parameter.id} lacks ${networkId} value`,
    );
    assert(
      deploymentsById.has(`${parameter.ownerContractId}@${networkId}`),
      `${parameter.id} owner lacks ${networkId} deployment`,
    );
  }
}
assert(
  parametersById.get("refinancing-fee-percentage")?.support === "proposed",
  "refinancing parameter support is invalid",
);
assert(
  parametersById.get("refinancing-fee-percentage")?.documentationDiscrepancy.includes("stale"),
  "refinancing parameter omits stale documentation status",
);

const observationPath = index.evidence[0] ?? fail("parameter observation path is missing");
const observation = await loadJson<ObservationSet>(resolve(borrowingDirectory, observationPath));
assert(
  observation.schemaVersion === 1 && observation.kind === "musd-borrowing-parameter-observations",
  "parameter observation kind is invalid",
);
assertTimestamp(observation.observedAt, "parameter observations observedAt");
assertTimestamp(observation.reviewAfter, "parameter observations reviewAfter");
assert(
  observation.networkSnapshots.length === index.deploymentScope.networkIds.length,
  "parameter network snapshots are incomplete",
);
const snapshotsByNetwork = new Map(
  observation.networkSnapshots.map((snapshot) => [snapshot.networkId, snapshot]),
);
const getterToParameter = new Map(
  catalogs.parameters.records.map((parameter) => [parameter.getter, parameter]),
);
for (const snapshot of observation.networkSnapshots) {
  const endpoint = endpointsById.get(snapshot.endpointId);
  assert(endpoint?.networkId === snapshot.networkId, `${snapshot.networkId} endpoint mismatch`);
  assert(hashPattern.test(snapshot.blockHash), `${snapshot.networkId} block hash is invalid`);
}
assertUnique(
  observation.observations.map((item) => item.id),
  "parameter observation IDs",
);
for (const networkObservation of observation.observations) {
  const snapshot = snapshotsByNetwork.get(networkObservation.networkId);
  assert(snapshot, `${networkObservation.id} lacks a network snapshot`);
  assert(
    networkObservation.reads.length === catalogs.parameters.records.length,
    `${networkObservation.id} must contain one read per parameter`,
  );
  for (const read of networkObservation.reads) {
    const parameter = getterToParameter.get(read.function);
    assert(parameter, `${networkObservation.id} has unexpected getter ${read.function}`);
    const deployment = deploymentsById.get(read.deploymentId);
    assert(
      deployment?.contractId === parameter.ownerContractId,
      `${read.function} owner deployment mismatch`,
    );
    assert(
      deployment.networkId === networkObservation.networkId,
      `${read.function} deployment network mismatch`,
    );
    assert(
      deployment.runtime.blockNumber === snapshot.blockNumber,
      `${read.function} block differs from registry evidence`,
    );
    assert(
      deployment.runtime.blockHash === snapshot.blockHash,
      `${read.function} block hash differs from registry evidence`,
    );
    assert(rawWordPattern.test(read.rawResult), `${read.function} raw result is invalid`);
    const decoded = read.decoded;
    if (typeof decoded === "boolean")
      assert(
        (BigInt(read.rawResult) !== 0n) === decoded,
        `${read.function} boolean decode differs`,
      );
    else
      assert(
        BigInt(read.rawResult).toString() === decoded,
        `${read.function} integer decode differs`,
      );
    assert(
      JSON.stringify(parameter.observedValues[networkObservation.networkId]) ===
        JSON.stringify(decoded),
      `${parameter.id} catalog and observation differ`,
    );
  }
}
const observationArtifact = artifactsById.get(catalogs.parameters.observationArtifactId);
assert(
  observationArtifact?.path ===
    "knowledge/protocols/musd/borrowing/evidence/parameter-reads-2026-08-18.json",
  "parameter observation artifact path differs",
);
assert(
  (await sha256(resolve(repositoryRoot, observationArtifact.path))) === observationArtifact.sha256,
  "parameter observation artifact digest drifted",
);

assert(catalogs.operations.records.length === 8, "operation catalog must contain eight operations");
const borrowerAbiRecord = abiRecords.find(
  (record) => record.contractId === "musd.borrower-operations",
);
assert(borrowerAbiRecord !== undefined, "BorrowerOperations ABI record is missing");
const borrowerAbi = (
  await loadKnowledgeReference(
    repositoryRoot,
    object(borrowerAbiRecord.artifactReference, "BorrowerOperations ABI reference"),
  )
).document;
const borrowerEvents = new Set(
  objects(borrowerAbi, "BorrowerOperations ABI")
    .filter((entry) => entry.type === "event")
    .map((entry) => entry.name),
);
for (const operation of catalogs.operations.records) {
  assert(
    operation.contractId === "musd.borrower-operations",
    `${operation.id} contract owner is invalid`,
  );
  assertString(operation.support, `${operation.id} support`);
  assert(
    operation.preconditions && Object.keys(operation.preconditions).length > 0,
    `${operation.id} preconditions are missing`,
  );
  assert(
    Array.isArray(operation.stateChanges) && operation.stateChanges.length > 0,
    `${operation.id} state changes are missing`,
  );
  assert(Array.isArray(operation.events), `${operation.id} events must be an array`);
  for (const event of operation.events)
    assert(
      borrowerEvents.has(event),
      `${operation.id} references unknown BorrowerOperations event ${event}`,
    );
  assert(
    Array.isArray(operation.failureBoundaries) && operation.failureBoundaries.length > 0,
    `${operation.id} failure boundaries are missing`,
  );
  assertEvidence(operation.evidence, `operation ${operation.id}`);
}
const refinanceOperation = catalogs.operations.records.find(
  (record) => record.id === "refinance-trove",
);
assert(refinanceOperation?.support === "proposed", "refinance operation support is invalid");
assert(
  refinanceOperation?.feeBehavior.includes("0.02%"),
  "refinance operation omits deployed effective fee",
);

assert(catalogs.liquidations.records.length >= 7, "liquidation model is incomplete");
const troveAbiRecord = abiRecords.find((record) => record.contractId === "musd.trove-manager");
assert(troveAbiRecord !== undefined, "TroveManager ABI record is missing");
const troveAbi = (
  await loadKnowledgeReference(
    repositoryRoot,
    object(troveAbiRecord.artifactReference, "TroveManager ABI reference"),
  )
).document;
const troveEvents = new Set(
  objects(troveAbi, "TroveManager ABI")
    .filter((entry) => entry.type === "event")
    .map((entry) => entry.name),
);
for (const record of catalogs.liquidations.records) {
  assert(allowedStability.has(record.stability), `liquidation ${record.id} stability is invalid`);
  assertString(record.claim, `liquidation ${record.id} claim`);
  for (const event of record.events ?? [])
    assert(troveEvents.has(event), `${record.id} references unknown TroveManager event ${event}`);
  assertEvidence(record.evidence, `liquidation ${record.id}`);
}
assert(
  catalogs.liquidations.rejectedInheritedRules.length >= 4,
  "rejected inherited liquidation rules are incomplete",
);

const candidateContents = await readFile(
  resolve(borrowingDirectory, index.candidateInventory),
  "utf8",
);
for (const candidateId of index.resolvedDiscrepancies.map((item) => item.candidateId)) {
  assert(
    candidateContents.includes(candidateId),
    `resolved discrepancy candidate ${candidateId} is absent from ledger`,
  );
}
const docsContents = await readFile(resolve(borrowingDirectory, index.derivedReference), "utf8");
const skillContents = await readFile(resolve(borrowingDirectory, index.skill), "utf8");
assert(
  docsContents.includes("0.02%") && docsContents.includes("0.1%") && docsContents.includes("stale"),
  "derived reference omits refinance evidence resolution",
);
assert(
  skillContents.includes("deployed behavior") && skillContents.includes("Stop Conditions"),
  "borrowing skill omits evidence priority or stop conditions",
);

for (const path of [
  ...Object.values(index.catalogs)
    .filter((path) => path !== "../sources.json")
    .map((path) => resolve(borrowingDirectory, path)),
  resolve(borrowingDirectory, index.candidateInventory),
  resolve(borrowingDirectory, index.derivedReference),
  resolve(borrowingDirectory, index.skill),
]) {
  assert(
    !exactAddressPattern.test(await readFile(path, "utf8")),
    `${relative(repositoryRoot, path)} duplicates an EVM address`,
  );
}

process.stdout.write(
  `Validated ${catalogs.position.records.length} position rules, ${catalogs.formulas.records.length} formulas with ${catalogs.fixtures.records.length} fixtures, ${catalogs.parameters.records.length} parameters, ${catalogs.operations.records.length} operations, and ${catalogs.liquidations.records.length} liquidation rules.\n`,
);
