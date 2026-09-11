import { expect, test } from "vitest";
import { resolveOperation } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionClient, SimulationVerifier } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { createCLSwapWriter } from "../src/index.ts";
import type { CLSwapQuote } from "../src/index.ts";
import { clQuoteFixture } from "./cl-fixture.ts";
function harness() {
  let state = clQuoteFixture(),
    sends = 0,
    verifier: SimulationVerifier | undefined;
  let output: readonly bigint[] = [state.estimatedAmountOut];
  const encoded = () =>
    `0x${output.map((value) => value.toString(16).padStart(64, "0")).join("")}` as const;
  const execution: ExecutionClient = {
    async simulate(prepared, verify) {
      verifier = verify;
      const call = { ...prepared, chainId: prepared.coordinate.chainId, nonce: 0n };
      await verify?.(encoded(), state.coordinate, call);
      return { prepared, call, returnData: encoded() };
    },
    async submit(simulated, revalidate) {
      await revalidate(simulated.prepared);
      await verifier?.(encoded(), state.coordinate, simulated.call);
      sends++;
      return {
        schemaVersion: 1,
        operationId: simulated.prepared.operationId,
        networkId: simulated.prepared.coordinate.networkId,
        contractId: simulated.prepared.contractId,
        blockNumber: simulated.prepared.coordinate.blockNumber.toString(),
        blockHash: simulated.prepared.coordinate.blockHash,
        call: {
          chainId: simulated.call.chainId.toString(),
          from: simulated.call.from,
          to: simulated.call.to,
          value: "0",
          data: simulated.call.data,
          nonce: "0",
        },
        hash: null,
        inclusion: null,
      };
    },
    async observe() {
      throw new Error("unused observation");
    },
    async inspectHash() {
      throw new Error("unused inspection");
    },
    async reconcile() {
      throw new Error("unexpected reconciliation");
    },
  };
  return {
    writer: createCLSwapWriter({
      reader: { quote: async () => structuredClone(state) },
      pools: {
        read: async () => {
          throw new Error("unexpected pool read");
        },
      },
      execution,
      transport: createRpcTransport({
        id: "unreachable",
        request: async () => {
          throw new Error("unexpected RPC");
        },
      }),
    }),
    update(value: CLSwapQuote) {
      state = value;
    },
    setOutput(value: readonly bigint[]) {
      output = value;
    },
    get state() {
      return state;
    },
    get sends() {
      return sends;
    },
  };
}
function input() {
  const q = clQuoteFixture();
  return {
    operationId: "cl-swap-intent",
    route: q.route,
    intermediateAssets: q.intermediateAssets,
    account: q.account,
    amountIn: q.amountIn,
    maxAgeBlocks: q.maxAgeBlocks,
    budget: q.budget,
    bounds: {
      minAmountOut: q.estimatedAmountOut - 1n,
      deadline: 1100n,
      maxDeadlineSeconds: 120n,
      maxBlockAge: 2n,
    },
  };
}
test("CL swap encodes direct self recipient, zero native value and default price sentinel", async () => {
  const h = harness(),
    original = input(),
    p = await h.writer.prepare(original);
  original.bounds.deadline = 9999n;
  expect(p.bounds.deadline).toBe(1100n);
  const hop = p.quote.route[0]!;
  const abi = resolveOperation({
    ...p.quote.coordinate,
    contractId: p.quote.router.contractId,
    functionName: "exactInputSingle",
  }).functionAbi;
  expect(p.transaction.data).toBe(
    createAbiCodec().encodeFunction(abi, [
      [
        hop.tokenIn,
        hop.tokenOut,
        BigInt(hop.tickSpacing),
        p.quote.account,
        1100n,
        p.quote.amountIn,
        p.bounds.minAmountOut,
        0n,
      ],
    ]),
  );
  expect(p.transaction.value).toBe(0n);
  await h.writer.submit(p, await h.writer.simulate(p));
  expect(h.sends).toBe(1);
});
test("CL foreign preparations and simulations cannot be submitted", async () => {
  const h = harness(),
    other = harness(),
    p = await h.writer.prepare(input());
  await expect(other.writer.simulate(p)).rejects.toMatchObject({ code: "InvalidInput" });
  const foreign = await other.writer.prepare(input());
  await expect(h.writer.submit(p, await other.writer.simulate(foreign))).rejects.toMatchObject({
    code: "InvalidInput",
  });
  expect(h.sends).toBe(0);
});
test("CL simulation must match the exact current quoted output, even above the minimum", async () => {
  const h = harness(),
    p = await h.writer.prepare(input());
  h.setOutput([p.quote.estimatedAmountOut + 1n]);
  await expect(h.writer.simulate(p)).rejects.toMatchObject({ code: "BoundExceeded" });
  expect(h.sends).toBe(0);
});
test.for(["age", "allowance", "balance", "output", "deadline", "refund", "router"] as const)(
  "CL %s change prevents wallet submission",
  async (kind) => {
    const h = harness(),
      p = await h.writer.prepare(input()),
      simulated = await h.writer.simulate(p),
      q = h.state;
    if (kind === "age")
      h.update({
        ...q,
        coordinate: { ...q.coordinate, blockNumber: q.coordinate.blockNumber + 3n },
      });
    if (kind === "allowance") h.update({ ...q, inputToken: { ...q.inputToken, allowance: 0n } });
    if (kind === "balance")
      h.update({ ...q, inputToken: { ...q.inputToken, balance: q.amountIn - 1n } });
    if (kind === "output") h.update({ ...q, estimatedAmountOut: q.estimatedAmountOut - 2n });
    if (kind === "deadline") h.update({ ...q, timestamp: 1100n });
    if (kind === "refund") h.update({ ...q, routerNativeBalance: 1n });
    if (kind === "router") h.update({ ...q, router: { ...q.router, address: q.account } });
    await expect(h.writer.submit(p, simulated)).rejects.toThrow();
    expect(h.sends).toBe(0);
  },
);
test("CL persisted recipient/calldata mismatch is rejected before receipt access", async () => {
  const h = harness(),
    p = await h.writer.prepare(input()),
    record = await h.writer.submit(p, await h.writer.simulate(p));
  await expect(
    h.writer.reconcile(p, { ...record, call: { ...record.call, data: "0x" } }),
  ).rejects.toMatchObject({ code: "ReconciliationMismatch" });
});
