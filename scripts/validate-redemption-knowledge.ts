import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";
import { object, objects, parseJson, text, type JsonObject } from "./lib/json.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "knowledge", "protocols", "musd", "redemptions");
const musdDir = resolve(dir, "..");
const idPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const exactAddressPattern = /(?<![a-fA-F0-9])0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/;

interface Reference extends JsonObject {
  moduleId: string;
  resourceId: string;
  recordId?: string;
}

interface StatusRecord extends JsonObject {
  status: string;
  protocolStatus?: string;
  extensions?: JsonObject & { protocolStatus?: string };
  supportStatus: string;
  reviewStatus: string;
}

interface EvidenceItem extends JsonObject {
  sourceArtifactId?: string;
  locator?: string;
  canonicalReference?: Reference;
}

interface ProtocolSource extends JsonObject {
  sourceId: string;
  commit: string;
}

interface DeploymentScope extends JsonObject {
  networkIds: string[];
  contractModuleId: string;
  networkModuleId: string;
}

interface Discrepancy extends JsonObject {
  id: string;
  resolution: string;
  candidateId: string;
}

interface RedemptionIndex extends StatusRecord {
  schemaVersion: number;
  kind: string;
  moduleId: string;
  owner: string;
  verifiedAt: string;
  extensions: JsonObject & {
    protocolSource: ProtocolSource;
    deploymentScope: DeploymentScope;
    resolvedDiscrepancies: Discrepancy[];
    dependencies: Record<string, Reference>;
  };
  protocolSource: ProtocolSource;
  deploymentScope: DeploymentScope;
  resolvedDiscrepancies: Discrepancy[];
  catalogs: {
    model: string;
    formulas: string;
    fixtures: string;
    parameters: string;
  };
  candidateInventory: string;
  derivedReference: string;
  skill: string;
  evidence: string[];
  dependencies: Record<string, Reference>;
}

interface Source extends JsonObject {
  id: string;
  commit?: string;
}

interface SourceArtifact extends JsonObject {
  id: string;
  path: string;
  sha256: string;
}

interface SourceCatalog extends StatusRecord {
  sources: Source[];
  artifacts: SourceArtifact[];
}

interface Catalog<T extends JsonObject> extends StatusRecord {
  schemaVersion: number;
  kind: string;
  owner: string;
  records: T[];
}

interface ModelRecord extends JsonObject {
  id: string;
  claim: string;
  evidence: EvidenceItem[];
  events?: string[];
}

interface ModelCatalog extends Catalog<ModelRecord> {
  futureWriterRequirements: unknown[];
}

interface FormulaRecord extends JsonObject {
  id: string;
  expression: string;
  evidence: EvidenceItem[];
}

interface FormulaCatalog extends Catalog<FormulaRecord> {
  constants: { decimalPrecision: string };
  sharedFormulaReferences: Reference[];
}

interface FormulaFixture extends JsonObject {
  id: string;
  formulaId: string;
  inputs: Record<string, string>;
  expected: string;
}

interface EligibilityBoundary extends JsonObject {
  id: string;
  ratio: string;
  threshold: string;
  expectedEligible: boolean;
}

interface ScenarioPosition extends JsonObject {
  id: string;
  eligible: boolean;
  netDebt: string;
}

interface Scenario extends JsonObject {
  id: string;
  attemptedAmount: string;
  minNetDebt: string;
  maxIterations: string;
  positions: ScenarioPosition[];
  expected: JsonObject;
}

interface FixtureCatalog extends Catalog<FormulaFixture> {
  eligibilityBoundaries: EligibilityBoundary[];
  scenarios: Scenario[];
}

