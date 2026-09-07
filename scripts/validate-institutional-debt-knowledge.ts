import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleDirectory = join(
  repositoryRoot,
  "knowledge",
  "protocols",
  "musd",
  "institutional-debt",
);
const contractsDirectory = join(repositoryRoot, "knowledge", "contracts");
const BPS = 10_000n;
const YEAR = 31_556_952n;
const MAX_UINT256 = (1n << 256n) - 1n;

type JsonObject = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(message);
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

async function json(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8")) as JsonObject;
}

function object(value: unknown, label: string): JsonObject {
  expect(
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as JsonObject;
}

function array(value: unknown, label: string): JsonObject[] {
  expect(Array.isArray(value), `${label} must be an array`);
  return value as JsonObject[];
}

function string(value: unknown, label: string): string {
  expect(typeof value === "string", `${label} must be a string`);
  return value;
}

function bigint(value: unknown, label: string): bigint {
  return BigInt(string(value, label));
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

const index = await json(join(moduleDirectory, "index.json"));
const architecture = await json(join(moduleDirectory, "records", "architecture.json"));
await json(join(moduleDirectory, "records", "enclave-vaults.json"));
const accounting = await json(join(moduleDirectory, "records", "positions-accounting.json"));
const operations = await json(join(moduleDirectory, "records", "operations-events.json"));
const aggregates = await json(join(moduleDirectory, "records", "aggregate-boundaries.json"));
const fixtures = await json(join(moduleDirectory, "fixtures", "formulas.json"));
const sources = await json(join(moduleDirectory, "sources", "catalog.json"));
const state = await json(join(moduleDirectory, "evidence", "fixed-block-state-2026-08-23.json"));
const reproduction = await json(
  join(moduleDirectory, "evidence", "source-reproduction-2026-08-23.json"),
);
const deployments = await json(join(contractsDirectory, "records", "deployments.json"));
const abis = await json(join(contractsDirectory, "records", "abis.json"));

expect(
  index.moduleId === "protocols/musd/institutional-debt",
  "institutional debt module ID drifted",
);
expect(index.supportStatus === "proposed", "institutional debt module must remain proposed");
expect(index.reviewStatus === "accepted", "institutional debt review must be accepted");
expect(
  object(index.extensions, "index.extensions").writerSupport === "none",
  "writer support must remain none",
);
expect(architecture.supportStatus === "proposed", "architecture was promoted prematurely");
expect(accounting.supportStatus === "proposed", "accounting was promoted prematurely");
expect(operations.supportStatus === "none", "operation knowledge must not enable writers");
expect(architecture.reviewStatus === "accepted", "architecture review must be accepted");
expect(accounting.reviewStatus === "accepted", "accounting review must be accepted");
expect(operations.reviewStatus === "accepted", "operation knowledge review must be accepted");

const indexScope = object(index.scope, "index.scope");
const stateScope = object(state.scope, "state.scope");
expect(indexScope.blockNumber === stateScope.blockNumber, "index/evidence block mismatch");
expect(indexScope.blockHash === stateScope.blockHash, "index/evidence block hash mismatch");
expect(stateScope.blockNumber === 11_334_441, "fixed-block coordinate drifted");
expect(
  /^0x[a-f0-9]{64}$/.test(string(stateScope.blockHash, "state.scope.blockHash")),
  "fixed-block hash is not pinned",
);

for (const source of array(sources.records, "sources.records")) {
  const sourceId = string(source.id, "source ID");
  if (source.reference) {
    const reference = object(source.reference, `${sourceId}.reference`);
    const resolved = await loadKnowledgeReference(repositoryRoot, reference);
    expect(resolved.resource.id === reference.resourceId, `logical source ${sourceId} drifted`);
  }
  if (source.path) {
    const path = join(moduleDirectory, string(source.path, `${sourceId}.path`));
    expect(sha256(await readFile(path)) === source.sha256, `${sourceId} digest drifted`);
  }
}

for (const component of array(architecture.components, "architecture.components")) {
  const componentId = string(component.id, "component ID");
  const reference = object(component.contractReference, `${componentId}.contractReference`);
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  expect(
    object(resolved.value, `${componentId}.resolvedContract`).id === reference.recordId,
    `${componentId} Contract reference drifted`,
  );
}
for (const reference of array(operations.workflowReferences, "operations.workflowReferences")) {
  const resolved = await loadKnowledgeReference(repositoryRoot, reference);
  const resourceId = string(reference.resourceId, "workflow resource ID");
  expect(resolved.resource.id === resourceId, `workflow reference ${resourceId} drifted`);
}

const expectedContracts = ["musd.enclave-v1", "musd.enclave-v2", "musd.enclave-debt-manager"];
const deploymentRecords = array(deployments.records, "deployments.records");
const abiRecords = array(abis.records, "abis.records");
for (const contractId of expectedContracts) {
  const deployment = deploymentRecords.find((record) => record.contractId === contractId);
  const abi = abiRecords.find((record) => record.contractId === contractId);
  expect(deployment, `missing accepted deployment ${contractId}`);
  expect(abi, `missing accepted ABI ${contractId}`);
  expect(
    deployment.supportStatus === "supported" && deployment.reviewStatus === "accepted",
    `${contractId} deployment lifecycle drifted`,
  );
  expect(
    abi.supportStatus === "supported" && abi.reviewStatus === "accepted",
    `${contractId} ABI lifecycle drifted`,
  );
  const artifactPath =
    join(contractsDirectory, "artifacts", "abis", ...contractId.split(".")) + ".json";
  expect(
    sha256(await readFile(artifactPath)) === abi.fileSha256,
    `${contractId} ABI digest drifted`,
  );
}

const proxies = object(state.proxies, "state.proxies");
expect(
  array(
    object(proxies.debtManager, "proxies.debtManager").implementationHistory,
    "debt manager history",
  ).length === 2,
  "debt-manager upgrade history drifted",
);
expect(
  array(
    object(proxies.originalEnclave, "proxies.originalEnclave").implementationHistory,
    "original history",
  ).length === 1,
  "original Enclave history drifted",
);
expect(
  array(
    object(proxies.secondEnclave, "proxies.secondEnclave").implementationHistory,
    "second history",
  ).length === 1,
  "second Enclave history drifted",
);

const enclaves = array(state.enclaves, "state.enclaves");
expect(enclaves.length === 2, "active Enclave count drifted");
const original = enclaves.find(({ generation }) => generation === "original");
const second = enclaves.find(({ generation }) => generation === "second");
expect(original && second, "both Enclave generations must be present");
expect(array(original.targets, "original.targets").length === 36, "original target count drifted");
expect(array(second.targets, "second.targets").length === 24, "second target count drifted");
expect(
  array(original.tripartyUtxos, "original.tripartyUtxos").length === 2,
  "original UTXO count drifted",
);
expect(
  array(second.tripartyUtxos, "second.tripartyUtxos").length === 1,
  "second UTXO count drifted",
);
const debtManagerAddress = string(
  object(state.debtManager, "state.debtManager").address,
  "debt manager address",
);
const debtSelectors = (enclave: JsonObject): string[] =>
  array(enclave.targets, `${string(enclave.generation, "Enclave generation")}.targets`)
    .filter(({ addr }) => addr === debtManagerAddress)
    .map(({ selector }) => string(selector, "target.selector"));
expect(
  debtSelectors(original).length === 10 && debtSelectors(original).includes("0x4b68f8a1"),
  "original debt selector set drifted",
);
expect(
  JSON.stringify(debtSelectors(second)) === JSON.stringify(["0xe487893f"]),
  "second debt selector set drifted",
);
for (const forbidden of [second.assetsBridge, second.veBtc]) {
  expect(
    !array(second.targets, "second.targets").some(({ addr }) => addr === forbidden),
    "second Enclave generic target exclusion drifted",
  );
}
const secondRoles = array(second.roles, "second.roles").map(({ name }) => name);
expect(
  secondRoles.includes("BRIDGE_MANAGER_ROLE"),
  "second Enclave bridge manager role is missing",
);
expect(
  !array(original.roles, "original.roles").some(({ name }) => name === "BRIDGE_MANAGER_ROLE"),
  "original Enclave incorrectly gained bridge manager role",
);

const debtManager = object(state.debtManager, "state.debtManager");
const debtRoles = array(debtManager.roles, "debtManager.roles");
const enclaveRole = debtRoles.find(({ name }) => name === "ENCLAVE_ROLE");
expect(enclaveRole, "ENCLAVE_ROLE evidence is missing");
const enclaveMembers = array(enclaveRole.members, "ENCLAVE_ROLE.members").map(String).sort();
expect(
  JSON.stringify(enclaveMembers) ===
    JSON.stringify(enclaves.map(({ address }) => String(address)).sort()),
  "ENCLAVE_ROLE members do not match Enclave proxies",
);

const positions = array(debtManager.positions, "debtManager.positions");
expect(positions.length === 3, "known position count drifted");
const active = positions.filter(({ status }) => status === "active");
const closed = positions.filter(({ status }) => status === "closedByRepayment");
expect(active.length === 2 && closed.length === 1, "active/closed position classification drifted");
const totals = object(debtManager.totals, "debtManager.totals");
const activePrincipal = active.reduce(
  (sum, position) =>
    sum + bigint(position.principal, `${string(position.positionId, "position ID")}.principal`),
  0n,
);
expect(
  activePrincipal === bigint(totals.totalPrincipal, "totals.totalPrincipal"),
  "active principal does not sum to totalPrincipal",
);
expect(
  bigint(totals.totalMintedDebt, "totalMintedDebt") -
    bigint(totals.totalDebtBurned, "totalDebtBurned") ===
    bigint(totals.totalPrincipal, "totalPrincipal"),
  "institutional principal conservation drifted",
);
expect(
  bigint(totals.totalOriginatorFeeMinted, "totalOriginatorFeeMinted") === 0n,
  "fixed-block originator fee state drifted",
);
for (const position of closed) {
  expect(
    bigint(position.principal, "closed principal") === 0n,
    "closed position retains principal",
  );
  expect(
    array(position.pledgedVeBtc, "closed pledgedVeBtc").length === 0,
    "closed position retains pledged veBTC",
  );
  expect(
    bigint(
      object(object(position.current, "closed.current").debt, "closed.current.debt").totalDebt,
      "closed totalDebt",
    ) === 0n,
    "closed position retains debt",
  );
  expect(
    bigint(object(position.current, "closed.current").collateralRatio, "closed collateralRatio") ===
      MAX_UINT256,
    "zero-debt CR sentinel drifted",
  );
}

const eventCounts = object(object(state.events, "state.events").debtManager, "events.debtManager")
  .counts as JsonObject;
expect(
  eventCounts.PositionOpened === 3 &&
    eventCounts.PositionClosed === 1 &&
    eventCounts.Upgraded === 2,
  "debt-manager event summary drifted",
);
const secondCounts = object(
  object(state.events, "state.events").secondEnclave,
  "events.secondEnclave",
).counts as JsonObject;
expect(secondCounts.TargetRemoved === 8, "second Enclave allowlist transition coverage drifted");

const reproductionRecords = array(reproduction.records, "reproduction.records");
expect(reproductionRecords.length === 4, "implementation reproduction count drifted");
for (const record of reproductionRecords) {
  const recordId = string(record.id, "reproduction record ID");
  const verification = object(record.explorerVerification, `${recordId}.explorerVerification`);
  const result = object(record.reproduction, `${recordId}.reproduction`);
  expect(
    verification.isFullyVerified === true,
    `${recordId} explorer source is not fully verified`,
  );
  expect(
    result.creationExecutableExact === true &&
      result.runtimeExecutableExactAfterImmutableSubstitution === true,
    `${recordId} executable reproduction failed`,
  );
}
expect(
  reproductionRecords.filter(({ contractId }) => contractId !== null).length === 3,
  "current logical ABI identity count drifted",
);

const fixtureRecords = array(fixtures.records, "fixtures.records");
expect(
  new Set(fixtureRecords.map(({ id }) => id)).size === fixtureRecords.length,
  "fixture IDs repeat",
);
for (const fixture of fixtureRecords) {
  const fixtureId = string(fixture.id, "fixture ID");
  const input = object(fixture.input, `${fixtureId}.input`);
  const expected = object(fixture.expected, `${fixtureId}.expected`);
  switch (fixture.operation) {
    case "simple-fee": {
      const fee =
        (bigint(input.elapsedSeconds, "elapsedSeconds") *
          bigint(input.principal, "principal") *
          bigint(input.rateBps, "rateBps")) /
        (BPS * YEAR);
      expect(fee.toString() === expected.fee, `${fixtureId} fee drifted`);
      break;
    }
    case "position-total-debt": {
      const total = [
        "principal",
        "storedInterest",
        "newInterest",
        "storedOriginatorFee",
        "newOriginatorFee",
      ].reduce((sum, key) => sum + bigint(input[key], key), 0n);
      expect(total.toString() === expected.totalDebt, `${fixtureId} total debt drifted`);
      break;
    }
    case "pledged-collateral": {
      const total = (input.lockedAmounts as unknown[]).reduce<bigint>(
        (sum, amount) => sum + BigInt(String(amount)),
        0n,
      );
      expect(total.toString() === expected.collateral, `${fixtureId} collateral drifted`);
      break;
    }
    case "collateral-ratio": {
      const debt = bigint(input.debt, "debt");
      const ratio =
        debt === 0n
          ? MAX_UINT256
          : (bigint(input.collateral, "collateral") * bigint(input.price, "price")) / debt;
      expect(ratio.toString() === expected.ratio, `${fixtureId} collateral ratio drifted`);
      break;
    }
    case "position-health":
      expect(
        bigint(input.currentCr, "currentCr") < bigint(input.warningCr, "warningCr") ===
          expected.belowWarning,
        `${fixtureId} warning classification drifted`,
      );
      expect(
        bigint(input.currentCr, "currentCr") < bigint(input.minimumCr, "minimumCr") ===
          expected.belowMinimum,
        `${fixtureId} minimum classification drifted`,
      );
      break;
    case "repayment-split": {
      const principal = bigint(input.principal, "principal");
      const fees = bigint(input.totalFees, "totalFees");
      const payment = bigint(input.payment, "payment");
      const accepted = payment >= fees && payment - fees <= principal;
      expect(accepted === expected.accepted, `${fixtureId} repayment classification drifted`);
      if (accepted) {
        expect(fees.toString() === expected.feePayment, `${fixtureId} fee payment drifted`);
        expect(
          (payment - fees).toString() === expected.principalPayment,
          `${fixtureId} principal payment drifted`,
        );
        expect(
          (principal - (payment - fees)).toString() === expected.remainingPrincipal,
          `${fixtureId} remaining principal drifted`,
        );
      }
      break;
    }
    case "combined-rate":
      expect(
        bigint(input.interestRateBps, "interestRateBps") +
          bigint(input.originatorFeeRateBps, "originatorFeeRateBps") <=
          bigint(input.maxCombinedRateBps, "maxCombinedRateBps") ===
          expected.accepted,
        `${fixtureId} rate classification drifted`,
      );
      break;
    case "outstanding-debt": {
      const unsettled =
        bigint(input.totalFeesStored, "totalFeesStored") +
        bigint(input.accrued, "accrued") -
        bigint(input.totalFeeSettled, "totalFeeSettled");
      const total =
        bigint(input.totalPrincipal, "totalPrincipal") + (unsettled > 0n ? unsettled : 0n);
      expect(
        total.toString() === expected.outstandingDebt,
        `${fixtureId} outstanding debt drifted`,
      );
      break;
    }
    case "principal-conservation":
      expect(
        (
          bigint(input.totalMintedDebt, "totalMintedDebt") -
          bigint(input.totalDebtBurned, "totalDebtBurned")
        ).toString() === expected.totalPrincipal,
        `${fixtureId} principal conservation drifted`,
      );
      break;
    case "aggregate-separation":
      expect(input.classicDebt === expected.classicDebt, `${fixtureId} classic debt was modified`);
      expect(
        (
          bigint(input.institutionalPrincipal, "institutionalPrincipal") +
          bigint(input.institutionalFees, "institutionalFees")
        ).toString() === expected.institutionalOutstandingDebt,
        `${fixtureId} institutional total drifted`,
      );
      expect(
        expected.combinedProductRatioDefined === false,
        `${fixtureId} invented a product ratio`,
      );
      break;
    default:
      fail(`unsupported fixture operation '${string(fixture.operation, "fixture operation")}'`);
  }
}

const aggregateText = JSON.stringify(aggregates);
for (const phrase of [
  "classic troves",
  "institutional pledged veBTC",
  "combined or product-wide ratio",
  "same MUSD token supply",
]) {
  expect(aggregateText.includes(phrase), `aggregate boundary '${phrase}' is missing`);
}
const operationText = JSON.stringify(operations);
for (const phrase of [
  "exact current target-selector authorization",
  "debt-manager events",
  "fees before principal",
  "successful receipt is transport evidence",
]) {
  expect(operationText.includes(phrase), `operation boundary '${phrase}' is missing`);
}

process.stdout.write(
  `validated ${fixtureRecords.length} institutional debt fixtures, ${positions.length} positions, ${enclaves.length} Enclaves, and ${reproductionRecords.length} reproduced implementation generations\n`,
);
