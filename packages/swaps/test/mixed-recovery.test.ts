import { expect, test, vi } from "vitest";
import type { SubmissionRecord } from "@mezo-dev-kit/core";
import type {
  BasicSwapWriter,
  CLSwapWriter,
  PreparedBasicSwap,
  PreparedCLSwap,
} from "../src/index.ts";
import { prepareMixedSwapContinuation } from "../examples/mixed-recovery.ts";
import type { MixedSwapCheckpoint, MixedSwapPersistence } from "../examples/mixed-recovery.ts";
import { clQuoteFixture } from "./cl-fixture.ts";

function fixture() {
  const q = clQuoteFixture(),
    inputToken = `0x${"44".repeat(20)}` as const;
  const first: PreparedBasicSwap = {
    quote: {
      sourceClass: "dex-execution-quote",
      providerId: "mixed-model",
      coordinate: q.coordinate,
      timestamp: q.timestamp,
      route: [{ tokenIn: inputToken, tokenOut: q.inputToken.target.address, stable: true }],
      intermediateAssets: [],
      account: q.account,
      router: q.router.address,
      amountIn: 100n,
      amounts: [100n, 999n],
      estimatedAmountOut: 999n,
      maxAgeBlocks: 2n,
      inputToken: { ...q.inputToken, target: { ...q.inputToken.target, address: inputToken } },
      outputToken: q.inputToken,
      pools: [],
      writeCompatible: true,
    },
    bounds: { amountOutMinimum: 50n, deadline: q.timestamp + 100n, maxDeadlineSeconds: 100n },
    approval: { kind: "sufficient" },
    transaction: {
      operationId: "mixed-first",
      contractId: "mezo-earn.router",
      coordinate: q.coordinate,
      from: q.account,
      to: q.router.address,
      value: 0n,
      data: "0x12345678",
    },
  };
  const record: SubmissionRecord = {
    schemaVersion: 1,
    operationId: first.transaction.operationId,
    networkId: q.coordinate.networkId,
    contractId: first.transaction.contractId,
    blockNumber: q.coordinate.blockNumber.toString(),
    blockHash: q.coordinate.blockHash,
    hash: `0x${"ab".repeat(32)}`,
    inclusion: null,
    call: {
      chainId: q.coordinate.chainId.toString(),
      from: q.account,
      to: q.router.address,
      nonce: "0",
      value: "0",
      data: first.transaction.data,
    },
  };
  const receipt = {
    transactionHash: record.hash!,
    blockNumber: q.coordinate.blockNumber + 1n,
    blockHash: `0x${"cd".repeat(32)}` as const,
    logs: [],
  };
  const forbidden = vi.fn(async (): Promise<never> => {
    throw new Error("continuation must never submit or repeat the first leg");
  });
  const reconcile = vi.fn(async () => ({
    state: "reconciled" as const,
    record,
    receipt,
    outcome: {
      amountIn: 100n,
      amountOut: 90n,
      amounts: [100n, 90n],
      fees: [1n],
      coordinate: q.coordinate,
    },
  }));
  const firstWriter: BasicSwapWriter = {
    prepare: forbidden,
    simulate: forbidden,
    submit: forbidden,
    reconcile,
  };
  const prepare = vi.fn<CLSwapWriter["prepare"]>(async (input) => {
    const result: PreparedCLSwap = {
      quote: { ...q, amountIn: input.amountIn },
      bounds: input.bounds,
      approval: { kind: "sufficient" },
      transaction: {
        operationId: input.operationId,
        contractId: q.router.contractId,
        coordinate: q.coordinate,
        from: q.account,
        to: q.router.address,
        value: 0n,
        data: "0x12345678",
      },
    };
    return result;
  });
  const secondWriter: CLSwapWriter = {
    prepare,
    simulate: forbidden,
    submit: forbidden,
    reconcile: forbidden,
  };
  let checkpoint: unknown = null,
    secondSubmission: unknown = null;
  const persistence: MixedSwapPersistence = {
    loadCheckpoint: vi.fn(async () => structuredClone(checkpoint)),
    saveCheckpoint: vi.fn(async (value) => {
      checkpoint = JSON.parse(JSON.stringify(value)) as unknown;
    }),
    loadSecondSubmission: vi.fn(async () => structuredClone(secondSubmission)),
  };
  const input = {
    first: { family: "basic" as const, writer: firstWriter, prepared: first, record },
    second: {
      family: "cl" as const,
      writer: secondWriter,
      quote: {
        route: q.route,
        account: q.account,
        intermediateAssets: q.intermediateAssets,
        maxAgeBlocks: 2n,
        budget: q.budget,
      },
      bounds: {
        minAmountOut: 1n,
        deadline: q.timestamp + 100n,
        maxDeadlineSeconds: 100n,
        maxBlockAge: 2n,
      },
    },
    secondOperationId: "mixed-second",
    intermediateToken: q.inputToken.target.address,
    consentToSeparateTransactions: true,
    persistence,
  };
  return {
    input,
    reconcile,
    forbidden,
    prepare,
    receipt,
    checkpoint: () => checkpoint,
    setCheckpoint: (value: unknown) => {
      checkpoint = value;
    },
    setSubmission: () => {
      secondSubmission = {
        ...record,
        operationId: "mixed-second",
        contractId: q.router.contractId,
        hash: null,
        call: { ...record.call, nonce: "1" },
      };
    },
  };
}
test("continuation requires explicit non-atomic consent before any persistence or preparation", async () => {
  const f = fixture();
  await expect(
    prepareMixedSwapContinuation({ ...f.input, consentToSeparateTransactions: false }),
  ).rejects.toThrow("explicit consent");
  expect(f.reconcile).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.checkpoint()).toBeNull();
});
test("second-leg preparation spends reconciled output rather than the old quote or wallet balance", async () => {
  const f = fixture(),
    result = await prepareMixedSwapContinuation(f.input);
  expect(result.state).toBe("ready");
  expect(f.prepare).toHaveBeenCalledWith(
    expect.objectContaining({ amountIn: 90n, operationId: "mixed-second" }),
  );
  expect(f.checkpoint()).toMatchObject({
    realizedAmount: "90",
    intermediateToken: f.input.intermediateToken,
  });
  expect(f.forbidden).not.toHaveBeenCalled();
});
test("a rejected second preparation retains the checkpoint and retries without repeating the first transaction", async () => {
  const f = fixture();
  f.prepare.mockRejectedValueOnce(new Error("new minimum cannot be satisfied"));
  await expect(prepareMixedSwapContinuation(f.input)).rejects.toThrow("new minimum");
  expect(f.checkpoint()).toMatchObject({ realizedAmount: "90" });
  await expect(
    prepareMixedSwapContinuation({
      ...f.input,
      first: { ...f.input.first, prepared: structuredClone(f.input.first.prepared) },
    }),
  ).resolves.toHaveProperty("state", "ready");
  expect(f.reconcile).toHaveBeenCalledTimes(2);
  expect(f.forbidden).not.toHaveBeenCalled();
});
test("persistence failure prevents second preparation", async () => {
  const f = fixture();
  vi.mocked(f.input.persistence.saveCheckpoint).mockRejectedValue(new Error("disk unavailable"));
  await expect(prepareMixedSwapContinuation(f.input)).rejects.toThrow("disk unavailable");
  expect(f.prepare).not.toHaveBeenCalled();
});
test("a reserved second nonce with no hash is preserved as submission uncertainty", async () => {
  const f = fixture();
  f.setSubmission();
  await expect(prepareMixedSwapContinuation(f.input)).resolves.toMatchObject({
    state: "second-submitted",
    record: { hash: null },
  });
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.forbidden).not.toHaveBeenCalled();
});
test("a changed source inclusion or cached amount cannot authorize a new second leg", async () => {
  const f = fixture(),
    result = await prepareMixedSwapContinuation(f.input);
  const checkpoint: MixedSwapCheckpoint = result.checkpoint;
  f.setCheckpoint({ ...checkpoint, realizedAmount: "999" });
  f.prepare.mockClear();
  await expect(prepareMixedSwapContinuation(f.input)).rejects.toThrow("saved first-leg anchor");
  expect(f.prepare).not.toHaveBeenCalled();
  f.setCheckpoint(checkpoint);
  f.receipt.blockHash = `0x${"ef".repeat(32)}`;
  await expect(prepareMixedSwapContinuation(f.input)).rejects.toThrow("saved first-leg anchor");
});
test("second operation ID, account and intermediate identity remain bound on resume", async () => {
  const f = fixture();
  await prepareMixedSwapContinuation(f.input);
  f.prepare.mockClear();
  await expect(
    prepareMixedSwapContinuation({ ...f.input, secondOperationId: "replacement-operation" }),
  ).rejects.toThrow("saved first-leg anchor");
  await expect(
    prepareMixedSwapContinuation({ ...f.input, intermediateToken: `0x${"55".repeat(20)}` }),
  ).rejects.toThrow("intermediate custody");
  expect(f.prepare).not.toHaveBeenCalled();
});
