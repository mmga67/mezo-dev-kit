import { resolveEvent, resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { calculateVotingEpoch } from "./math.ts";
import { forecastVoting } from "./voting-forecast.ts";
import type { VotingAction, VotingForecast } from "./voting-forecast.ts";
import type { VotingSnapshot } from "./voting-types.ts";
const codec = createAbiCodec();
/** Conservative adjacent-block reconciliation; unrelated changes to touched state fail closed. */
export function verifyVotingSettlement(input: {
  readonly before: VotingSnapshot;
  readonly after: VotingSnapshot;
  readonly receipt: ExecutionReceipt;
  readonly action: VotingAction;
  readonly gasFee: bigint;
}): Readonly<VotingForecast> {
  const { before, after, receipt, action, gasFee } = input,
    timestamp = after.escrow.timestamp;
  const requireMatch = (condition: unknown, message: string) => {
    incentiveRequire(condition, "ReconciliationMismatch", message);
  };
  requireMatch(
    after.escrow.coordinate.blockNumber === receipt.blockNumber &&
      before.escrow.coordinate.blockNumber + 1n === receipt.blockNumber &&
      after.escrow.coordinate.blockHash === receipt.blockHash &&
      before.escrow.coordinate.chainId === after.escrow.coordinate.chainId &&
      before.escrow.coordinate.networkId === after.escrow.coordinate.networkId &&
      before.contract.address === after.contract.address &&
      before.contract.contractId === after.contract.contractId &&
      before.domain === after.domain &&
      before.tokenId === after.tokenId &&
      before.escrow.account === after.escrow.account &&
      before.escrow.contract.address === after.escrow.contract.address &&
      before.forwarder === after.forwarder &&
      before.escrow.underlying === after.escrow.underlying,
    "voting settlement identity differs",
  );
  const forecast = forecastVoting({ snapshot: before, action, atTimestamp: timestamp });
  const checkpointIncrement = (previous: bigint | null) =>
    previous !== null &&
    calculateVotingEpoch(previous).start === calculateVotingEpoch(timestamp).start
      ? 0n
      : 1n;
  requireMatch(
    after.usedWeight === forecast.usedWeight &&
      after.totalWeight === before.totalWeight - before.usedWeight + forecast.usedWeight &&
      after.lastVoted === forecast.lastVoted &&
      after.previousTargets.length === forecast.targets.length &&
      after.previousTargets.every((target, i) => target === forecast.targets[i]),
    "voting aggregate settlement differs",
  );
  const logs = getReceiptLogs(receipt, after.contract.address);
  for (const [name, expectedTargets] of [
    ["Abstained", before.previousTargets],
    ["Voted", forecast.targets],
  ] as const) {
    const abi = resolveEvent({
      contractId: after.contract.contractId,
      networkId: after.escrow.coordinate.networkId,
      blockNumber: receipt.blockNumber,
      eventName: name,
    });
    const rows = logs.map((log) => codec.decodeEvent(abi, log)).filter((row) => row !== null);
    requireMatch(rows.length === expectedTargets.length, "voting event coverage differs");
    expectedTargets.forEach((target, i) => {
      const old = before.targets.find((row) => row.target === target),
        row = rows[i];
      incentiveRequire(
        old !== undefined,
        "ReconciliationMismatch",
        "missing previous voting target",
      );
      const amount = name === "Abstained" ? old.vote : forecast.allocations[i];
      requireMatch(
        amount !== undefined &&
          row?.[0] === after.escrow.account &&
          row[1] === target &&
          row[2] === after.tokenId &&
          row[3] === amount &&
          row[4] === old.weight - old.vote + (name === "Voted" ? amount : 0n) &&
          row[5] === timestamp,
        "voting event amounts or recipient differ",
      );
    });
  }
  for (const target of new Set([...before.previousTargets, ...forecast.targets])) {
    const old = before.targets.find((row) => row.target === target),
      current = after.targets.find((row) => row.target === target);
    incentiveRequire(
      old !== undefined && current !== undefined,
      "ReconciliationMismatch",
      "touched target missing after vote",
    );
    const next = forecast.allocations[forecast.targets.indexOf(target)] ?? 0n;
    requireMatch(
      old.gauge === current.gauge &&
        current.vote === next &&
        current.weight === old.weight - old.vote + next &&
        current.rewards.length === old.rewards.length,
      "voting target settlement differs",
    );
    for (const reward of old.rewards) {
      const settled = current.rewards.find((row) => row.role === reward.role);
      requireMatch(
        settled?.address === reward.address &&
          settled.balance === next &&
          settled.totalSupply === reward.totalSupply - old.vote + next &&
          settled.checkpointTimestamp === timestamp &&
          settled.supplyCheckpointTimestamp === timestamp &&
          settled.numCheckpoints ===
            reward.numCheckpoints + checkpointIncrement(reward.checkpointTimestamp) &&
          settled.supplyNumCheckpoints ===
            reward.supplyNumCheckpoints + checkpointIncrement(reward.supplyCheckpointTimestamp),
        "voting reward checkpoints differ",
      );
      const template = resolveVotingRewardInterface({
        networkId: after.escrow.coordinate.networkId,
        role: reward.role,
      });
      const rewardLogs = getReceiptLogs(receipt, reward.address);
      for (const [name, amount] of [
        ["Withdraw", old.vote],
        ["Deposit", next],
      ] as const) {
        const abi = template.abi.find((row) => row.type === "event" && row.name === name);
        incentiveRequire(abi !== undefined, "IdentityMismatch", "reward event unavailable");
        const rows = rewardLogs
          .map((log) => codec.decodeEvent(abi, log))
          .filter((row) => row !== null);
        requireMatch(
          amount === 0n
            ? rows.length === 0
            : rows.length === 1 &&
                rows[0]?.[0] === after.contract.address &&
                rows[0][1] === after.tokenId &&
                rows[0][2] === amount,
          "voting reward deposit or withdrawal differs",
        );
      }
    }
  }
  const previous = before.escrow.locks.find((row) => row.tokenId === before.tokenId),
    current = after.escrow.locks.find((row) => row.tokenId === after.tokenId);
  incentiveRequire(
    previous !== undefined && current !== undefined,
    "ReconciliationMismatch",
    "voting escrow position unavailable",
  );
  const voters = previous.voters.filter((address) => address !== before.contract.address);
  if (forecast.usedWeight > 0n) voters.push(after.contract.address);
  requireMatch(
    current.owner === previous.owner &&
      current.amount === previous.amount &&
      current.end === previous.end &&
      current.permanent === previous.permanent &&
      current.storedBoost === previous.storedBoost &&
      current.kind === previous.kind &&
      current.delegatee === previous.delegatee &&
      current.managedTokenId === previous.managedTokenId &&
      current.voters.length === voters.length &&
      current.voters.every((address) => voters.includes(address)) &&
      current.voted === voters.length > 0 &&
      after.escrow.supply === before.escrow.supply &&
      after.escrow.escrowTokenBalance === before.escrow.escrowTokenBalance &&
      after.escrow.token.balance ===
        before.escrow.token.balance - (before.escrow.role === "vebtc-current" ? gasFee : 0n) &&
      after.escrow.nativeBalance === before.escrow.nativeBalance - gasFee,
    "voting escrow state or gas balance differs",
  );
  return forecast;
}
