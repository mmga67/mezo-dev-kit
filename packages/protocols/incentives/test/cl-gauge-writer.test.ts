import { expect, test } from "vitest";
import { resolveOperation } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionClient, SimulationVerifier } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { createCLGaugeWriter } from "../src/index.ts";
import type { CLGaugeState } from "../src/index.ts";
import { clGaugeFixture } from "./cl-gauge-fixture.ts";
import { account } from "./lock-fixture.ts";
function harness() {
  let state = clGaugeFixture(),
    sends = 0,
    verifier: SimulationVerifier | undefined,
    output: `0x${string}` = "0x";
  const encodedOutput = () => output;
  const execution: ExecutionClient = {
    async simulate(prepared, verify) {
      verifier = verify;
      const call = { ...prepared, chainId: prepared.coordinate.chainId, nonce: 0n };
      await verify?.(encodedOutput(), state.pool.coordinate, call);
      return { prepared, call, returnData: encodedOutput() };
    },
    async submit(simulated, revalidate) {
      await revalidate(simulated.prepared);
      await verifier?.(encodedOutput(), state.pool.coordinate, simulated.call);
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
        ...(simulated.prepared.targetRole === undefined
          ? {}
          : { targetRole: simulated.prepared.targetRole }),
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
    writer: createCLGaugeWriter({
      reader: { read: async () => structuredClone(state) },
      execution,
      transport,
    }),
    update(value: CLGaugeState) {
      state = value;
    },
    setOutput(value: `0x${string}`) {
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
    operationId: "cl-gauge-intent",
    account,
    tokenId: 1n,
    action: "claim-reward" as const,
    bounds: { minReward: 32n, minFee0: 0n, minFee1: 0n, maxBlockAge: 2n },
  };
}
test("CL wallet claims encode only the uint256 overload and freeze their payout policy", async () => {
  const h = harness(),
    original = input(),
    prepared = await h.writer.prepare(original);
  original.bounds.minReward = 999n;
  expect(prepared.bounds.minReward).toBe(32n);
  const abi = resolveOperation({
    ...prepared.snapshot.pool.coordinate,
    contractId: prepared.snapshot.contract.contractId,
    functionName: "getReward",
    inputTypes: ["uint256"],
  }).functionAbi;
  expect(prepared.transaction.data).toBe(createAbiCodec().encodeFunction(abi, [1n]));
  expect(prepared.transaction.to).toBe(prepared.snapshot.gauge);
  expect(prepared.transaction.targetRole).toBe("cl-gauge");
  expect(prepared.transaction.value).toBe(0n);
  await h.writer.submit(prepared, await h.writer.simulate(prepared));
  expect(h.sends).toBe(1);
});
test("foreign preparations/simulations and non-void CL results cannot be sent", async () => {
  const h = harness(),
    other = harness(),
    prepared = await h.writer.prepare(input());
  await expect(other.writer.simulate(prepared)).rejects.toMatchObject({ code: "InvalidInput" });
  const foreign = await other.writer.prepare(input());
  await expect(
    h.writer.submit(prepared, await other.writer.simulate(foreign)),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  h.setOutput(`0x${"00".repeat(32)}`);
  await expect(h.writer.simulate(prepared)).rejects.toMatchObject({ code: "IdentityMismatch" });
  expect(h.sends).toBe(0);
});
test.for(["age", "ownership", "reward", "gauge"] as const)(
  "CL %s change prevents a wallet send",
  async (kind) => {
    const h = harness(),
      prepared = await h.writer.prepare(input()),
      simulated = await h.writer.simulate(prepared),
      s = h.state;
    if (kind === "age")
      h.update({
        ...s,
        pool: {
          ...s.pool,
          coordinate: { ...s.pool.coordinate, blockNumber: s.pool.coordinate.blockNumber + 3n },
        },
      });
    if (kind === "ownership")
      h.update({ ...s, position: { ...s.position, beneficialDepositor: null } });
    if (kind === "reward") h.update({ ...s, rewards: { ...s.rewards, stored: 6n } });
    if (kind === "gauge") h.update({ ...s, gauge: s.pool.manager.address });
    await expect(h.writer.submit(prepared, simulated)).rejects.toThrow();
    expect(h.sends).toBe(0);
  },
);
test("CL stake needs confirmed NFT approval; approval targets one NFT rather than all positions", async () => {
  const h = harness();
  h.update(clGaugeFixture(false));
  const original = {
    ...input(),
    action: "stake" as const,
    bounds: { ...input().bounds, minReward: 0n, minFee0: 1n, minFee1: 1n },
  };
  const stake = await h.writer.prepare(original);
  expect(stake.approvalRequired).toBe(true);
  await expect(h.writer.simulate(stake)).rejects.toMatchObject({ code: "ApprovalRequired" });
  const approve = await h.writer.prepare({
    ...original,
    action: "approve",
    bounds: { ...original.bounds, minFee0: 0n, minFee1: 0n },
  });
  const abi = resolveOperation({
    ...h.state.pool.coordinate,
    contractId: h.state.pool.manager.contractId,
    functionName: "approve",
    inputTypes: ["address", "uint256"],
  }).functionAbi;
  expect(approve.transaction.data).toBe(createAbiCodec().encodeFunction(abi, [h.state.gauge, 1n]));
  expect(approve.transaction.to).toBe(h.state.pool.manager.address);
  expect(approve.transaction.targetRole).toBeUndefined();
  await h.writer.submit(approve, await h.writer.simulate(approve));
  expect(h.sends).toBe(1);
});
test("CL recovery rejects forged calls and target roles before receipt work", async () => {
  const h = harness(),
    prepared = await h.writer.prepare(input()),
    record = await h.writer.submit(prepared, await h.writer.simulate(prepared));
  for (const wrong of [
    { ...record, call: { ...record.call, data: "0x" } },
    { ...record, targetRole: "other-gauge" },
  ])
    await expect(h.writer.reconcile(prepared, wrong)).rejects.toMatchObject({
      code: "ReconciliationMismatch",
    });
});
