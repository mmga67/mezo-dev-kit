import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeReference } from "./lib/knowledge-reference.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const moduleId =
  process.argv[process.argv.indexOf("--module") + 1] ?? fail("missing --module argument");
const supported = new Set([
  "protocols/musd/savings",
  "protocols/lending/musdc",
  "protocols/vaults/usdc-lending",
]);
const reviewAccepted = new Set([
  "protocols/musd/savings",
  "protocols/lending/musdc",
  "protocols/vaults/usdc-lending",
]);
if (!supported.has(moduleId)) throw new Error("unsupported --module");
const directory = join(repositoryRoot, "knowledge", ...moduleId.split("/"));

type Json = Record<string, unknown>;
function fail(message: string): never {
  throw new Error(message);
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}
function text(value: unknown, label: string): string {
  expect(typeof value === "string", `${label} must be a string`);
  return value;
}
const json = async (path: string): Promise<Json> =>
  JSON.parse(await readFile(join(directory, path), "utf8")) as Json;
const object = (value: unknown, label: string): Json => {
  expect(
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
    `${label} must be an object`,
  );
  return value as Json;
};
const objects = (value: unknown, label: string): Json[] => {
  expect(Array.isArray(value), `${label} must be an array`);
  return value as Json[];
};
const integer = (value: unknown, label: string): bigint => {
  expect(typeof value === "string" && /^\d+$/.test(value), `${label} must be an integer string`);
  return BigInt(value);
};
const signedInteger = (value: unknown, label: string): bigint => {
  expect(typeof value === "string" && /^-?\d+$/.test(value), `${label} must be an integer string`);
  return BigInt(value);
};
const address = (value: unknown, label: string): string => {
  expect(
    typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value),
    `${label} must be an address`,
  );
  return value.toLowerCase();
};
const divUp = (numerator: bigint, denominator: bigint): bigint =>
  (numerator + denominator - 1n) / denominator;

const index = await json("index.json");
expect(index.moduleId === moduleId, "module identity drifted");
expect(index.supportStatus === "proposed", "economic module must remain proposed");
const expectedReviewStatus = reviewAccepted.has(moduleId) ? "accepted" : "pending-qualified-review";
expect(index.reviewStatus === expectedReviewStatus, "qualified review status drifted");
expect(
  object(index.extensions, "index.extensions").writerSupport === "none",
  "writer support must remain none",
);
const scope = object(index.scope, "index.scope");
expect(scope.blockNumber === 11_341_710, "fixed evidence block drifted");
expect(
  scope.blockHash === "0xcca3b133bbb5282b84fd383d3b73440169a50155cea3288d91067a2ff76c61d0",
  "fixed evidence hash drifted",
);

async function validateSources(path: string): Promise<void> {
  const sources = await json(path);
  for (const source of objects(sources.records, "sources.records")) {
    const sourceId = text(source.id, "source.id");
    if (source.reference) {
      const reference = object(source.reference, `${sourceId}.reference`);
      const resolved = await loadKnowledgeReference(repositoryRoot, reference);
      expect(resolved.resource.id === reference.resourceId, `${sourceId} reference drifted`);
    }
    if (source.path) await readFile(join(directory, text(source.path, `${sourceId}.path`)));
  }
}

function validateReproduction(records: Json[]): void {
  for (const record of records) {
    const recordId = text(record.id, "reproduction.id");
    expect(record.runtimeExecutableExact === true, `${recordId} runtime reproduction failed`);
    expect(
      record.creationExecutableExact === true || record.creationExecutableExact === null,
      `${recordId} creation status is invalid`,
    );
  }
}

