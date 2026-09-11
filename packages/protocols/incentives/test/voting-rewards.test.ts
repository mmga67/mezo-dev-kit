import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { getTokenInterface, resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { createAbiCodec, keccak256, parseHexData, toRpcQuantity } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createVotingRewardReader } from "../src/index.ts";
import type { VotingRewardSnapshot } from "../src/index.ts";
import { verifyVotingRewardSettlement } from "../src/voting-reward-settlement.ts";
import { INCENTIVES_MODEL } from "../src/model.generated.ts";
import { fixtureLog, target, votingFixture } from "./voting-fixture.ts";
import { account, week } from "./lock-fixture.ts";
const token = `0x${"99".repeat(20)}` as const,
  codec = createAbiCodec();
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function selector(entry: ContractAbiEntry) {
  assert(typeof entry.name === "string" && Array.isArray(entry.inputs));
  return keccak256(
    `0x${Buffer.from(
      `${entry.name}(${entry.inputs
        .map((row: unknown) => {
          const value = object(row).type;
          assert(typeof value === "string");
          return value;
        })
        .join(",")})`,
    ).toString("hex")}`,
  ).slice(0, 10);
}
function output(entry: ContractAbiEntry, values: readonly AbiValue[]) {
  return `0x${codec.encodeFunction({ ...entry, inputs: entry.outputs, outputs: [] }, values).slice(10)}`;
}
function readerFixture(options: { history?: bigint; earned?: bigint; supply?: bigint } = {}) {
  const voting = votingFixture(),
    template = resolveVotingRewardInterface({ networkId: "mezo-mainnet", role: "bribe" }),
    reward = voting.targets[0]?.rewards.find((row) => row.role === "bribe");
  assert(reward);
  const methods: string[] = [];
  const transport = createRpcTransport({
    id: "reward-fixture",
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return toRpcQuantity(voting.escrow.coordinate.chainId);
      if (method === "eth_getBlockByNumber")
        return {
          number: toRpcQuantity(voting.escrow.coordinate.blockNumber),
          hash: voting.escrow.coordinate.blockHash,
          timestamp: toRpcQuantity(voting.escrow.timestamp),
        };
      assert.equal(method, "eth_call");
      const request = object(params[0]),
        calldata = parseHexData(request.data);
      const entries = request.to === token ? getTokenInterface() : template.abi;
      const entry = entries.find(
        (row) => row.type === "function" && selector(row) === calldata.slice(0, 10),
      );
      assert(entry && typeof entry.name === "string");
      methods.push(entry.name);
      const args = codec.decodeFunction(
        { ...entry, outputs: entry.inputs },
        `0x${calldata.slice(10)}`,
      );
      const timestamp = (3n - (options.history ?? 1n)) * week + 1n;
      const responses: Record<string, readonly AbiValue[]> = {
        duration: [week],
        isReward: [true],
        lastEarn: [0n],
        getPriorBalanceIndex: [0n],
        getPriorSupplyIndex: [0n],
        checkpoints: [timestamp, 1n],
        supplyCheckpoints: [timestamp, options.supply ?? 3n],
        tokenRewardsPerEpoch: [10n],
        earned: [options.earned ?? 3n],
        decimals: [18n],
        allowance: [0n],
        balanceOf: [args[0] === account ? 20n : 100n],
      };
      const result = responses[entry.name];
      assert(result, entry.name);
      return output(entry, result);
    },
  });
  const reader = createVotingRewardReader({
    voting: { read: async () => voting },
    transport,
    maxEpochs: 1,
  });
  return {
    reader,
    methods,
    input: { account, tokenId: 1n, target, role: "bribe" as const, tokens: [token] },
  };
}
test("reward reader reproduces historical integer floors and anchors token balances", async () => {
  const f = readerFixture();
  expect((await f.reader.read(f.input)).tokens).toEqual([
    {
      token,
      decimals: 18n,
      walletBalance: 20n,
      custody: 100n,
      lastEarn: 0n,
      firstClaimEpoch: 2n * week,
      epochs: 1n,
      earned: 3n,
    },
  ]);
});
test("epoch budget rejects before the contract's potentially long earned loop", async () => {
  const f = readerFixture({ history: 2n });
  await expect(f.reader.read(f.input)).rejects.toMatchObject({ code: "LimitExceeded" });
  expect(f.methods).not.toContain("earned");
});
test("reward reader rejects mismatching contract earnings and impossible checkpoint supply", async () => {
  for (const options of [{ earned: 4n }, { supply: 0n }]) {
    const f = readerFixture(options);
    await expect(f.reader.read(f.input)).rejects.toMatchObject({ code: "IdentityMismatch" });
  }
});
test("reward input budgets reject before provider I/O", async () => {
  const f = readerFixture();
  for (const tokens of [[], [token, token], Array.from({ length: 9 }, () => token)])
    await expect(f.reader.read({ ...f.input, tokens })).rejects.toThrow();
  expect(f.methods).toEqual([]);
});
function settlement(
  amount: bigint,
  role: "fees" | "bribe" = "bribe",
  rewardToken: `0x${string}` = token,
) {
  const voting = votingFixture(),
    reward = voting.targets[0]?.rewards.find((row) => row.role === role);
  assert(reward);
  const before: VotingRewardSnapshot = {
    voting,
    target,
    reward,
    tokens: [
      {
        token: rewardToken,
        decimals: 18n,
        walletBalance: 20n,
        custody: 100n,
        lastEarn: 0n,
        firstClaimEpoch: 2n * week,
        epochs: 1n,
        earned: amount,
      },
    ],
  };
  const after: VotingRewardSnapshot = {
    ...before,
    voting: {
      ...voting,
      escrow: {
        ...voting.escrow,
        timestamp: voting.escrow.timestamp + 1n,
        coordinate: {
          ...voting.escrow.coordinate,
          blockNumber: voting.escrow.coordinate.blockNumber + 1n,
        },
      },
    },
    tokens: before.tokens.map((row) => ({
      ...row,
      lastEarn: voting.escrow.timestamp + 1n,
      earned: 0n,
      walletBalance: row.walletBalance + amount,
      custody: row.custody - amount,
    })),
  };
  let receipt: ExecutionReceipt = {
    blockNumber: after.voting.escrow.coordinate.blockNumber,
    blockHash: after.voting.escrow.coordinate.blockHash,
    transactionHash: `0x${"cd".repeat(32)}`,
    logs: [],
  };
  const event = resolveVotingRewardInterface({ networkId: "mezo-mainnet", role }).abi.find(
      (row) => row.type === "event" && row.name === "ClaimRewards",
    ),
    transfer = getTokenInterface().find((row) => row.type === "event" && row.name === "Transfer");
  assert(event && transfer);
  const logs: unknown[] = [];
  if (amount > 0n)
    logs.push(
      fixtureLog(transfer, rewardToken, [reward.address, account, amount], receipt, logs.length),
    );
  logs.push(
    fixtureLog(event, reward.address, [account, rewardToken, amount], receipt, logs.length),
  );
  receipt = { ...receipt, logs };
  return { before, after, receipt, gasFee: 0n };
}
test("native BTC rewards and ERC-20 rewards account for gas in their own ledgers", () => {
  const profile = INCENTIVES_MODEL.escrows.find((row) => row.role === "vebtc-current");
  assert(profile);
  for (const rewardToken of [profile.underlying, token]) {
    const f = settlement(3n, "bribe", rewardToken),
      native = rewardToken === profile.underlying;
    const after = {
      ...f.after,
      voting: {
        ...f.after.voting,
        escrow: {
          ...f.after.voting.escrow,
          nativeBalance: f.before.voting.escrow.nativeBalance + (native ? 3n : 0n) - 5n,
        },
      },
      tokens: f.after.tokens.map((row) => ({
        ...row,
        walletBalance: row.walletBalance - (native ? 5n : 0n),
      })),
    };
    expect(verifyVotingRewardSettlement({ ...f, after, gasFee: 5n })).toEqual([3n]);
    expect(() =>
      verifyVotingRewardSettlement({
        ...f,
        after: {
          ...after,
          voting: {
            ...after.voting,
            escrow: {
              ...after.voting.escrow,
              nativeBalance: after.voting.escrow.nativeBalance + 1n,
            },
          },
        },
        gasFee: 5n,
      }),
    ).toThrow(expect.objectContaining({ code: "ReconciliationMismatch" }));
  }
});
test.for(["fees", "bribe"] as const)(
  "%s claims distinguish positive and zero payouts; both emit the owner claim event",
  (role) => {
    for (const amount of [0n, 3n])
      expect(verifyVotingRewardSettlement(settlement(amount, role))).toEqual([amount]);
  },
);
test("reward reconciliation rejects missing zero claim events and ambiguous balances or epochs", () => {
  const f = settlement(0n);
  expect(() => verifyVotingRewardSettlement({ ...f, receipt: { ...f.receipt, logs: [] } })).toThrow(
    expect.objectContaining({ code: "ReconciliationMismatch" }),
  );
  for (const after of [
    {
      ...f.after,
      tokens: f.after.tokens.map((row) => ({ ...row, walletBalance: row.walletBalance + 1n })),
    },
    {
      ...f.after,
      voting: {
        ...f.after.voting,
        escrow: {
          ...f.after.voting.escrow,
          epoch: { ...f.after.voting.escrow.epoch, start: 4n * week },
        },
      },
    },
    { ...f.after, reward: { ...f.after.reward, balance: 0n } },
  ])
    expect(() => verifyVotingRewardSettlement({ ...f, after })).toThrow(
      expect.objectContaining({ code: "ReconciliationMismatch" }),
    );
});
