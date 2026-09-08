import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { createCoreClient } from "../src/client.ts";
import { CoreError, getErrorDefinitions } from "../src/errors.ts";
import {
  TRANSACTION_STATES,
  TRANSACTION_TRANSITIONS,
  createLifecycle,
  isProtocolSuccess,
  nextLifecycleEvents,
  transitionLifecycle,
} from "../src/lifecycle.ts";
import {
  assertBaseUnits,
  callsEqual,
  describeCall,
  normalizeAddress,
  normalizeBlockNumber,
  normalizeCall,
  normalizeChainId,
  normalizeTransactionHash,
  parseDisplayUnits,
} from "../src/validation.ts";
import type {
  CoreSigner,
  CoreTransport,
  DeploymentCandidate,
  DeploymentRegistry,
  ReceiptLike,
  TrackedTransaction,
  TransportContext,
} from "../src/client.ts";
import type { Lifecycle } from "../src/lifecycle.ts";
import type { Call, TransactionHash } from "../src/validation.ts";

const HASH_1 = normalizeTransactionHash(`0x${"11".repeat(32)}`);
const HASH_2 = normalizeTransactionHash(`0x${"22".repeat(32)}`);
const HASH_3 = normalizeTransactionHash(`0x${"33".repeat(32)}`);
const BLOCK_HASH_A = `0x${"aa".repeat(32)}`;
const BLOCK_HASH_B = `0x${"bb".repeat(32)}`;
const ADDRESS_A = normalizeAddress("0x1111111111111111111111111111111111111111");
const ADDRESS_B = normalizeAddress("0x2222222222222222222222222222222222222222");
const UINT_256_MAX = 2n ** 256n - 1n;