if (moduleId === "protocols/musd/savings") {
  const model = await json("records/model.json");
  const roles = await json("records/roles.json");
  const operations = await json("records/operations.json");
  const evidence = await json("evidence/fixed-block-state-2026-08-23.json");
  const withdrawalEvidence = await json("evidence/withdrawal-reconciliation-2026-08-24.json");
  const fixtures = await json("fixtures/accounting.json");
  const reproduction = await json("evidence/source-reproduction-2026-08-23.json");
  expect(operations.supportStatus === "none", "Savings operations enabled writers");
  expect(
    String(object(model.principal, "model.principal").exchangeRate).includes("one MUSD"),
    "Savings principal is no longer one-to-one",
  );
  const savings = object(evidence.savings, "evidence.savings");
  expect(
    savings.musdToken === savings.yieldToken,
    "Savings principal/yield token evidence differs",
  );
  expect(
    object(evidence.pcv, "evidence.pcv").feeRecipient === savings.proxy,
    "PCV fee recipient no longer resolves to Savings",
  );
  expect(
    object(evidence.gauge, "evidence.gauge").poolsVoterGaugeForSavings === savings.vaultGauge,
    "PoolsVoter gauge resolution differs",
  );
  for (const stable of objects(roles.stableReferences, "roles.stableReferences")) {
    const stableId = text(stable.id, "stable reference ID");
    await loadKnowledgeReference(repositoryRoot, object(stable.reference, `${stableId}.reference`));
  }
  await loadKnowledgeReference(
    repositoryRoot,
    object(withdrawalEvidence.modelReference, "withdrawalEvidence.modelReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(
      withdrawalEvidence.savingsDeploymentReference,
      "withdrawalEvidence.savingsDeploymentReference",
    ),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(withdrawalEvidence.savingsAbiReference, "withdrawalEvidence.savingsAbiReference"),
  );
  const withdrawalCapture = object(withdrawalEvidence.capture, "withdrawalEvidence.capture");
  for (const reference of objects(
    withdrawalCapture.endpointReferences,
    "withdrawalEvidence.capture.endpointReferences",
  )) {
    await loadKnowledgeReference(repositoryRoot, reference);
  }
  const withdrawalSubject = object(withdrawalEvidence.subject, "withdrawalEvidence.subject");
  expect(
    address(withdrawalSubject.savings, "withdrawalEvidence.subject.savings") ===
      address(savings.proxy, "evidence.savings.proxy"),
    "withdrawal trace Savings address drifted",
  );
  expect(
    address(withdrawalSubject.musd, "withdrawalEvidence.subject.musd") ===
      address(savings.musdToken, "evidence.savings.musdToken"),
    "withdrawal trace MUSD address drifted",
  );
  const withdrawalStates = objects(withdrawalEvidence.states, "withdrawalEvidence.states");
  const withdrawalState = (id: string): Json =>
    object(
      withdrawalStates.find((entry) => entry.id === id),
      `withdrawalEvidence.states.${id}`,
    );
  const beforeWithdrawal = withdrawalState("before-withdrawal");
  const afterWithdrawal = withdrawalState("after-withdrawal");
  expect(
    beforeWithdrawal.blockNumber === 11_325_681 && afterWithdrawal.blockNumber === 11_325_682,
    "withdrawal trace block sequence drifted",
  );
  const beforeGlobal = object(beforeWithdrawal.global, "beforeWithdrawal.global");
  const afterGlobal = object(afterWithdrawal.global, "afterWithdrawal.global");
  const beforeAccount = object(beforeWithdrawal.account, "beforeWithdrawal.account");
  const afterAccount = object(afterWithdrawal.account, "afterWithdrawal.account");
  const withdrawalOperation = object(withdrawalEvidence.operation, "withdrawalEvidence.operation");
  const withdrawalEvents = object(withdrawalOperation.events, "withdrawalOperation.events");
  const protocolYieldEvent = object(
    withdrawalEvents.protocolYieldReceived,
    "withdrawalEvents.protocolYieldReceived",
  );
  const yieldClaimEvent = object(withdrawalEvents.yieldClaimed, "withdrawalEvents.yieldClaimed");
  const yieldTransfer = object(withdrawalEvents.yieldTransfer, "withdrawalEvents.yieldTransfer");
  const principalBurn = object(withdrawalEvents.principalBurn, "withdrawalEvents.principalBurn");
  const principalTransfer = object(
    withdrawalEvents.principalTransfer,
    "withdrawalEvents.principalTransfer",
  );
  const withdrawEvent = object(withdrawalEvents.withdraw, "withdrawalEvents.withdraw");
  const principal = integer(withdrawEvent.amount, "withdrawEvent.amount");
  const protocolYield = integer(protocolYieldEvent.amount, "protocolYieldEvent.amount");
  const indexDelta =
    integer(afterGlobal.yieldIndex, "afterGlobal.yieldIndex") -
    integer(beforeGlobal.yieldIndex, "beforeGlobal.yieldIndex");
  expect(
    indexDelta ===
      (protocolYield * 10n ** 18n) / integer(beforeGlobal.totalSupply, "beforeGlobal.totalSupply"),
    "protocol yield does not reconcile to the floored global index delta",
  );
  const claimedYield = integer(yieldClaimEvent.amount, "yieldClaimEvent.amount");
  expect(
    claimedYield ===
      (integer(beforeAccount.principalReceipts, "beforeAccount.principalReceipts") * indexDelta) /
        10n ** 18n,
    "user yield does not reconcile to the floored receipt/index calculation",
  );
  expect(
    integer(beforeGlobal.totalSupply, "beforeGlobal.totalSupply") -
      integer(afterGlobal.totalSupply, "afterGlobal.totalSupply") ===
      principal,
    "principal burn does not reconcile to total supply",
  );
  expect(
    integer(beforeAccount.principalReceipts, "beforeAccount.principalReceipts") -
      integer(afterAccount.principalReceipts, "afterAccount.principalReceipts") ===
      principal,
    "principal burn does not reconcile to account receipts",
  );
  expect(
    integer(afterAccount.musdWalletBalance, "afterAccount.musdWalletBalance") -
      integer(beforeAccount.musdWalletBalance, "beforeAccount.musdWalletBalance") ===
      principal + claimedYield,
    "wallet MUSD delta does not equal separate principal and yield transfers",
  );
  expect(
    integer(principalBurn.amount, "principalBurn.amount") === principal &&
      integer(principalTransfer.amount, "principalTransfer.amount") === principal,
    "principal receipt burn and MUSD transfer differ",
  );
  expect(
    integer(yieldTransfer.amount, "yieldTransfer.amount") === claimedYield,
    "yield event and MUSD transfer differ",
  );
  expect(
    integer(afterAccount.claimableYield, "afterAccount.claimableYield") === 0n &&
      integer(afterAccount.supplyYieldIndex, "afterAccount.supplyYieldIndex") ===
        integer(afterGlobal.yieldIndex, "afterGlobal.yieldIndex"),
    "post-withdrawal user yield state did not settle",
  );
  expect(
    integer(beforeGlobal.pendingYield, "beforeGlobal.pendingYield") === 0n &&
      integer(afterGlobal.pendingYield, "afterGlobal.pendingYield") === 0n,
    "withdrawal trace unexpectedly buffered yield",
  );
  expect(
    withdrawalOperation.receiptStatus === "0x1" &&
      withdrawalOperation.blockHash === afterWithdrawal.blockHash,
    "withdrawal receipt coordinate drifted",
  );
  for (const fixture of objects(fixtures.records, "fixtures.records")) {
    const fixtureId = text(fixture.id, "fixture.id");
    const input = object(fixture.input, `${fixtureId}.input`);
    const expected = object(fixture.expected, `${fixtureId}.expected`);
    if (fixture.operation === "principal") {
      const amount = integer(input.amount, "amount");
      expect(
        expected.minted === undefined || integer(expected.minted, "minted") === amount,
        `${fixtureId} mint drifted`,
      );
      expect(
        expected.burned === undefined || integer(expected.burned, "burned") === amount,
        `${fixtureId} burn drifted`,
      );
    } else if (fixture.operation === "receive-yield") {
      const amount = integer(input.amount, "amount");
      const pending = integer(input.pending, "pending");
      const supply = integer(input.supply, "supply");
      const indexValue = integer(input.index, "index");
      if (supply === 0n) {
        expect(
          integer(expected.pending, "expected.pending") === amount + pending,
          `${fixtureId} buffer drifted`,
        );
        expect(
          integer(expected.index, "expected.index") === indexValue,
          `${fixtureId} index drifted`,
        );
      } else {
        const ratio = ((amount + pending) * 10n ** 18n) / supply;
        if (ratio === 0n)
          expect(expected.revert === "AmountTooSmall", `${fixtureId} zero ratio drifted`);
        else {
          expect(integer(expected.ratio, "expected.ratio") === ratio, `${fixtureId} ratio drifted`);
          expect(
            integer(expected.index, "expected.index") === indexValue + ratio,
            `${fixtureId} index drifted`,
          );
        }
      }
    } else if (fixture.operation === "user-update") {
      const share =
        (integer(input.balance, "balance") *
          (integer(input.index, "index") - integer(input.userIndex, "userIndex"))) /
        10n ** 18n;
      expect(integer(expected.share, "expected.share") === share, `${fixtureId} share drifted`);
      expect(
        integer(expected.claimable, "expected.claimable") ===
          integer(input.claimable, "claimable") + share,
        `${fixtureId} claimable drifted`,
      );
    } else if (fixture.operation === "gauge-cap") {
      const requested = integer(input.requested, "requested");
      const cap = integer(input.cap, "cap");
      const allowed = requested < cap ? requested : cap;
      expect(integer(expected.allowed, "allowed") === allowed, `${fixtureId} cap drifted`);
    } else if (fixture.operation === "ownership") {
      expect(
        integer(expected.beneficialPrincipal, "beneficialPrincipal") ===
          integer(input.walletReceipts, "wallet") + integer(input.gaugeBeneficialReceipts, "gauge"),
        `${fixtureId} ownership drifted`,
      );
    }
  }
  validateReproduction(objects(reproduction.records, "reproduction.records"));
  await validateSources("sources/catalog.json");
}