interface Parameter extends JsonObject {
  id: string;
  stability: string;
  documentationDiscrepancy: string;
  evidence: EvidenceItem[];
  ownerContractId: string;
  getter: string;
  observedValues: Record<string, string>;
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

interface Observation extends JsonObject {
  id: string;
  deploymentId: string;
  endpointId: string;
  networkId: string;
  blockNumber: number;
  blockHash: string;
  function: string;
  callData: string;
  rawResult: string;
  decoded: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function nonempty(value: unknown, label: string): string {
  const result = text(value, label);
  assert(result.length > 0, `${label} must be a non-empty string`);
  return result;
}

function unique(values: readonly unknown[], label: string): void {
  assert(new Set(values).size === values.length, `${label} contains duplicates`);
}

function status(record: StatusRecord, label: string, expectedSupport = "supported"): void {
  assert(record.status === "verified", `${label} status is invalid`);
  assert(
    record.protocolStatus === "verified-versioned" ||
      record.extensions?.protocolStatus === "verified-versioned",
    `${label} protocol status is invalid`,
  );
  assert(record.supportStatus === expectedSupport, `${label} support status is invalid`);
  assert(record.reviewStatus === "accepted", `${label} review must be accepted`);
}

function integer(value: unknown, label: string): bigint {
  const result = text(value, label);
  assert(/^(0|[1-9][0-9]*)$/.test(result), `${label} must be an unsigned decimal string`);
  return BigInt(result);
}

async function json<T>(path: string): Promise<T> {
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

async function sha(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function evidence(
  records: readonly EvidenceItem[],
  artifactById: ReadonlyMap<string, SourceArtifact>,
  label: string,
): void {
  assert(records.length > 0, `${label} needs evidence`);
  let authoritative = 0;
  for (const item of records) {
    if (item.sourceArtifactId !== undefined) {
      assert(
        artifactById.has(item.sourceArtifactId),
        `${label} references unknown artifact ${item.sourceArtifactId}`,
      );
      nonempty(item.locator, `${label} locator`);
      authoritative += 1;
    } else if (item.canonicalReference !== undefined) {
      assert(
        item.canonicalReference.moduleId === "protocols/musd/borrowing" &&
          item.canonicalReference.resourceId === "borrowing-formulas" &&
          item.canonicalReference.recordId === "debt-payment-split",
        `${label} canonical reference is unexpected`,
      );
      authoritative += 1;
    } else {
      fail(`${label} evidence is malformed`);
    }
  }
  assert(authoritative > 0, `${label} needs authoritative evidence`);
}

const index = await json<RedemptionIndex>(join(dir, "index.json"));
assert(
  index.schemaVersion === 1 &&
    index.kind === "knowledge-module-index" &&
    index.moduleId === "protocols/musd/redemptions",
  "redemption index is invalid",
);
assert(index.owner === "protocols/musd/redemptions", "redemption owner is invalid");
status(index, "redemption index");
assert(Number.isFinite(Date.parse(index.verifiedAt)), "redemption verifiedAt is invalid");
Object.assign(index, {
  protocolSource: index.extensions.protocolSource,
  deploymentScope: index.extensions.deploymentScope,
  resolvedDiscrepancies: index.extensions.resolvedDiscrepancies,
  catalogs: {
    model: "records/model.json",
    formulas: "records/formulas.json",
    fixtures: "fixtures/formulas.json",
    parameters: "records/parameters.json",
  },
  candidateInventory: "review/candidates.md",
  derivedReference: "../../../../docs/reference/musd-redemptions.md",
  skill: "../../../../agents/skills/mdk-musd-redemptions/SKILL.md",
  evidence: ["evidence/parameter-reads-2026-08-18.json"],
  dependencies: index.extensions.dependencies,
});
assert(/^[a-f0-9]{40}$/.test(index.protocolSource.commit), "redemption source commit is invalid");
unique(index.deploymentScope.networkIds, "redemption network scope");
for (const path of [
  index.candidateInventory,
  index.derivedReference,
  index.skill,
  ...index.evidence,
]) {
  assert(await exists(resolve(dir, path)), `indexed file ${path} is missing`);
}
for (const reference of Object.values(index.dependencies))
  await loadKnowledgeReference(root, reference);
const discrepancy = index.resolvedDiscrepancies.find(
  (item) => item.id === "borrower-redemption-fee-waiver",
);
assert(discrepancy !== undefined, "fee-waiver discrepancy is missing");
assert(
  discrepancy.resolution === "deployment-evidence-prevails",
  "fee-waiver discrepancy is unresolved",
);

const sources = await json<SourceCatalog>(join(musdDir, "sources", "catalog.json"));
status(sources, "MUSD source catalog", "none");
const sourceById = new Map(sources.sources.map((item) => [item.id, item]));
const artifactById = new Map(sources.artifacts.map((item) => [item.id, item]));
assert(
  sourceById.get(index.protocolSource.sourceId)?.commit === index.protocolSource.commit,
  "source commits differ",
);

const model = await json<ModelCatalog>(join(dir, index.catalogs.model));
const formulas = await json<FormulaCatalog>(join(dir, index.catalogs.formulas));
const fixtures = await json<FixtureCatalog>(join(dir, index.catalogs.fixtures));
const parameters = await json<Catalog<Parameter>>(join(dir, index.catalogs.parameters));
for (const [name, catalog, expectedSupport] of [
  ["model", model, "supported"],
  ["formulas", formulas, "supported"],
  ["fixtures", fixtures, "none"],
  ["parameters", parameters, "supported"],
] as const) {
  assert(
    catalog.schemaVersion === 1 && catalog.owner === index.owner,
    `${name} metadata is invalid`,
  );
  status(catalog, name, expectedSupport);
  unique(
    catalog.records.map((item) => item.id),
    `${name} IDs`,
  );
  for (const record of catalog.records) {
    assert(idPattern.test(record.id), `${name} ID ${record.id} is invalid`);
  }
}

assert(
  model.kind === "musd-redemption-model" && model.records.length >= 11,
  "redemption model is incomplete",
);
for (const record of model.records) {
  nonempty(record.claim, `model ${record.id} claim`);
  evidence(record.evidence, artifactById, `model ${record.id}`);
}
assert(model.futureWriterRequirements.length >= 5, "future writer requirements are incomplete");

assert(
  formulas.kind === "musd-redemption-formula-catalog" && formulas.records.length === 6,
  "formula catalog is incomplete",
);
for (const reference of formulas.sharedFormulaReferences) {
  await loadKnowledgeReference(root, reference);
}
for (const record of model.records) {
  for (const item of record.evidence) {
    if (item.canonicalReference !== undefined) {
      await loadKnowledgeReference(root, item.canonicalReference);
    }
  }
}
const formulaIds = new Set(formulas.records.map((item) => item.id));
for (const formula of formulas.records) {
  nonempty(formula.expression, `formula ${formula.id} expression`);
  evidence(formula.evidence, artifactById, `formula ${formula.id}`);
}
const decimalPrecision = integer(formulas.constants.decimalPrecision, "decimal precision");
const min = (left: bigint, right: bigint): bigint => (left < right ? left : right);

function evaluate(fixture: FormulaFixture): string {
  const inputs = Object.fromEntries(
    Object.entries(fixture.inputs).map(([key, value]) => [
      key,
      integer(value, `${fixture.id}.${key}`),
    ]),
  );
  const input = (key: string): bigint =>
    inputs[key] ?? fail(`${fixture.id} is missing input ${key}`);
  switch (fixture.formulaId) {
    case "redeemable-lot":
      return min(
        input("remainingRequested"),
        input("entireDebt") - input("gasCompensation"),
      ).toString();
    case "collateral-lot":
      return ((input("musdLot") * decimalPrecision) / input("price")).toString();
    case "collateral-fee":
      return ((input("collateralDrawn") * input("redemptionRate")) / decimalPrecision).toString();
    case "collateral-to-redeemer":
      return (input("collateralDrawn") - input("collateralFee")).toString();
    case "hint-truncated-partial-lot":
      return (
        input("netDebt") <= input("minNetDebt")
          ? 0n
          : min(input("remainingRequested"), input("netDebt") - input("minNetDebt"))
      ).toString();
    case "actual-redeemed-amount":
      return (input("attemptedAmount") - input("unfilledAmount")).toString();
    default:
      return fail(`no evaluator for ${fixture.formulaId}`);
  }
}

assert(fixtures.kind === "musd-redemption-formula-fixtures", "fixture catalog kind is invalid");
const covered = new Set<string>();
for (const fixture of fixtures.records) {
  assert(formulaIds.has(fixture.formulaId), `${fixture.id} has unknown formula`);
  const actual = evaluate(fixture);
  assert(
    actual === fixture.expected,
    `${fixture.id} expected ${fixture.expected}, computed ${actual}`,
  );
  covered.add(fixture.formulaId);
}
for (const formulaId of formulaIds) {
  assert(covered.has(formulaId), `${formulaId} has no fixture`);
}
for (const boundary of fixtures.eligibilityBoundaries) {
  const eligible =
    integer(boundary.ratio, `${boundary.id}.ratio`) >=
    integer(boundary.threshold, `${boundary.id}.threshold`);
  assert(eligible === boundary.expectedEligible, `${boundary.id} eligibility differs`);
}

function simulateScenario(scenario: Scenario): JsonObject {
  let remaining = integer(scenario.attemptedAmount, `${scenario.id}.attemptedAmount`);
  const attempted = remaining;
  const minimum = integer(scenario.minNetDebt, `${scenario.id}.minNetDebt`);
  const cap = integer(scenario.maxIterations, `${scenario.id}.maxIterations`);
  let visited = 0;
  const outcomes: string[] = [];
  for (const position of scenario.positions) {
    if (remaining === 0n || (cap > 0n && BigInt(visited) >= cap)) break;
    visited += 1;
    if (!position.eligible) {
      outcomes.push(`${position.id}:skipped`);
      continue;
    }
    const debt = integer(position.netDebt, `${scenario.id}.${position.id}.netDebt`);
    if (remaining >= debt) {
      remaining -= debt;
      outcomes.push(`${position.id}:full`);
      continue;
    }
    if (debt - remaining < minimum) {
      outcomes.push(`${position.id}:cancelled-partial`);
      break;
    }
    remaining = 0n;
    outcomes.push(`${position.id}:partial`);
    break;
  }
  return {
    actualAmount: (attempted - remaining).toString(),
    unfilledAmount: remaining.toString(),
    visited,
    outcomes,
  };
}

for (const scenario of fixtures.scenarios) {
  const actual = simulateScenario(scenario);
  assert(
    JSON.stringify(actual) === JSON.stringify(scenario.expected),
    `${scenario.id} transition result differs`,
  );
}

assert(
  parameters.kind === "musd-redemption-parameter-catalog" && parameters.records.length === 1,
  "parameter catalog is invalid",
);
const parameter = parameters.records[0] ?? fail("redemption-rate parameter is missing");
assert(
  parameter.id === "redemption-rate" && parameter.stability === "governed-state",
  "redemption rate metadata is invalid",
);
assert(parameter.documentationDiscrepancy.includes("stale"), "fee waiver is not marked stale");
evidence(parameter.evidence, artifactById, "redemption rate");

assert(
  index.deploymentScope.contractModuleId === "contracts",
  "redemption contract module ID is invalid",
);
const deploymentsDocument = (
  await loadKnowledgeReference(root, {
    moduleId: "contracts",
    resourceId: "contract-deployments",
  })
).document;
const deployments = objects(
  object(deploymentsDocument, "deployment catalog").records,
  "deployments",
) as Deployment[];
const deploymentById = new Map(deployments.map((item) => [item.id, item]));
const endpointsDocument = (
  await loadKnowledgeReference(root, { moduleId: "networks", resourceId: "rpc-endpoints" })
).document;
assert(
  index.deploymentScope.networkModuleId === "networks",
  "redemption network module ID is invalid",
);
const endpoints = objects(
  object(endpointsDocument, "endpoint catalog").records,
  "endpoints",
) as Endpoint[];
const endpointById = new Map(endpoints.map((item) => [item.id, item]));
const observationPath = index.evidence[0] ?? fail("observation path is missing");
const observationsDocument = await json<JsonObject>(resolve(dir, observationPath));
const observations = objects(
  observationsDocument.observations,
  "redemption observations",
) as Observation[];
assert(
  observationsDocument.kind === "musd-redemption-parameter-observations" &&
    observations.length === 2,
  "redemption observations are invalid",
);
for (const observation of observations) {
  const deployment = deploymentById.get(observation.deploymentId);
  assert(deployment !== undefined, `${observation.id} deployment is missing`);
  assert(
    deployment.contractId === parameter.ownerContractId &&
      deployment.networkId === observation.networkId,
    `${observation.id} deployment mismatch`,
  );
  assert(
    endpointById.get(observation.endpointId)?.networkId === observation.networkId,
    `${observation.id} endpoint mismatch`,
  );
  assert(
    deployment.runtime.blockNumber === observation.blockNumber &&
      deployment.runtime.blockHash === observation.blockHash,
    `${observation.id} registry block mismatch`,
  );
  assert(
    observation.function === parameter.getter && observation.callData === "0x540385a3",
    `${observation.id} call metadata is invalid`,
  );
  assert(
    /^0x[a-f0-9]{64}$/.test(observation.rawResult) &&
      BigInt(observation.rawResult).toString() === observation.decoded,
    `${observation.id} decode is invalid`,
  );
  assert(
    parameter.observedValues[observation.networkId] === observation.decoded,
    `${observation.id} differs from parameter catalog`,
  );
}
const observationArtifact = artifactById.get("redemption-parameter-observations");
assert(observationArtifact !== undefined, "redemption observation artifact is missing");
assert(
  (await sha(resolve(root, observationArtifact.path))) === observationArtifact.sha256,
  "redemption observation digest drifted",
);

const abiCatalogDocument = (
  await loadKnowledgeReference(root, { moduleId: "contracts", resourceId: "contract-abis" })
).document;
const abiRecords = objects(object(abiCatalogDocument, "ABI catalog").records, "ABI records");
const troveAbiRecord = abiRecords.find((item) => item.contractId === "musd.trove-manager");
assert(troveAbiRecord !== undefined, "Trove Manager ABI record is missing");
const troveAbiDocument = (
  await loadKnowledgeReference(
    root,
    object(troveAbiRecord.artifactReference, "Trove Manager ABI reference"),
  )
).document;
const eventNames = new Set(
  objects(troveAbiDocument, "Trove Manager ABI")
    .filter((item) => item.type === "event")
    .map((item) => nonempty(item.name, "ABI event name")),
);
for (const record of model.records) {
  for (const event of record.events ?? []) {
    assert(eventNames.has(event), `${record.id} has unknown event ${event}`);
  }
}

const candidates = await readFile(resolve(dir, index.candidateInventory), "utf8");
assert(candidates.includes(discrepancy.candidateId), "fee discrepancy candidate is missing");
const docs = await readFile(resolve(dir, index.derivedReference), "utf8");
const skill = await readFile(resolve(dir, index.skill), "utf8");
assert(
  docs.includes("0.75%") && docs.includes("stale") && docs.includes("attempted"),
  "derived reference omits critical behavior",
);
assert(
  skill.includes("deployment state") && skill.includes("Stop Conditions"),
  "redemption skill omits evidence priority or stop conditions",
);

for (const path of [
  ...Object.values(index.catalogs).map((value) => resolve(dir, value)),
  resolve(dir, index.candidateInventory),
  resolve(dir, index.derivedReference),
  resolve(dir, index.skill),
]) {
  assert(
    !exactAddressPattern.test(await readFile(path, "utf8")),
    `${relative(root, path)} duplicates an EVM address`,
  );
}

process.stdout.write(
  `Validated ${model.records.length} redemption rules, ${formulas.records.length} formulas with ` +
    `${fixtures.records.length} math fixtures and ${fixtures.scenarios.length} transition scenarios, ` +
    `${parameters.records.length} parameter, and ${observations.length} observations.\n`,
);
