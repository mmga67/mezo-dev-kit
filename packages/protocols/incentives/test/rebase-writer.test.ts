import { expect, test } from "vitest";
import { resolveOperation } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionClient, SimulationVerifier } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { createRebaseWriter } from "../src/index.ts";
import type { RebaseSnapshot } from "../src/index.ts";
import { rebaseFixture } from "./rebase-fixture.ts";
import { account, week } from "./lock-fixture.ts";
function harness() {
  let state = rebaseFixture(),
    sends = 0,
    verifier: SimulationVerifier | undefined,
    output = 6n;
  const encodedOutput = () => `0x${output.toString(16).padStart(64, "0")}` as const;
  const execution: ExecutionClient = {
    async simulate(prepared, verify) {
      verifier = verify;
      const call = { ...prepared, chainId: prepared.coordinate.chainId, nonce: 0n };
      await verify?.(encodedOutput(), state.escrow.coordinate, call);
      return { prepared, call, returnData: encodedOutput() };
    },
    async submit(simulated, revalidate) {
      await revalidate(simulated.prepared);
      await verifier?.(encodedOutput(), state.escrow.coordinate, simulated.call);
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
  const transport = createRpcTransport({
    id: "unreachable",
    request: async () => {
      throw new Error("unexpected RPC");
    },
  });
  return {
    writer: createRebaseWriter({
      reader: { read: async () => structuredClone(state) },
      execution,
      transport,
    }),
    update(value: RebaseSnapshot) {
      state = value;
    },
    setOutput(value: bigint) {
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
  return {
    operationId: "rebase-intent",
    account,
    tokenId: 1n,
    bounds: { minAmount: 6n, maxBlockAge: 2n },
  };
}
test("rebase preparation freezes its bounds and submits only the exact canonical claim", async () => {
  const h = harness(),
    original = input(),
    prepared = await h.writer.prepare(original);
  original.bounds.minAmount = 9n;
  expect(prepared.bounds.minAmount).toBe(6n);
  expect(Object.isFrozen(prepared.bounds)).toBe(true);
  const abi = resolveOperation({
    ...prepared.snapshot.escrow.coordinate,
    contractId: prepared.snapshot.contract.contractId,
    functionName: "claim",
  }).functionAbi;
  expect(prepared.transaction.data).toBe(createAbiCodec().encodeFunction(abi, [1n]));
  expect(prepared.transaction.value).toBe(0n);
  expect((await h.writer.submit(prepared, await h.writer.simulate(prepared))).operationId).toBe(
    "rebase-intent",
  );
  expect(h.sends).toBe(1);
});
test("rebase writer rejects foreign preparation, foreign simulation and mismatching simulated return", async () => {
  const h = harness(),
    other = harness(),
    prepared = await h.writer.prepare(input());
  await expect(other.writer.simulate(prepared)).rejects.toMatchObject({ code: "InvalidInput" });
  const foreign = await other.writer.prepare(input());
  await expect(
    h.writer.submit(prepared, await other.writer.simulate(foreign)),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  h.setOutput(5n);
  await expect(h.writer.simulate(prepared)).rejects.toMatchObject({ code: "IdentityMismatch" });
  expect(h.sends).toBe(0);
});
test.for(["age", "epoch", "cursor", "amount", "owner", "disposition"] as const)(
  "%s change rejects rebase submission without a wallet send",
  async (kind) => {
    const h = harness();
    if (kind === "disposition") {
      const timed = rebaseFixture("active");
      h.update({
        ...timed,
        escrow: {
          ...timed.escrow,
          locks: timed.escrow.locks.map((lock) => ({ ...lock, end: timed.escrow.timestamp + 1n })),
        },
      });
    }
    const prepared = await h.writer.prepare(input()),
      simulated = await h.writer.simulate(prepared),
      state = h.state;
    if (kind === "age")
      h.update({
        ...state,
        escrow: {
          ...state.escrow,
          coordinate: {
            ...state.escrow.coordinate,
            blockNumber: state.escrow.coordinate.blockNumber + 3n,
          },
        },
      });
    if (kind === "epoch")
      h.update({ ...state, escrow: { ...state.escrow, timestamp: state.escrow.timestamp + week } });
    if (kind === "cursor")
      h.update({ ...state, timeCursor: 2n * week, periods: state.periods.slice(1) });
    if (kind === "amount")
      h.update({ ...state, periods: state.periods.map((row) => ({ ...row, allocated: 1n })) });
    if (kind === "owner")
      h.update({
        ...state,
        escrow: {
          ...state.escrow,
          locks: state.escrow.locks.map((lock) => ({ ...lock, owner: state.minter.address })),
        },
      });
    if (kind === "disposition")
      h.update({ ...state, escrow: { ...state.escrow, timestamp: state.escrow.timestamp + 1n } });
    await expect(h.writer.submit(prepared, simulated)).rejects.toThrow();
    expect(h.sends).toBe(0);
  },
);
test("rebase reconciliation rejects forged persisted calldata before provider access", async () => {
  const h = harness(),
    prepared = await h.writer.prepare(input()),
    record = await h.writer.submit(prepared, await h.writer.simulate(prepared));
  await expect(
    h.writer.reconcile(prepared, { ...record, call: { ...record.call, data: "0x" } }),
  ).rejects.toMatchObject({ code: "ReconciliationMismatch" });
});