async function validateVaultFlow(): Promise<void> {
  const flow = await json("evidence/flow-reconciliation-2026-08-24.json");
  await loadKnowledgeReference(
    repositoryRoot,
    object(flow.architectureReference, "flow.architectureReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(flow.marketReference, "flow.marketReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(flow.adapterDeploymentReference, "flow.adapterDeploymentReference"),
  );
  for (const endpoint of objects(
    object(flow.capture, "flow.capture").endpointReferences,
    "flow.capture.endpointReferences",
  )) {
    await loadKnowledgeReference(repositoryRoot, endpoint);
  }
  const roleReconciliation = object(flow.roleReconciliation, "flow.roleReconciliation");
  const roleEvents = objects(roleReconciliation.events, "flow.roleReconciliation.events");
  expect(roleEvents.length === 3, "allocator event history drifted");
  const roleReads = object(
    roleReconciliation.fixedBlockReads,
    "flow.roleReconciliation.fixedBlockReads",
  );
  expect(roleReads.blockNumber === 11_341_710, "role read coordinate drifted");
  expect(roleReads.sentinelEventCount === 0, "sentinel event count drifted");
  const currentAllocator = object(roleReads.currentAllocator, "flow.currentAllocator");
  const retiredAllocator = object(roleReads.retiredAllocator, "flow.retiredAllocator");
  expect(
    currentAllocator.isAllocator === true && currentAllocator.isSentinel === false,
    "current allocator state drifted",
  );
  expect(
    retiredAllocator.isAllocator === false && retiredAllocator.isSentinel === false,
    "retired allocator state drifted",
  );
  const flowStates = new Map(
    objects(flow.states, "flow.states").map((state) => [String(state.id), state]),
  );
  const beforeDeposit = object(flowStates.get("before-deposit"), "flow.before-deposit");
  const afterDeposit = object(flowStates.get("after-deposit"), "flow.after-deposit");
  const beforeWithdrawal = object(flowStates.get("before-withdrawal"), "flow.before-withdrawal");
  const afterWithdrawal = object(flowStates.get("after-withdrawal"), "flow.after-withdrawal");
  const flowOperations = objects(flow.operations, "flow.operations");
  expect(flowOperations.length === 2, "representative vault flow count drifted");
  const deposit = object(
    flowOperations.find(({ id }) => id === "deposit-and-allocate"),
    "flow.deposit",
  );
  const depositAssets = integer(deposit.assets, "flow.deposit.assets");
  const depositShares = integer(deposit.shares, "flow.deposit.shares");
  const depositEvents = object(deposit.events, "flow.deposit.events");
  const depositAllocate = object(depositEvents.allocate, "flow.deposit.allocate");
  const depositAdapterAllocate = object(
    depositEvents.adapterAllocate,
    "flow.deposit.adapterAllocate",
  );
  const depositAccrual = object(deposit.interestAccrual, "flow.deposit.interestAccrual");
  const depositChange = signedInteger(depositAllocate.change, "flow.deposit.change");
  expect(
    integer(afterDeposit.vaultShares, "after deposit shares") -
      integer(beforeDeposit.vaultShares, "before deposit shares") ===
      depositShares,
    "deposit account share transition drifted",
  );
  expect(
    integer(beforeDeposit.musdcWalletBalance, "before deposit mUSDC") -
      integer(afterDeposit.musdcWalletBalance, "after deposit mUSDC") ===
      depositAssets,
    "deposit mUSDC transition drifted",
  );
  expect(
    integer(afterDeposit.vaultTotalSupply, "after deposit supply") -
      integer(beforeDeposit.vaultTotalSupply, "before deposit supply") ===
      depositShares,
    "deposit total-supply transition drifted",
  );
  expect(
    integer(afterDeposit.vaultStoredTotalAssets, "after deposit stored assets") -
      integer(beforeDeposit.vaultStoredTotalAssets, "before deposit stored assets") ===
      depositChange,
    "deposit stored-assets transition drifted",
  );
  expect(
    integer(depositAccrual.newTotalAssets, "deposit accrued assets") + depositAssets ===
      integer(afterDeposit.vaultStoredTotalAssets, "after deposit stored assets"),
    "deposit interest-plus-assets reconciliation drifted",
  );
  expect(
    integer(afterDeposit.adapterAllocation, "after deposit allocation") -
      integer(beforeDeposit.adapterAllocation, "before deposit allocation") ===
      depositChange &&
      integer(depositAdapterAllocate.newAllocation, "deposit event allocation") ===
        integer(afterDeposit.adapterAllocation, "after deposit allocation"),
    "deposit allocation reconciliation drifted",
  );
  const withdrawal = object(
    flowOperations.find(({ id }) => id === "withdraw-and-deallocate"),
    "flow.withdrawal",
  );
  const withdrawalCall = object(withdrawal.decodedCall, "flow.withdrawal.decodedCall");
  const withdrawalAssets = integer(withdrawalCall.assets, "flow.withdrawal.assets");
  const withdrawalShares = integer(withdrawal.shares, "flow.withdrawal.shares");
  const withdrawalEvents = object(withdrawal.events, "flow.withdrawal.events");
  const deallocate = object(withdrawalEvents.deallocate, "flow.withdrawal.deallocate");
  const adapterDeallocate = object(
    withdrawalEvents.adapterDeallocate,
    "flow.withdrawal.adapterDeallocate",
  );
  const withdrawalAccrual = object(withdrawal.interestAccrual, "flow.withdrawal.interestAccrual");
  const deallocationChange = signedInteger(deallocate.change, "flow.withdrawal.change");
  expect(
    integer(beforeWithdrawal.vaultShares, "before withdrawal shares") -
      integer(afterWithdrawal.vaultShares, "after withdrawal shares") ===
      withdrawalShares,
    "withdrawal account share transition drifted",
  );
  expect(
    integer(afterWithdrawal.musdcWalletBalance, "after withdrawal mUSDC") -
      integer(beforeWithdrawal.musdcWalletBalance, "before withdrawal mUSDC") ===
      withdrawalAssets,
    "withdrawal mUSDC transition drifted",
  );
  expect(
    integer(beforeWithdrawal.vaultTotalSupply, "before withdrawal supply") -
      integer(afterWithdrawal.vaultTotalSupply, "after withdrawal supply") ===
      withdrawalShares,
    "withdrawal total-supply transition drifted",
  );
  expect(
    integer(afterWithdrawal.vaultStoredTotalAssets, "after withdrawal stored assets") -
      integer(beforeWithdrawal.vaultStoredTotalAssets, "before withdrawal stored assets") ===
      deallocationChange,
    "withdrawal stored-assets transition drifted",
  );
  expect(
    integer(withdrawalAccrual.newTotalAssets, "withdrawal accrued assets") - withdrawalAssets ===
      integer(afterWithdrawal.vaultStoredTotalAssets, "after withdrawal stored assets"),
    "withdrawal interest-minus-assets reconciliation drifted",
  );
  expect(
    integer(afterWithdrawal.adapterAllocation, "after withdrawal allocation") -
      integer(beforeWithdrawal.adapterAllocation, "before withdrawal allocation") ===
      deallocationChange &&
      integer(adapterDeallocate.newAllocation, "withdrawal event allocation") ===
        integer(afterWithdrawal.adapterAllocation, "after withdrawal allocation"),
    "withdrawal allocation reconciliation drifted",
  );
}

if (moduleId === "protocols/lending/musdc") {
  const market = await json("records/market.json");
  const operations = await json("records/operations.json");
  const evidence = await json("evidence/fixed-block-state-2026-08-23.json");
  const borrowerEvidence = await json("evidence/borrower-reconciliation-2026-08-24.json");
  const fixtures = await json("fixtures/formulas.json");
  const reproduction = await json("evidence/source-reproduction-2026-08-23.json");
  expect(operations.supportStatus === "none", "lending operations enabled writers");
  await loadKnowledgeReference(
    repositoryRoot,
    object(market.loanAssetReference, "market.loanAssetReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(market.priceReference, "market.priceReference"),
  );
  for (const contract of objects(market.contractReferences, "market.contractReferences")) {
    const contractId = text(contract.id, "contract reference ID");
    await loadKnowledgeReference(
      repositoryRoot,
      object(contract.deployment, `${contractId}.deployment`),
    );
    await loadKnowledgeReference(repositoryRoot, object(contract.abi, `${contractId}.abi`));
  }
  const state = object(evidence.market, "evidence.market");
  expect(
    integer(state.totalSupplyAssets, "supply assets") -
      integer(state.totalBorrowAssets, "borrow assets") ===
      integer(state.tokenLiquidity, "liquidity"),
    "fixed market liquidity does not reconcile",
  );
  const borrowerScope = object(borrowerEvidence.scope, "borrowerEvidence.scope");
  expect(borrowerScope.marketId === state.id, "borrower trace market identity drifted");
  await loadKnowledgeReference(
    repositoryRoot,
    object(borrowerEvidence.marketReference, "borrowerEvidence.marketReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(
      borrowerEvidence.morphoDeploymentReference,
      "borrowerEvidence.morphoDeploymentReference",
    ),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(
      borrowerEvidence.eventDefinitionSourceReference,
      "borrowerEvidence.eventDefinitionSourceReference",
    ),
  );
  const capture = object(borrowerEvidence.capture, "borrowerEvidence.capture");
  for (const reference of objects(
    capture.endpointReferences,
    "borrowerEvidence.capture.endpointReferences",
  )) {
    await loadKnowledgeReference(repositoryRoot, reference);
  }
  const subject = object(borrowerEvidence.subject, "borrowerEvidence.subject");
  expect(
    address(subject.morpho, "borrowerEvidence.subject.morpho") ===
      address(object(evidence.contracts, "evidence.contracts").morpho, "evidence.contracts.morpho"),
    "borrower trace Morpho address drifted",
  );
  const marketParams = object(subject.marketParams, "borrowerEvidence.subject.marketParams");
  for (const field of ["loanToken", "collateralToken", "oracle", "irm"] as const) {
    expect(
      address(marketParams[field], `borrowerEvidence.marketParams.${field}`) ===
        address(state[field], `evidence.market.${field}`),
      `borrower trace ${field} drifted`,
    );
  }
  expect(
    integer(marketParams.lltv, "borrowerEvidence.marketParams.lltv") ===
      integer(state.lltv, "evidence.market.lltv"),
    "borrower trace LLTV drifted",
  );
  const traceStates = objects(borrowerEvidence.states, "borrowerEvidence.states");
  const traceOperations = objects(borrowerEvidence.operations, "borrowerEvidence.operations");
  const traceState = (id: string): Json =>
    object(
      traceStates.find((entry) => entry.id === id),
      `borrowerEvidence.states.${id}`,
    );
  const traceOperation = (id: string): Json =>
    object(
      traceOperations.find((entry) => entry.id === id),
      `borrowerEvidence.operations.${id}`,
    );
  const beforeCollateral = traceState("before-collateral");
  const afterCollateral = traceState("after-collateral");
  const afterBorrow = traceState("after-borrow");
  expect(
    beforeCollateral.blockNumber === 9_282_199 &&
      afterCollateral.blockNumber === 9_282_200 &&
      afterBorrow.blockNumber === 9_282_201,
    "borrower trace block sequence drifted",
  );
  const beforePosition = object(beforeCollateral.position, "beforeCollateral.position");
  const collateralPosition = object(afterCollateral.position, "afterCollateral.position");
  const borrowPosition = object(afterBorrow.position, "afterBorrow.position");
  expect(
    [beforePosition, collateralPosition, borrowPosition].every(
      (position) => integer(position.supplyShares, "position.supplyShares") === 0n,
    ),
    "borrower trace unexpectedly changed supply shares",
  );
  const supplyOperation = traceOperation("supply-collateral");
  const supplyEvent = object(supplyOperation.event, "supplyOperation.event");
  const supplyTransfer = object(supplyOperation.tokenTransfer, "supplyOperation.tokenTransfer");
  const suppliedAssets = integer(supplyEvent.assets, "supplyEvent.assets");
  expect(
    integer(beforePosition.borrowShares, "beforePosition.borrowShares") === 0n &&
      integer(collateralPosition.borrowShares, "collateralPosition.borrowShares") === 0n,
    "collateral supply changed debt",
  );
  expect(
    integer(collateralPosition.collateral, "collateralPosition.collateral") -
      integer(beforePosition.collateral, "beforePosition.collateral") ===
      suppliedAssets,
    "collateral event does not reconcile to position delta",
  );
  expect(
    integer(supplyTransfer.amount, "supplyTransfer.amount") === suppliedAssets,
    "collateral token transfer does not reconcile",
  );
  expect(
    supplyOperation.receiptStatus === "0x1" &&
      supplyOperation.blockHash === afterCollateral.blockHash,
    "collateral receipt coordinate drifted",
  );
  const borrowOperation = traceOperation("borrow");
  const borrowEvent = object(borrowOperation.event, "borrowOperation.event");
  const borrowTransfer = object(borrowOperation.tokenTransfer, "borrowOperation.tokenTransfer");
  const borrowedAssets = integer(borrowEvent.assets, "borrowEvent.assets");
  const borrowedShares = integer(borrowEvent.shares, "borrowEvent.shares");
  expect(
    integer(borrowPosition.collateral, "borrowPosition.collateral") ===
      integer(collateralPosition.collateral, "collateralPosition.collateral"),
    "borrow changed collateral",
  );
  expect(
    integer(borrowPosition.borrowShares, "borrowPosition.borrowShares") -
      integer(collateralPosition.borrowShares, "collateralPosition.borrowShares") ===
      borrowedShares,
    "borrow event does not reconcile to position-share delta",
  );
  expect(
    integer(borrowTransfer.amount, "borrowTransfer.amount") === borrowedAssets,
    "borrow token transfer does not reconcile",
  );
  expect(
    address(borrowTransfer.to, "borrowTransfer.to") ===
      address(subject.borrower, "borrowerEvidence.subject.borrower"),
    "borrow transfer receiver drifted",
  );
  expect(
    borrowOperation.receiptStatus === "0x1" && borrowOperation.blockHash === afterBorrow.blockHash,
    "borrow receipt coordinate drifted",
  );
  for (const fixture of objects(fixtures.records, "fixtures.records")) {
    const fixtureId = text(fixture.id, "fixture.id");
    const input = object(fixture.input, `${fixtureId}.input`);
    const totalAssets =
      input.totalAssets === undefined ? 0n : integer(input.totalAssets, "totalAssets");
    const totalShares =
      input.totalShares === undefined ? 0n : integer(input.totalShares, "totalShares");
    let actual: bigint | boolean;
    switch (fixture.operation) {
      case "to-shares-down":
        actual =
          (integer(input.assets, "assets") * (totalShares + 1_000_000n)) / (totalAssets + 1n);
        break;
      case "to-shares-up":
        actual = divUp(
          integer(input.assets, "assets") * (totalShares + 1_000_000n),
          totalAssets + 1n,
        );
        break;
      case "to-assets-down":
        actual =
          (integer(input.shares, "shares") * (totalAssets + 1n)) / (totalShares + 1_000_000n);
        break;
      case "to-assets-up":
        actual = divUp(
          integer(input.shares, "shares") * (totalAssets + 1n),
          totalShares + 1_000_000n,
        );
        break;
      case "interest": {
        const first = integer(input.borrowRate, "rate") * integer(input.elapsed, "elapsed");
        const second = (first * first) / (2n * 10n ** 18n);
        const third = (second * first) / (3n * 10n ** 18n);
        const expected = object(fixture.expected, "interest.expected");
        expect(
          integer(expected.compound, "compound") === first + second + third,
          `${fixtureId} compound drifted`,
        );
        expect(
          integer(expected.interest, "interest") ===
            (integer(input.totalBorrowAssets, "borrow") * (first + second + third)) / 10n ** 18n,
          `${fixtureId} interest drifted`,
        );
        continue;
      }
      case "health": {
        const maxBorrow =
          (((integer(input.collateral, "collateral") * integer(input.price, "price")) /
            10n ** 36n) *
            integer(input.lltv, "lltv")) /
          10n ** 18n;
        actual = maxBorrow >= integer(input.borrowed, "borrowed");
        break;
      }
      case "zero-debt-health":
        actual = integer(input.borrowShares, "borrowShares") === 0n;
        break;
      case "liquidity":
        actual =
          integer(input.totalSupplyAssets, "supply") - integer(input.totalBorrowAssets, "borrow");
        break;
      default:
        fail(`unknown lending fixture ${text(fixture.operation, `${fixtureId}.operation`)}`);
    }
    if (typeof actual === "boolean")
      expect(actual === fixture.expected, `${fixtureId} boolean drifted`);
    else expect(actual.toString() === fixture.expected, `${fixtureId} integer drifted`);
  }
  validateReproduction(objects(reproduction.records, "reproduction.records"));
  await validateSources("sources/catalog.json");
} else if (moduleId === "protocols/vaults/usdc-lending") {
  const architecture = await json("records/architecture.json");
  const operations = await json("records/operations.json");
  const evidence = await json("evidence/fixed-block-state-2026-08-23.json");
  const fixtures = await json("fixtures/accounting.json");
  const reproduction = await json("evidence/source-reproduction-2026-08-23.json");
  expect(operations.supportStatus === "none", "vault operations enabled writers");
  await loadKnowledgeReference(
    repositoryRoot,
    object(architecture.assetReference, "architecture.assetReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(architecture.marketReference, "architecture.marketReference"),
  );
  await loadKnowledgeReference(
    repositoryRoot,
    object(architecture.incentivesReference, "architecture.incentivesReference"),
  );
  for (const contract of objects(
    architecture.contractReferences,
    "architecture.contractReferences",
  )) {
    const contractId = text(contract.id, "contract reference ID");
    await loadKnowledgeReference(
      repositoryRoot,
      object(contract.deployment, `${contractId}.deployment`),
    );
    await loadKnowledgeReference(repositoryRoot, object(contract.abi, `${contractId}.abi`));
  }
  const wrapper = object(evidence.wrapper, "evidence.wrapper");
  const gauge = object(evidence.gauge, "evidence.gauge");
  const vault = object(evidence.vault, "evidence.vault");
  const marketAdapter = object(evidence.marketAdapter, "evidence.marketAdapter");
  const configuration = object(evidence.configuration, "evidence.configuration");
  const configurationCapture = object(configuration.capture, "configuration.capture");
  await loadKnowledgeReference(
    repositoryRoot,
    object(configurationCapture.endpointReference, "configuration.capture.endpointReference"),
  );
  expect(
    configurationCapture.method === "eth_call" && configurationCapture.blockTag === "0xad0f8e",
    "configuration capture coordinate drifted",
  );
  expect(
    wrapper.totalSupply === gauge.totalSupply,
    "all fixed-block receipts were not staked as observed",
  );
  expect(
    integer(wrapper.vaultShareBalance, "wrapper vault shares") >
      integer(wrapper.accumulatedYield, "accumulated yield"),
    "yield exceeds wrapper vault shares",
  );
  const adapterQueue = objects(configuration.adapterQueue, "configuration.adapterQueue");
  expect(adapterQueue.length === vault.adaptersLength, "adapter queue length drifted");
  const liquidityAdapter = object(configuration.liquidityAdapter, "configuration.liquidityAdapter");
  expect(
    adapterQueue.length === 1 &&
      adapterQueue[0] === vault.liquidityAdapter &&
      liquidityAdapter.address === vault.liquidityAdapter,
    "liquidity adapter queue drifted",
  );
  expect(
    typeof liquidityAdapter.data === "string" && /^0x[0-9a-f]{320}$/.test(liquidityAdapter.data),
    "liquidity adapter data is not one encoded market tuple",
  );
  const zeroAddress = "0x0000000000000000000000000000000000000000";
  expect(configuration.adapterRegistry === zeroAddress, "fixed-block adapter registry drifted");
  expect(
    Object.values(object(configuration.gates, "configuration.gates")).every(
      (gate) => gate === zeroAddress,
    ),
    "fixed-block gate inventory drifted",
  );
  const caps = objects(configuration.allocationCaps, "configuration.allocationCaps");
  expect(
    caps.length === 3 && new Set(caps.map((cap) => cap.id)).size === 3,
    "allocation cap-ID inventory drifted",
  );
  expect(
    caps.some((cap) => cap.id === marketAdapter.adapterId),
    "adapter cap ID is missing",
  );
  for (const cap of caps) {
    const dimension = text(cap.dimension, "allocation cap dimension");
    expect(
      integer(cap.allocation, `${dimension}.allocation`) ===
        integer(vault.storedTotalAssets, "storedTotalAssets"),
      `${dimension} allocation drifted`,
    );
    expect(
      integer(cap.absoluteCap, `${dimension}.absoluteCap`) >=
        integer(cap.allocation, `${dimension}.allocation`),
      `${dimension} absolute cap is below allocation`,
    );
    expect(
      integer(cap.relativeCap, `${dimension}.relativeCap`) <= 10n ** 18n,
      `${dimension} relative cap exceeds WAD`,
    );
  }
  const timelockedFunctions = objects(
    configuration.timelockedFunctions,
    "configuration.timelockedFunctions",
  );
  const expectedTimelockedSignatures = new Set([
    "setIsAllocator(address,bool)",
    "setReceiveSharesGate(address)",
    "setSendSharesGate(address)",
    "setReceiveAssetsGate(address)",
    "setSendAssetsGate(address)",
    "setAdapterRegistry(address)",
    "addAdapter(address)",
    "removeAdapter(address)",
    "increaseTimelock(bytes4,uint256)",
    "decreaseTimelock(bytes4,uint256)",
    "abdicate(bytes4)",
    "setPerformanceFee(uint256)",
    "setManagementFee(uint256)",
    "setPerformanceFeeRecipient(address)",
    "setManagementFeeRecipient(address)",
    "increaseAbsoluteCap(bytes,uint256)",
    "increaseRelativeCap(bytes,uint256)",
    "setForceDeallocatePenalty(address,uint256)",
  ]);
  expect(
    timelockedFunctions.length === expectedTimelockedSignatures.size,
    "timelocked curator function inventory drifted",
  );
  expect(
    new Set(timelockedFunctions.map((entry) => entry.selector)).size === timelockedFunctions.length,
    "timelock selectors are duplicated",
  );
  for (const entry of timelockedFunctions) {
    const signature = text(entry.signature, "timelocked function signature");
    expect(
      expectedTimelockedSignatures.delete(signature),
      `unexpected timelocked function ${signature}`,
    );
    expect(
      typeof entry.selector === "string" && /^0x[0-9a-f]{8}$/.test(entry.selector),
      `${signature} selector is invalid`,
    );
    integer(entry.duration, `${signature}.duration`);
    expect(typeof entry.abdicated === "boolean", `${signature}.abdicated is invalid`);
  }
  expect(expectedTimelockedSignatures.size === 0, "timelocked curator function is missing");
  const decreaseTimelock = timelockedFunctions.find(
    (entry) => entry.signature === "decreaseTimelock(bytes4,uint256)",
  );
  expect(
    decreaseTimelock?.effectiveDelayRule === "target-selector-duration",
    "decreaseTimelock effective-delay rule drifted",
  );
  for (const fixture of objects(fixtures.records, "fixtures.records")) {
    const fixtureId = text(fixture.id, "fixture.id");
    const input = object(fixture.input, `${fixtureId}.input`);
    const expected = fixture.expected;
    if (
      fixture.operation === "vault-preview-deposit" ||
      fixture.operation === "vault-preview-withdraw"
    ) {
      const numerator =
        integer(input.assets, "assets") *
        (integer(input.totalSupply, "supply") + integer(input.virtualShares, "virtual"));
      const denominator = integer(input.totalAssets, "assets total") + 1n;
      const value =
        fixture.operation === "vault-preview-deposit"
          ? numerator / denominator
          : divUp(numerator, denominator);
      expect(value.toString() === fixture.expected, `${fixtureId} preview drifted`);
    } else if (fixture.operation === "wrapper-deposit") {
      const value =
        (integer(input.vaultShares, "shares") *
          (integer(input.receiptSupply, "supply") + 1_000_000n)) /
        (integer(input.userVaultShares, "user") + 1_000_000n);
      expect(value.toString() === fixture.expected, `${fixtureId} wrapper deposit drifted`);
    } else if (fixture.operation === "wrapper-withdraw") {
      const value =
        (integer(input.receipts, "receipts") *
          (integer(input.userVaultShares, "user") + 1_000_000n)) /
        (integer(input.receiptSupply, "supply") + 1_000_000n);
      expect(value.toString() === fixture.expected, `${fixtureId} wrapper withdraw drifted`);
    } else if (fixture.operation === "wrapper-harvest") {
      const expectedObject = object(expected, `${fixtureId}.expected`);
      const current = integer(input.currentRatio, "current");
      const last = integer(input.lastShareRatio, "last");
      const gaugeSet = input.gaugeSet === true;
      const yieldShares =
        !gaugeSet || current <= last
          ? 0n
          : (integer(input.userVaultShares, "user") * (current - last)) / current;
      const newLast = !gaugeSet ? current : current > last ? current : last;
      expect(
        integer(expectedObject.yieldShares, "yield") === yieldShares &&
          integer(expectedObject.newLastShareRatio, "new last") === newLast,
        `${fixtureId} harvest drifted`,
      );
    } else if (fixture.operation === "liquidity") {
      const expectedObject = object(expected, `${fixtureId}.expected`);
      const available =
        integer(input.idle, "idle") + integer(input.marketLiquidity, "market liquidity");
      const requested = integer(input.requested, "requested");
      expect(
        integer(expectedObject.ordinaryAvailable, "available") === available,
        `${fixtureId} available drifted`,
      );
      expect(
        integer(expectedObject.shortfall, "shortfall") ===
          (requested > available ? requested - available : 0n),
        `${fixtureId} shortfall drifted`,
      );
    } else if (fixture.operation === "ownership") {
      const expectedObject = object(expected, `${fixtureId}.expected`);
      expect(
        integer(expectedObject.beneficialReceipts, "beneficial") ===
          integer(input.walletReceipts, "wallet") + integer(input.gaugeBeneficialReceipts, "gauge"),
        `${fixtureId} ownership drifted`,
      );
    }
  }
  await validateVaultFlow();
  validateReproduction(objects(reproduction.records, "reproduction.records"));
  await validateSources("sources/catalog.json");
}

process.stdout.write(`Validated ${moduleId} at block ${String(scope.blockNumber)}.\n`);
