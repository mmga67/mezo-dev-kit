import { expect, test } from "vitest";
import { resolveOperation } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionClient, SimulationVerifier } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { createCLPositionWriter } from "../src/index.ts";
import type { CLPoolSnapshot, CLPositionAction } from "../src/index.ts";
import { clBoundsFixture, clFixture, W } from "./cl-fixture.ts";
function harness() {
  let state = clFixture(),
    sends = 0,
    verifier: SimulationVerifier | undefined;
  let output: readonly bigint[] = [2995354955910780n, 2995354955910780n];
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
    writer: createCLPositionWriter({
      reader: { read: async () => structuredClone(state) },
      execution,
      transport: createRpcTransport({
        id: "unreachable",
        request: async () => {
          throw new Error("unexpected RPC");
        },
      }),
    }),
    update(value: CLPoolSnapshot) {
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
function input(action: CLPositionAction = { kind: "decrease", tokenId: 1n, liquidity: W }) {
  const state = clFixture();
  return {
    operationId: "cl-intent",
    account: state.account,
    key: state.key,
    action,
    bounds: {
      ...clBoundsFixture(),
      minLiquidity: action.kind === "mint" || action.kind === "increase" ? 1n : 0n,
    },
  };
}
test("CL mint freezes intent, uses exact existing-pool sentinel and self recipient", async () => {
  const h = harness(),
    original = input({
      kind: "mint",
      tickLower: -60,
      tickUpper: 60,
      amount0Desired: W,
      amount1Desired: W,
    });
  const prepared = await h.writer.prepare(original);
  original.bounds.deadline = 9999n;
  expect(prepared.bounds.deadline).toBe(1100n);
  expect(Object.isFrozen(prepared.action)).toBe(true);
  const abi = resolveOperation({
    ...prepared.snapshot.coordinate,
    contractId: prepared.snapshot.manager.contractId,
    functionName: "mint",
  }).functionAbi;
  expect(prepared.transaction.data).toBe(
    createAbiCodec().encodeFunction(abi, [
      [
        original.key.token0,
        original.key.token1,
        60n,
        -60n,
        60n,
        W,
        W,
        1n,
        1n,
        original.account,
        1100n,
        0n,
      ],
    ]),
  );
  expect(prepared.transaction.value).toBe(0n);
  h.setOutput([
    2n,
    prepared.forecast.liquidityDelta,
    prepared.forecast.amount0,
    prepared.forecast.amount1,
  ]);
  await h.writer.submit(prepared, await h.writer.simulate(prepared));
  expect(h.sends).toBe(1);
});
test("CL writer rejects foreign preparations/simulations and a false principal return", async () => {
  const h = harness(),
    other = harness(),
    prepared = await h.writer.prepare(input());
  await expect(other.writer.simulate(prepared)).rejects.toMatchObject({ code: "InvalidInput" });
  const foreign = await other.writer.prepare(input());
  await expect(
    h.writer.submit(prepared, await other.writer.simulate(foreign)),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  h.setOutput([2995354955910779n, 2995354955910780n]);
  await expect(h.writer.simulate(prepared)).rejects.toMatchObject({ code: "BoundExceeded" });
  expect(h.sends).toBe(0);
});
test.for(["age", "owner", "deadline", "price", "liquidity"] as const)(
  "CL %s change prevents wallet submission",
  async (kind) => {
    const h = harness(),
      prepared = await h.writer.prepare(input()),
      simulated = await h.writer.simulate(prepared),
      s = h.state;
    if (kind === "age")
      h.update({
        ...s,
        coordinate: { ...s.coordinate, blockNumber: s.coordinate.blockNumber + 3n },
      });
    if (kind === "owner")
      h.update({ ...s, positions: s.positions.map((p) => ({ ...p, owner: s.manager.address })) });
    if (kind === "deadline") h.update({ ...s, timestamp: 1100n });
    if (kind === "price") h.update({ ...s, sqrtPriceX96: clBoundsFixture().sqrtPriceMaxX96 + 1n });
    if (kind === "liquidity")
      h.update({ ...s, positions: s.positions.map((p) => ({ ...p, liquidity: W - 1n })) });
    await expect(h.writer.submit(prepared, simulated)).rejects.toThrow();
    expect(h.sends).toBe(0);
  },
);
test("CL allowance revocation after simulation prevents sending an increase", async () => {
  const h = harness(),
    prepared = await h.writer.prepare(
      input({ kind: "increase", tokenId: 1n, amount0Desired: W, amount1Desired: W }),
    );
  h.setOutput([
    prepared.forecast.liquidityDelta,
    prepared.forecast.amount0,
    prepared.forecast.amount1,
  ]);
  const simulated = await h.writer.simulate(prepared),
    s = h.state;
  h.update({ ...s, token0: { ...s.token0, allowance: 0n } });
  await expect(h.writer.submit(prepared, simulated)).rejects.toMatchObject({
    code: "BoundExceeded",
  });
  expect(h.sends).toBe(0);
});
test("CL collection simulation admits lower actual payout only within explicit minima", async () => {
  const h = harness(),
    original = input({ kind: "collect", tokenId: 1n, amount0Max: 11n, amount1Max: 13n });
  original.bounds.minAmount0 = 10n;
  original.bounds.minAmount1 = 12n;
  const prepared = await h.writer.prepare(original);
  h.setOutput([10n, 12n]);
  await h.writer.simulate(prepared);
  for (const output of [
    [9n, 12n],
    [12n, 13n],
  ]) {
    h.setOutput(output);
    await expect(h.writer.simulate(prepared)).rejects.toMatchObject({ code: "BoundExceeded" });
  }
  expect(h.sends).toBe(0);
});
test("CL forged persisted calldata fails before receipt or provider access", async () => {
  const h = harness(),
    prepared = await h.writer.prepare(input());
  const record = await h.writer.submit(prepared, await h.writer.simulate(prepared));
  await expect(
    h.writer.reconcile(prepared, { ...record, call: { ...record.call, data: "0x" } }),
  ).rejects.toMatchObject({ code: "ReconciliationMismatch" });
});