const transactionModel = parseTransactionModel(
  JSON.parse(
    await readFile(
      new URL(
        "../../../knowledge/workflows/transactions/records/state-machine.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
const transactionErrors = parseTransactionErrors(
  JSON.parse(
    await readFile(
      new URL("../../../knowledge/workflows/transactions/records/errors.json", import.meta.url),
      "utf8",
    ),
  ),
);

test("lifecycle inventory exactly matches the accepted transaction model", () => {
  assert.deepEqual(
    TRANSACTION_STATES,
    transactionModel.states.map((state) => ({
      id: state.id,
      terminal: state.terminal,
      actionHashRequired: state.actionHashRequired,
      approvalHashRequired: state.approvalHashRequired ?? false,
      successLevel: state.successLevel,
    })),
  );
  assert.deepEqual(TRANSACTION_TRANSITIONS, transactionModel.transitions);
});

test("every accepted transition is executable and no unlisted event is accepted", () => {
  for (const transition of TRANSACTION_TRANSITIONS) {
    const lifecycle: Lifecycle = {
      operationId: "model-test",
      state: transition.from,
      call: null,
      approvalHash: HASH_2,
      actionHash: HASH_1,
      replacement: null,
      cancellationHash: null,
      history: [],
    };
    const context =
      transition.event === "approval-required-and-submitted"
        ? { approvalHash: HASH_2 }
        : transition.event === "action-submitted"
          ? { actionHash: HASH_1 }
          : transition.event === "replacement-observed"
            ? {
                replacementHash: HASH_3,
                reason: "repriced",
                successorOperationId: "replacement-operation",
              }
            : transition.event === "cancellation-observed"
              ? { cancellationHash: HASH_3 }
              : {};
    assert.equal(transitionLifecycle(lifecycle, transition.event, context).state, transition.to);
  }

  const created = createLifecycle({ operationId: "invalid-event" });
  assert.throws(() => transitionLifecycle(created, "successful-receipt-observed"), /invalid/);
  assert.deepEqual([...nextLifecycleEvents(created)].sort(), [
    "simulation-reverted",
    "simulation-succeeded",
    "validation-or-build-invalid",
  ]);
});

test("approval and action identities remain distinct and replacement links a successor", () => {
  let lifecycle = createLifecycle({ operationId: "approval-flow" });
  lifecycle = transitionLifecycle(lifecycle, "simulation-succeeded");
  lifecycle = transitionLifecycle(lifecycle, "approval-required-and-submitted", {
    approvalHash: HASH_1,
  });
  lifecycle = transitionLifecycle(lifecycle, "approval-receipt-succeeded");
  lifecycle = transitionLifecycle(lifecycle, "approval-confirmation-threshold-met");
  lifecycle = transitionLifecycle(
    lifecycle,
    "volatile-inputs-revalidated-and-simulation-succeeded",
  );
  lifecycle = transitionLifecycle(lifecycle, "action-submitted", { actionHash: HASH_2 });
  lifecycle = transitionLifecycle(lifecycle, "replacement-observed", {
    replacementHash: HASH_3,
    reason: "repriced",
    successorOperationId: "approval-flow-replacement",
  });
  assert.equal(lifecycle.approvalHash, HASH_1);
  assert.equal(lifecycle.actionHash, HASH_2);
  assert.deepEqual(lifecycle.replacement, {
    hash: HASH_3,
    reason: "repriced",
    successorOperationId: "approval-flow-replacement",
  });
  assert.equal(lifecycle.state, "replaced");
  assert.equal(isProtocolSuccess(lifecycle), false);
  assert.throws(() => transitionLifecycle(lifecycle, "tracking-resumed"), /terminal/);
});

test("error implementation exactly matches the accepted taxonomy", () => {
  const definitions = getErrorDefinitions();
  assert.deepEqual(
    Object.entries(definitions).map(([id, value]) => ({
      id,
      stage: value.stage,
      retry: value.retry,
      requiredContext: [...value.requiredContext],
    })),
    transactionErrors.errors,
  );
  assert.throws(() => new CoreError("ChainMismatch", "mismatch", {}), /missing 'expectedChainId'/);
});

test("unit and address boundaries reject unsafe values", () => {
  assert.deepEqual(parseDisplayUnits("12.340001", { decimals: 6, assetId: "usdc" }), {
    assetId: "usdc",
    decimals: 6,
    amount: 12_340_001n,
  });
  assert.deepEqual(assertBaseUnits("42", { decimals: 18, assetId: "musd" }), {
    assetId: "musd",
    decimals: 18,
    amount: 42n,
  });
  assert.equal(normalizeAddress(ADDRESS_A.toUpperCase().replace("0X", "0x")), ADDRESS_A);
  assert.throws(
    () => parseDisplayUnits(1.1, { decimals: 18, assetId: "musd" }),
    (error) => error instanceof CoreError && error.code === "InvalidUnits",
  );
  assert.throws(
    () => parseDisplayUnits("1.0000001", { decimals: 6, assetId: "usdc" }),
    (error) => error instanceof CoreError && error.code === "InvalidUnits",
  );
  assert.throws(
    () => assertBaseUnits(-1n, { decimals: 18, assetId: "musd" }),
    (error) => error instanceof CoreError && error.code === "InvalidUnits",
  );
});

describe("validation edge partitions", () => {
  test.for([
    { label: "zero with zero decimals", input: "0", decimals: 0, expected: 0n },
    { label: "one smallest six-decimal unit", input: "0.000001", decimals: 6, expected: 1n },
    { label: "explicit fractional zeros", input: "1.000000", decimals: 6, expected: 1_000_000n },
    {
      label: "integer beyond JavaScript's safe range",
      input: UINT_256_MAX.toString(),
      decimals: 0,
      expected: UINT_256_MAX,
    },
    {
      label: "maximum supported decimal precision",
      input: `0.${"0".repeat(254)}1`,
      decimals: 255,
      expected: 1n,
    },
  ])("parses $label without numeric coercion", ({ input, decimals, expected }) => {
    expect(parseDisplayUnits(input, { decimals, assetId: "asset" })).toEqual({
      assetId: "asset",
      decimals,
      amount: expected,
    });
  });

  test.for([
    { label: "negative", input: "-1" },
    { label: "explicit plus sign", input: "+1" },
    { label: "leading zero", input: "01" },
    { label: "missing whole part", input: ".1" },
    { label: "missing fractional part", input: "1." },
    { label: "scientific notation", input: "1e6" },
    { label: "surrounding whitespace", input: " 1" },
    { label: "trailing newline", input: "1\n" },
    { label: "precision above asset decimals", input: "1.0000001" },
    { label: "unsafe JavaScript number", input: 1.1 },
    { label: "missing input", input: undefined },
    { label: "null input", input: null },
  ])("rejects $label display-unit input", ({ input }) => {
    expect(() => parseDisplayUnits(input, { decimals: 6, assetId: "asset" })).toThrowError(
      expect.objectContaining({ code: "InvalidUnits" }),
    );
  });

  test.for([
    { label: "zero bigint", input: 0n, expected: 0n },
    { label: "zero string", input: "0", expected: 0n },
    { label: "maximum uint-sized bigint", input: UINT_256_MAX, expected: UINT_256_MAX },
    {
      label: "maximum uint-sized decimal string",
      input: UINT_256_MAX.toString(),
      expected: UINT_256_MAX,
    },
  ])("accepts $label as exact base units", ({ input, expected }) => {
    expect(assertBaseUnits(input, { decimals: 18, assetId: "asset" }).amount).toBe(expected);
  });

  test.for([
    { label: "negative bigint", input: -1n },
    { label: "negative string", input: "-1" },
    { label: "leading-zero string", input: "01" },
    { label: "trailing newline", input: "1\n" },
    { label: "decimal string", input: "1.0" },
    { label: "JavaScript integer", input: 1 },
    { label: "NaN", input: Number.NaN },
    { label: "infinity", input: Number.POSITIVE_INFINITY },
    { label: "missing input", input: undefined },
    { label: "null input", input: null },
  ])("rejects $label as base units", ({ input }) => {
    expect(() => assertBaseUnits(input, { decimals: 18, assetId: "asset" })).toThrowError(
      expect.objectContaining({ code: "InvalidUnits" }),
    );
  });

  test.for([
    { decimals: -1, label: "negative" },
    { decimals: 1.5, label: "fractional" },
    { decimals: 256, label: "above the supported maximum" },
    { decimals: Number.MAX_SAFE_INTEGER + 1, label: "unsafe integer" },
  ])("rejects $label decimal metadata", ({ decimals }) => {
    expect(() => parseDisplayUnits("1", { decimals, assetId: "asset" })).toThrow(TypeError);
  });

  test("normalizes exact call data while preserving identity-relevant differences", () => {
    const normalized = normalizeCall({
      to: ADDRESS_A.toUpperCase().replace("0X", "0x"),
      from: ADDRESS_B,
      data: "0xAABBCCDD00",
      value: "0",
    });

    expect(normalized).toEqual({
      to: ADDRESS_A,
      from: ADDRESS_B,
      data: "0xaabbccdd00",
      value: 0n,
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(describeCall(normalized)).toEqual({
      to: ADDRESS_A,
      from: ADDRESS_B,
      value: "0",
      selector: "0xaabbccdd",
      calldataBytes: 5,
    });
    expect(callsEqual(normalized, { ...normalized, value: 1n })).toBe(false);
    expect(callsEqual(normalized, { ...normalized, data: "0xAABBCCDD00" })).toBe(true);
  });

  test.for([
    { label: "odd-length calldata", call: { to: ADDRESS_A, data: "0x0", value: 0n } },
    { label: "non-hex calldata", call: { to: ADDRESS_A, data: "0xgg", value: 0n } },
    { label: "short destination", call: { to: "0x11", data: "0x", value: 0n } },
    { label: "unsafe numeric value", call: { to: ADDRESS_A, data: "0x", value: 0 } },
    { label: "non-object call", call: null },
  ])("rejects a call with $label", ({ call }) => {
    expect(() => normalizeCall(call)).toThrow();
  });

  test("accepts zero blocks but requires positive chain IDs", () => {
    expect(normalizeBlockNumber(0n)).toBe(0n);
    expect(normalizeBlockNumber(UINT_256_MAX.toString())).toBe(UINT_256_MAX);
    expect(normalizeChainId(1n)).toBe(1n);
    expect(normalizeChainId(UINT_256_MAX.toString())).toBe(UINT_256_MAX);

    expect(() => normalizeBlockNumber(-1n)).toThrowError(
      expect.objectContaining({ code: "InvalidUnits" }),
    );
    expect(() => normalizeChainId(0n)).toThrow(TypeError);
    expect(() => normalizeChainId(1)).toThrow(TypeError);
    expect(() => normalizeChainId("01")).toThrow(TypeError);
  });

  test.for([
    { label: "missing prefix", input: "11".repeat(32) },
    { label: "31-byte value", input: `0x${"11".repeat(31)}` },
    { label: "33-byte value", input: `0x${"11".repeat(33)}` },
    { label: "non-hex value", input: `0x${"zz".repeat(32)}` },
    { label: "non-string value", input: 1n },
  ])("rejects a transaction hash with $label", ({ input }) => {
    expect(() => normalizeTransactionHash(input)).toThrow(TypeError);
  });

  test("normalizes a mixed-case 32-byte transaction hash", () => {
    const mixedCase = `0x${"Aa".repeat(32)}`;
    expect(normalizeTransactionHash(mixedCase)).toBe(mixedCase.toLowerCase());
  });
});

test("chain mismatch fails before registry resolution", async () => {
  const harness = createHarness({ transportChainId: 1n });
  await expect(
    harness.client.resolveDeployment({
      contractId: "musd.token",
      blockNumber: 90n,
      supportPolicy: () => true,
    }),
  ).rejects.toMatchObject({ code: "ChainMismatch" });
  assert.equal(harness.registryCalls.length, 0);
});

test("signer chain mismatch also fails before registry resolution", async () => {
  const harness = createHarness({ signerChainId: 1n });
  await expect(
    harness.client.resolveDeployment({
      contractId: "musd.token",
      blockNumber: 90n,
      supportPolicy: () => true,
    }),
  ).rejects.toMatchObject({ code: "ChainMismatch", context: { signerChainId: "1" } });
  assert.equal(harness.registryCalls.length, 0);
});

test("deployment resolution is stable-ID, network, coordinate, and policy scoped", async () => {
  const harness = createHarness();
  const deployment = await harness.client.resolveDeployment({
    contractId: "musd.token",
    blockNumber: 90n,
    supportPolicy: (candidate) => candidate.supportStatus === "supported",
  });
  assert.equal(deployment.id, "musd.token@mezo-mainnet");
  assert.equal(deployment.validityCoordinate.blockNumber, 90n);
  assert.deepEqual(harness.registryCalls[0], {
    contractId: "musd.token",
    networkId: "mezo-mainnet",
    validityCoordinate: { blockNumber: 90n },
  });

  await expect(
    harness.client.resolveDeployment({
      contractId: "musd.token",
      blockNumber: 90n,
      supportPolicy: () => false,
    }),
  ).rejects.toMatchObject({ code: "MissingDeployment" });
});

test("coherent reads pin one block and preserve optional failures", async () => {
  const harness = createHarness();
  const result = await harness.client.readCoherent({
    calls: [
      { id: "required-balance", request: { method: "balance" } },
      { id: "optional-symbol", required: false, request: { method: "fail" } },
      { id: "required-rate", request: { method: "rate" } },
    ],
  });
  assert.equal(result.coordinate.blockNumber, 100n);
  assert.deepEqual(harness.readBlocks, [100n, 100n, 100n]);
  const [requiredBalance, optionalSymbol, requiredRate] = result.results;
  assert(requiredBalance?.status === "fulfilled");
  assert(optionalSymbol?.status === "rejected");
  assert(requiredRate?.status === "fulfilled");
  assert.equal(requiredBalance.value, "balance@100");
  assert.equal(optionalSymbol.error.code, "ProviderError");
  assert.equal(requiredRate.value, "rate@100");
});

test("a failed required read fails the whole logical read", async () => {
  const harness = createHarness();
  await expect(
    harness.client.readCoherent({
      calls: [
        { id: "required-failure", request: { method: "fail" } },
        { id: "optional-success", required: false, request: { method: "okay" } },
      ],
    }),
  ).rejects.toMatchObject({
    code: "PartialReadError",
    context: {
      failedItems: ["required-failure"],
      blockCoordinate: { blockNumber: "100" },
    },
  });
});

test("exact simulation submits the same call once", async () => {
  const harness = createHarness();
  const deployment = harness.deployment;
  const call = { to: ADDRESS_A, from: ADDRESS_B, data: "0x12345678", value: 9n };
  const simulation = await harness.client.simulateExact({
    operationId: "write-1",
    deployment,
    call,
    blockNumber: 99n,
    entrypoint: "write(uint256)",
  });
  assert.equal(simulation.lifecycle.state, "simulated");
  const [simulatedCall] = harness.simulatedCalls;
  assert(simulatedCall !== undefined);
  assert.deepEqual(simulatedCall.request, simulation.request);

  const tracked = await harness.client.submitSimulated(simulation);
  assert.equal(tracked.lifecycle.state, "submitted");
  assert.equal(tracked.hash, HASH_1);
  assert.equal(harness.sentCalls.length, 1);
  assert.strictEqual(harness.sentCalls[0], simulation.request);
  await expect(harness.client.submitSimulated(simulation)).rejects.toMatchObject({
    code: "ProviderError",
    context: { acceptedUnknown: true },
  });
  assert.equal(harness.sentCalls.length, 1);
});

test("simulation rejects a destination outside the resolved deployment before transport", async () => {
  const harness = createHarness();

  await expect(
    harness.client.simulateExact({
      operationId: "wrong-destination",
      deployment: harness.deployment,
      call: { to: ADDRESS_B, data: "0x12345678", value: 0n },
      blockNumber: 99n,
      entrypoint: "write()",
    }),
  ).rejects.toThrow("simulation destination differs");
  expect(harness.simulatedCalls).toHaveLength(0);
  expect(harness.sentCalls).toHaveLength(0);
});

test("simulation rejects provider evidence for a different call and never submits", async () => {
  const harness = createHarness({
    simulatedRequestOverride: {
      to: ADDRESS_A,
      from: ADDRESS_B,
      data: "0x12345678",
      value: 1n,
    },
  });

  await expect(
    harness.client.simulateExact({
      operationId: "mismatched-simulation",
      deployment: harness.deployment,
      call: { to: ADDRESS_A, from: ADDRESS_B, data: "0x12345678", value: 0n },
      blockNumber: 99n,
      entrypoint: "write()",
    }),
  ).rejects.toMatchObject({
    code: "ProviderError",
    context: { operation: "simulate", acceptedUnknown: false },
  });
  expect(harness.sentCalls).toHaveLength(0);
});

test("simulation reverts retain structured contract evidence", async () => {
  const harness = createHarness({ simulationError: true });
  await expect(
    harness.client.simulateExact({
      operationId: "revert-1",
      deployment: harness.deployment,
      call: { to: ADDRESS_A, from: ADDRESS_B, data: "0xdeadbeef", value: 0n },
      blockNumber: 99n,
      entrypoint: "revertNow()",
    }),
  ).rejects.toMatchObject({
    code: "ContractRevert",
    context: { contractId: "musd.token", rawRevertData: "0x08c379a0" },
    lifecycle: { state: "simulation-failed" },
  });
});

test("simulation transport outages are not misclassified as contract reverts", async () => {
  const harness = createHarness({ simulationTransportError: true });
  await expect(
    harness.client.simulateExact({
      operationId: "transport-failure",
      deployment: harness.deployment,
      call: { to: ADDRESS_A, from: ADDRESS_B, data: "0xdeadbeef", value: 0n },
      blockNumber: 99n,
      entrypoint: "write()",
    }),
  ).rejects.toMatchObject({ code: "ProviderError", context: { operation: "simulate" } });
});

test("timeout is non-terminal and a later receipt can confirm", async () => {
  const harness = createHarness({ now: 2_000 });
  let tracked = await simulateAndSubmit(harness);
  tracked = await harness.client.observeTransaction(tracked, { deadline: 1_000 });
  assert.equal(tracked.lifecycle.state, "timed-out");
  assert.equal(tracked.receipt, null);

  harness.setReceipt(successReceipt());
  tracked = await harness.client.observeTransaction(tracked, { deadline: 1_000 });
  assert.equal(tracked.lifecycle.state, "confirmed");
  assert.equal(tracked.confirmations, 2n);
  assert.equal(isProtocolSuccess(tracked.lifecycle), false);
});

test("failed receipts, reorgs, replacement, and cancellation remain distinct", async () => {
  const failedHarness = createHarness({ receipt: { ...successReceipt(), status: "0x0" } });
  const failed = await failedHarness.client.observeTransaction(
    await simulateAndSubmit(failedHarness),
  );
  assert.equal(failed.lifecycle.state, "transaction-failed");

  const reorgHarness = createHarness({
    receipt: successReceipt(),
    canonicalBlockHash: BLOCK_HASH_B,
  });
  const reorged = await reorgHarness.client.observeTransaction(
    await simulateAndSubmit(reorgHarness),
  );
  assert.equal(reorged.lifecycle.state, "reorged");
  const resumed = await reorgHarness.client.resumeAfterReorg(reorged);
  assert.equal(resumed.lifecycle.state, "submitted");

  const replacementHarness = createHarness();
  const submitted = await simulateAndSubmit(replacementHarness);
  const replaced = replacementHarness.client.markReplacement(submitted, {
    replacementHash: HASH_2,
    reason: "repriced",
    successorOperationId: "successor",
  });
  assert.equal(replaced.lifecycle.state, "replaced");
  const cancelled = replacementHarness.client.markCancellation(submitted, {
    cancellationHash: HASH_3,
  });
  assert.equal(cancelled.lifecycle.state, "cancelled");
});

test("an invalid receipt status is provider evidence failure, not transaction failure", async () => {
  const harness = createHarness({ receipt: { ...successReceipt(), status: null } });
  await expect(
    harness.client.observeTransaction(await simulateAndSubmit(harness)),
  ).rejects.toMatchObject({
    code: "ProviderError",
    context: { operation: "get-transaction-receipt" },
  });
});

test("only explicit protocol reconciliation creates success", async () => {
  const harness = createHarness({ receipt: successReceipt() });
  const confirmed = await harness.client.observeTransaction(await simulateAndSubmit(harness));
  assert.equal(confirmed.lifecycle.state, "confirmed");
  const reconciled = await harness.client.reconcile(confirmed, {
    expectedOutcome: { recipientDelta: "10" },
    reconciler: async ({ expectedOutcome }) => ({ matched: true, observed: expectedOutcome }),
  });
  assert.equal(reconciled.lifecycle.state, "reconciled");
  assert.equal(isProtocolSuccess(reconciled.lifecycle), true);

  const secondHarness = createHarness({ receipt: successReceipt() });
  const secondConfirmed = await secondHarness.client.observeTransaction(
    await simulateAndSubmit(secondHarness),
  );
  await expect(
    secondHarness.client.reconcile(secondConfirmed, {
      expectedOutcome: { recipientDelta: "10" },
      reconciler: async () => ({ matched: false, observed: { recipientDelta: "9" } }),
    }),
  ).rejects.toMatchObject({
    code: "ReconciliationError",
    context: {
      expectedOutcome: { recipientDelta: "10" },
      observedOutcome: { observed: { recipientDelta: "9" } },
    },
  });
});

interface TransactionModelFixture {
  readonly states: readonly Readonly<Record<string, unknown>>[];
  readonly transitions: unknown;
}

interface TransactionErrorsFixture {
  readonly errors: unknown;
}

interface TestReceipt extends ReceiptLike {
  readonly transactionHash: TransactionHash;
  readonly status: string | null;
  readonly blockNumber: bigint;
  readonly blockHash: string;
}

interface HarnessOptions {
  readonly transportChainId?: bigint;
  readonly signerChainId?: bigint;
  readonly confirmations?: bigint;
  readonly receipt?: TestReceipt | null;
  readonly canonicalBlockHash?: string;
  readonly simulationError?: boolean;
  readonly simulationTransportError?: boolean;
  readonly simulatedRequestOverride?: Readonly<Call> | null;
  readonly now?: number;
}

interface TestHarness {
  readonly client: ReturnType<typeof createCoreClient>;
  readonly deployment: DeploymentCandidate;
  readonly readBlocks: bigint[];
  readonly registryCalls: Parameters<DeploymentRegistry["resolveDeployment"]>[0][];
  readonly simulatedCalls: {
    readonly request: Readonly<Call>;
    readonly context: TransportContext;
  }[];
  readonly sentCalls: Readonly<Call>[];
  readonly setReceipt: (value: TestReceipt | null) => void;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseTransactionModel(value: unknown): TransactionModelFixture {
  const model = expectRecord(value, "transaction model");
  if (!Array.isArray(model.states) || !Array.isArray(model.transitions)) {
    throw new TypeError("transaction model must contain state and transition arrays");
  }
  return {
    states: model.states.map((state) => expectRecord(state, "transaction state")),
    transitions: model.transitions,
  };
}

function parseTransactionErrors(value: unknown): TransactionErrorsFixture {
  const errors = expectRecord(value, "transaction errors").errors;
  if (!Array.isArray(errors)) {
    throw new TypeError("transaction errors must contain an errors array");
  }
  return { errors };
}

async function simulateAndSubmit(harness: TestHarness): Promise<Readonly<TrackedTransaction>> {
  const simulation = await harness.client.simulateExact({
    operationId: `operation-${harness.sentCalls.length}`,
    deployment: harness.deployment,
    call: { to: ADDRESS_A, from: ADDRESS_B, data: "0x12345678", value: 0n },
    blockNumber: 99n,
    entrypoint: "write()",
  });
  return harness.client.submitSimulated(simulation);
}

function successReceipt(): TestReceipt {
  return {
    transactionHash: HASH_1,
    status: "0x1",
    blockNumber: 99n,
    blockHash: BLOCK_HASH_A,
  };
}

function createHarness({
  transportChainId = 31_612n,
  signerChainId = 31_612n,
  confirmations = 2n,
  receipt = null,
  canonicalBlockHash = BLOCK_HASH_A,
  simulationError = false,
  simulationTransportError = false,
  simulatedRequestOverride = null,
  now = 1_000,
}: HarnessOptions = {}): TestHarness {
  let currentReceipt = receipt;
  const registryCalls: TestHarness["registryCalls"] = [];
  const readBlocks: bigint[] = [];
  const simulatedCalls: TestHarness["simulatedCalls"] = [];
  const sentCalls: TestHarness["sentCalls"] = [];
  const deployment: DeploymentCandidate = {
    id: "musd.token@mezo-mainnet",
    contractId: "musd.token",
    networkId: "mezo-mainnet",
    address: ADDRESS_A,
    supportStatus: "supported",
  };
  const transport: CoreTransport = {
    id: "fake-transport",
    async getChainId() {
      return transportChainId;
    },
    async getBlockNumber() {
      return 100n;
    },
    async getBlock(blockNumber) {
      return { number: blockNumber, hash: blockNumber === 99n ? canonicalBlockHash : BLOCK_HASH_A };
    },
    async read(request: unknown, { blockNumber }: TransportContext) {
      readBlocks.push(blockNumber);
      const method = expectRecord(request, "read request").method;
      if (typeof method !== "string") throw new TypeError("read request method is required");
      if (method === "fail") throw new Error("read failed");
      return `${method}@${blockNumber}`;
    },
    async simulate(request: Readonly<Call>, context: TransportContext) {
      simulatedCalls.push({ request, context });
      if (simulationError) {
        const error = Object.assign(new Error("execution reverted"), {
          data: "0x08c379a0",
          decodedError: "Error(revert)",
        });
        throw error;
      }
      if (simulationTransportError) throw new Error("transport unavailable");
      return { request: simulatedRequestOverride ?? request, gasEstimate: 50_000n };
    },
    async getTransactionReceipt() {
      return currentReceipt;
    },
  };
  const registry: DeploymentRegistry = {
    async resolveDeployment(request: Parameters<DeploymentRegistry["resolveDeployment"]>[0]) {
      registryCalls.push(request);
      return deployment;
    },
  };
  const signer: CoreSigner = {
    async getChainId() {
      return signerChainId;
    },
    async getAddress() {
      return ADDRESS_B;
    },
    async sendTransaction(request: Readonly<Call>) {
      sentCalls.push(request);
      return { hash: HASH_1 };
    },
  };
  return {
    client: createCoreClient({
      network: { id: "mezo-mainnet", chainId: 31_612n },
      transport,
      registry,
      signer,
      confirmationPolicy: { confirmations },
      now: () => now,
    }),
    deployment,
    readBlocks,
    registryCalls,
    simulatedCalls,
    sentCalls,
    setReceipt(value: TestReceipt | null) {
      currentReceipt = value;
    },
  };
}
