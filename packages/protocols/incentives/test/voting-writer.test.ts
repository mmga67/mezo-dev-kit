import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { resolveOperation } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionClient, SimulationVerifier, SubmissionRecord } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { createVotingWriter } from "../src/index.ts";
import type { VotingSnapshot } from "../src/index.ts";
import { target, votingFixture } from "./voting-fixture.ts";
import { account, week } from "./lock-fixture.ts";
function harness() {
  let state = votingFixture(),
    sends = 0,
    verifier: SimulationVerifier | undefined;
  const execution: ExecutionClient = {
    async simulate(prepared, verify) {
      verifier = verify;
      const call = { ...prepared, chainId: prepared.coordinate.chainId, nonce: 0n };
      await verify?.("0x", state.escrow.coordinate, call);
      return { prepared, call, returnData: "0x" };
    },
    async submit(simulated, revalidate) {
      await revalidate(simulated.prepared);
      await verifier?.("0x", state.escrow.coordinate, simulated.call);
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
      throw new Error("unused hash inspection");
    },
    async reconcile() {
      throw new Error("unexpected reconciliation");
    },
  };
  const reader = { read: async () => structuredClone(state) };
  const transport = createRpcTransport({
    id: "unreachable",
    request: async () => {
      throw new Error("unexpected provider access");
    },
  });
  return {
    writer: createVotingWriter({ reader, execution, transport }),
    update(value: VotingSnapshot) {
      state = value;
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
    operationId: "vote-intent",
    account,
    tokenId: 1n,
    action: { kind: "vote" as const, targets: [target], relativeWeights: [1n] },
    bounds: { minAllocations: [100n], maxBlockAge: 2n },
  };
}
test("prepared voting owns immutable allocation inputs and encodes the exact canonical call", async () => {
  const h = harness(),
    original = input(),
    prepared = await h.writer.prepare(original);
  original.action.relativeWeights[0] = 900n;
  original.bounds.minAllocations[0] = 900n;
  expect(Object.isFrozen(prepared.action.kind === "vote" ? prepared.action.targets : [])).toBe(
    true,
  );
  expect(Object.isFrozen(prepared.bounds.minAllocations)).toBe(true);
  const abi = resolveOperation({
    ...prepared.snapshot.escrow.coordinate,
    contractId: prepared.snapshot.contract.contractId,
    functionName: "vote",
  }).functionAbi;
  expect(prepared.transaction.data).toBe(
    createAbiCodec().encodeFunction(abi, [1n, [target], [1n]]),
  );
  expect((await h.writer.submit(prepared, await h.writer.simulate(prepared))).operationId).toBe(
    "vote-intent",
  );
  expect(h.sends).toBe(1);
});
test("prepared objects and simulations cannot cross writer ownership", async () => {
  const h = harness(),
    other = harness(),
    prepared = await h.writer.prepare(input());
  await expect(other.writer.simulate(prepared)).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(h.writer.simulate(structuredClone(prepared))).rejects.toMatchObject({
    code: "InvalidInput",
  });
  const otherPrepared = await other.writer.prepare(input());
  await expect(
    h.writer.submit(prepared, await other.writer.simulate(otherPrepared)),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(h.sends + other.sends).toBe(0);
});
test.for(["stale", "epoch", "power", "owner", "target"] as const)(
  "%s change rejects before wallet submission",
  async (kind) => {
    const h = harness(),
      prepared = await h.writer.prepare(input()),
      simulated = await h.writer.simulate(prepared),
      state = h.state;
    if (kind === "stale")
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
      h.update({
        ...state,
        escrow: {
          ...state.escrow,
          timestamp: state.escrow.timestamp + week,
          epoch: { ...state.escrow.epoch, start: state.escrow.epoch.start + week },
        },
      });
    if (kind === "power")
      h.update({
        ...state,
        escrow: {
          ...state.escrow,
          locks: state.escrow.locks.map((row) => ({ ...row, currentVotingPower: 99n })),
        },
      });
    if (kind === "owner")
      h.update({
        ...state,
        escrow: {
          ...state.escrow,
          locks: state.escrow.locks.map((row) => ({ ...row, owner: target })),
        },
      });
    if (kind === "target")
      h.update({ ...state, targets: state.targets.map((row) => ({ ...row, alive: false })) });
    await expect(h.writer.submit(prepared, simulated)).rejects.toThrow();
    expect(h.sends).toBe(0);
  },
);
test("reconciliation checks persisted calldata and minimum array shape before provider access", async () => {
  const h = harness(),
    prepared = await h.writer.prepare(input());
  const record: SubmissionRecord = await h.writer.submit(
    prepared,
    await h.writer.simulate(prepared),
  );
  await expect(
    h.writer.reconcile(prepared, { ...record, call: { ...record.call, data: "0x" } }),
  ).rejects.toMatchObject({ code: "ReconciliationMismatch" });
  assert(prepared.action.kind === "vote");
  await expect(
    h.writer.reconcile({ ...prepared, bounds: { ...prepared.bounds, minAllocations: [] } }, record),
  ).rejects.toMatchObject({ code: "InvalidInput" });
});
