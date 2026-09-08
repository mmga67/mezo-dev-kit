import { expect, test } from "vitest";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcSigner,
  createRpcTransport,
} from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { createGaugeReader, createGaugeTargetResolver, createGaugeWriter } from "../src/index.ts";
import type { GaugeSnapshot } from "../src/index.ts";

const account = `0x${"11".repeat(20)}` as const,
  gauge = `0x${"22".repeat(20)}` as const,
  hash = `0x${"ab".repeat(32)}` as const;
function fixture() {
  const network = getNetwork("mezo-mainnet"),
    registry = createContractRegistry(),
    blockNumber = 11703359n;
  const root = registry.resolve({
    contractId: "musd.savings-rate",
    networkId: network.id,
    blockNumber,
  });
  const coordinate = {
    networkId: network.id,
    chainId: network.evmChainId,
    blockNumber,
    blockHash: hash,
  };
  let state: GaugeSnapshot = {
    coordinate,
    timestamp: 1n,
    role: "savings-gauge",
    anchorContractId: root.contractId,
    account,
    gauge,
    stakingToken: root.address,
    rewardToken: `0x${"33".repeat(20)}`,
    voter: `0x${"44".repeat(20)}`,
    alive: true,
    stake: 20n,
    totalStake: 30n,
    custody: 35n,
    earned: 10n,
    rewardDecimals: 18,
    rewardRate: 1n,
    periodFinish: 100n,
    token: {
      target: { contractId: root.contractId, address: root.address },
      account,
      spender: gauge,
      coordinate,
      balance: 100n,
      allowance: 0n,
      decimals: 18n,
    },
  };
  let sends = 0;
  const request: RpcRequest = async ({ method }) => {
    if (method === "eth_chainId") return "0x7b7c";
    if (method === "eth_accounts") return [account];
    if (method === "eth_blockNumber") return `0x${blockNumber.toString(16)}`;
    if (method === "eth_getBlockByNumber")
      return { number: `0x${blockNumber.toString(16)}`, hash, timestamp: "0x1" };
    if (method === "eth_getTransactionCount") return "0x0";
    if (method === "eth_call" || method === "eth_getCode") return "0x";
    if (method === "eth_sendTransaction") sends++;
    throw new Error(`unexpected ${method}`);
  };
  const transport = createRpcTransport({ id: "unit", request });
  const reader = { read: async () => structuredClone(state) };
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer: createRpcSigner({ account, request }),
    store: createMemorySubmissionStore(),
    confirmations: 1n,
    maxBlockAge: 10n,
    resolveTarget: createGaugeTargetResolver({ reader, account }),
  });
  return {
    writer: createGaugeWriter({ reader, execution }),
    transport,
    registry,
    update: (update: Partial<GaugeSnapshot>) => {
      state = { ...state, ...update };
    },
    get state() {
      return state;
    },
    get sends() {
      return sends;
    },
  };
}
const base = { operationId: "unit-stake", account, bounds: { maxBlockAge: 10n, minReward: 0n } };
test("a dead gauge rejects new stake while retaining the user's exit", async () => {
  const f = fixture();
  f.update({ alive: false });
  await expect(
    f.writer.prepare({ ...base, action: { kind: "stake", amount: 10n } }),
  ).rejects.toMatchObject({ code: "UnavailableState" });
  const exit = await f.writer.prepare({ ...base, action: { kind: "unstake", amount: 20n } });
  expect(exit.approval.kind).toBe("sufficient");
  await expect(
    f.writer.prepare({ ...base, action: { kind: "unstake", amount: 21n } }),
  ).rejects.toMatchObject({ code: "InsufficientBalance" });
});
test("approval is explicit and a stale allowance cannot reach the wallet", async () => {
  const f = fixture();
  const prepared = await f.writer.prepare({ ...base, action: { kind: "stake", amount: 10n } });
  expect(prepared.approval).toMatchObject({ kind: "approve", amount: 10n });
  await expect(f.writer.simulate(prepared)).rejects.toMatchObject({ code: "ApprovalRequired" });
  f.update({ token: { ...f.state.token, allowance: 10n } });
  const approved = await f.writer.prepare({ ...base, action: { kind: "stake", amount: 10n } });
  const simulation = await f.writer.simulate(approved);
  f.update({ token: { ...f.state.token, allowance: 0n } });
  await expect(f.writer.submit(approved, simulation)).rejects.toMatchObject({
    code: "ApprovalRequired",
  });
  expect(f.sends).toBe(0);
});
test("claim bounds concern rewards and never count principal or custody donations", async () => {
  const f = fixture();
  await expect(
    f.writer.prepare({
      ...base,
      bounds: { ...base.bounds, minReward: 11n },
      action: { kind: "claim-reward" },
    }),
  ).rejects.toMatchObject({ code: "InsufficientBalance" });
  const prepared = await f.writer.prepare({ ...base, action: { kind: "claim-reward" } });
  expect(prepared.transaction.data.slice(0, 10)).toBe("0xc00007b0");
  expect(prepared.approval.kind).toBe("sufficient");
  await expect(f.writer.simulate({ ...prepared })).rejects.toMatchObject({ code: "InvalidInput" });
});
test("the real gauge reader rejects unrecognized root runtime before role calls", async () => {
  const f = fixture();
  const reader = createGaugeReader({
    networkId: "mezo-mainnet",
    role: "savings-gauge",
    registry: f.registry,
    transport: f.transport,
  });
  await expect(reader.read({ account })).rejects.toThrow("runtime differs");
});
