import assert from "node:assert/strict";
import {
  createContractRegistry,
  resolveEvent,
  resolveVotingRewardInterface,
} from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, VotingDomain } from "@mezo-dev-kit/contracts";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { keccak256, toRpcQuantity } from "@mezo-dev-kit/evm";
import type { VotingSnapshot, VotingAction } from "../src/index.ts";
import { calculateVotingEpoch } from "../src/index.ts";
import { lockFixture, week } from "./lock-fixture.ts";
export const target = `0x${"33".repeat(20)}` as const,
  target2 = `0x${"44".repeat(20)}` as const;
export function votingFixture(domain: VotingDomain = "pools"): VotingSnapshot {
  const escrow = lockFixture(),
    timestamp = 3n * week + 3601n;
  const registry = createContractRegistry();
  const resolve = (
    contractId:
      | "incentives.pools-voter"
      | "incentives.boost-voter"
      | "incentives.validators-voter"
      | "incentives.ve-mezo",
  ) => registry.resolve({ ...escrow.coordinate, contractId });
  const contract = resolve(
    domain === "pools"
      ? "incentives.pools-voter"
      : domain === "boost"
        ? "incentives.boost-voter"
        : "incentives.validators-voter",
  );
  const lock = escrow.locks[0];
  assert(lock);
  return {
    domain,
    contract,
    tokenId: 1n,
    forwarder: `0x${"88".repeat(20)}`,
    totalWeight: 40n,
    usedWeight: 10n,
    lastVoted: 2n * week + 4000n,
    maxVotingNum: 16n,
    whitelisted: false,
    deactivated: false,
    voterAuthorized: true,
    previousTargets: [target],
    escrow: {
      ...escrow,
      timestamp,
      epoch: calculateVotingEpoch(timestamp),
      role: domain === "boost" ? "vemezo-current" : "vebtc-current",
      contract: domain === "boost" ? resolve("incentives.ve-mezo") : escrow.contract,
      locks: [
        {
          ...lock,
          amount: 101n,
          permanent: true,
          end: 0n,
          voted: true,
          voters: [contract.address],
          currentVotingPower: 101n,
          atTimeVotingPower: 101n,
        },
      ],
    },
    targets: [target, target2].map((address, i) => ({
      target: address,
      gauge: address,
      registered: true,
      alive: true,
      weight: i === 0 ? 30n : 10n,
      vote: i === 0 ? 10n : 0n,
      rewards: (domain === "pools" ? (["fees", "bribe"] as const) : (["bribe"] as const)).map(
        (role, j) => ({
          role,
          address: `0x${(51 + i * 2 + j).toString(16).repeat(20)}` as const,
          balance: i === 0 ? 10n : 0n,
          totalSupply: i === 0 ? 30n : 10n,
          numCheckpoints: 1n,
          supplyNumCheckpoints: 1n,
          checkpointTimestamp: 3n * week + 1n,
          supplyCheckpointTimestamp: 3n * week + 1n,
        }),
      ),
    })),
  };
}
/** Static event encoding from the canonical ABI; only address/uint inputs in this fixture. */
export function fixtureLog(
  abi: ContractAbiEntry,
  address: `0x${string}`,
  args: readonly (bigint | `0x${string}`)[],
  receipt: ExecutionReceipt,
  index: number,
): Readonly<Record<string, unknown>> {
  assert(Array.isArray(abi.inputs));
  const parameters = abi.inputs.map((input: unknown) => {
    assert(input && typeof input === "object" && !Array.isArray(input));
    const row = input as Record<string, unknown>;
    assert(row.type === "address" || row.type === "uint256");
    return { type: row.type, indexed: row.indexed === true };
  });
  assert(typeof abi.name === "string");
  const signature = `${abi.name}(${parameters.map((row) => row.type).join(",")})`;
  const topics: string[] = [keccak256(`0x${Buffer.from(signature).toString("hex")}`)];
  let data = "0x";
  parameters.forEach((row, i) => {
    const value = args[i];
    assert(value !== undefined);
    const word = (typeof value === "bigint" ? value.toString(16) : value.slice(2)).padStart(
      64,
      "0",
    );
    if (row.indexed === true) topics.push(`0x${word}`);
    else data += word;
  });
  return {
    address,
    topics,
    data,
    removed: false,
    blockNumber: toRpcQuantity(receipt.blockNumber),
    blockHash: receipt.blockHash,
    transactionHash: receipt.transactionHash,
    logIndex: toRpcQuantity(BigInt(index)),
  };
}
export function votingSettlement(domain: VotingDomain = "pools"): {
  before: VotingSnapshot;
  after: VotingSnapshot;
  receipt: ExecutionReceipt;
  gasFee: bigint;
  action: VotingAction;
} {
  const before = votingFixture(domain),
    timestamp = before.escrow.timestamp + 1n;
  const after: VotingSnapshot = {
    ...before,
    totalWeight: 131n,
    usedWeight: 101n,
    lastVoted: timestamp,
    escrow: {
      ...before.escrow,
      timestamp,
      coordinate: {
        ...before.escrow.coordinate,
        blockNumber: before.escrow.coordinate.blockNumber + 1n,
      },
    },
    targets: before.targets.map((row, i) =>
      i === 1
        ? row
        : {
            ...row,
            vote: 101n,
            weight: 121n,
            rewards: row.rewards.map((reward) => ({
              ...reward,
              balance: 101n,
              totalSupply: 121n,
              checkpointTimestamp: timestamp,
              supplyCheckpointTimestamp: timestamp,
            })),
          },
    ),
  };
  let receipt: ExecutionReceipt = {
    blockNumber: after.escrow.coordinate.blockNumber,
    blockHash: after.escrow.coordinate.blockHash,
    transactionHash: `0x${"cd".repeat(32)}`,
    logs: [],
  };
  const logs: unknown[] = [];
  function voter(name: string, amount: bigint, weight: bigint) {
    logs.push(
      fixtureLog(
        resolveEvent({
          contractId: before.contract.contractId,
          ...after.escrow.coordinate,
          eventName: name,
        }),
        before.contract.address,
        [before.escrow.account, target, 1n, amount, weight, timestamp],
        receipt,
        logs.length,
      ),
    );
  }
  function rewardEvents(name: string, amount: bigint) {
    for (const reward of before.targets[0]?.rewards ?? []) {
      const abi = resolveVotingRewardInterface({
        networkId: "mezo-mainnet",
        role: reward.role,
      }).abi.find((row) => row.type === "event" && row.name === name);
      assert(abi);
      logs.push(
        fixtureLog(
          abi,
          reward.address,
          [before.contract.address, 1n, amount],
          receipt,
          logs.length,
        ),
      );
    }
  }
  rewardEvents("Withdraw", 10n);
  voter("Abstained", 10n, 20n);
  rewardEvents("Deposit", 101n);
  voter("Voted", 101n, 121n);
  receipt = { ...receipt, logs };
  return {
    before,
    after,
    receipt,
    gasFee: 0n,
    action: { kind: "vote", targets: [target], relativeWeights: [1n] } as const,
  };
}
