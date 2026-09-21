import { parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { allocateVotingPower, calculateLockVotingPower, calculateVotingEpoch } from "./math.ts";
import type { VotingSnapshot } from "./voting-types.ts";
/**
 * A distinct reset or a vote with ordered targets and relative integer weights; empty votes are
 * not a reset.
 */
export type VotingAction =
  | Readonly<{ kind: "reset" }>
  | Readonly<{
      kind: "vote";
      targets: readonly `0x${string}`[];
      relativeWeights: readonly bigint[];
    }>;
/**
 * Ordered target allocations and power at the chosen time. Reset preserves lastVoted;
 * later-time power is an estimate.
 */
export interface VotingForecast {
  readonly targets: readonly `0x${string}`[];
  readonly allocations: readonly bigint[];
  readonly usedWeight: bigint;
  readonly votingPower: bigint;
  readonly lastVoted: bigint;
}
const zero = parseAddress(`0x${"0".repeat(40)}`);
function bounded(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 32;
}
/**
 * Forecast a vote or reset with explicit ownership, epoch and target eligibility.
 *
 * @remarks
 * Relative weights need no fixed sum; every allocated floor must remain positive.
 * At the snapshot timestamp, observed same-block power suppression is retained.
 * A later atTimestamp is an estimate, not fresh evidence. Reset preserves lastVoted
 * and follows its own window/liveness rules; it is not an empty vote.
 */
export function forecastVoting(input: {
  readonly snapshot: VotingSnapshot;
  readonly action: VotingAction;
  readonly atTimestamp?: bigint;
}): Readonly<VotingForecast> {
  const { snapshot, action } = input,
    escrow = snapshot.escrow,
    lock = escrow.locks.find((row) => row.tokenId === snapshot.tokenId),
    timestamp = parseUint(input.atTimestamp ?? escrow.timestamp),
    epoch = calculateVotingEpoch(timestamp);
  incentiveRequire(
    lock !== undefined &&
      timestamp >= escrow.timestamp &&
      lock.owner === escrow.account &&
      lock.callerApproved &&
      lock.amount > 0n &&
      lock.kind === "normal" &&
      lock.managedTokenId === 0n &&
      lock.delegatee === 0n &&
      lock.grantManager === zero &&
      lock.vestingEnd === 0n &&
      !snapshot.deactivated &&
      snapshot.voterAuthorized &&
      escrow.account !== snapshot.forwarder &&
      escrow.account !== escrow.forwarder &&
      escrow.account !== snapshot.contract.address,
    "IneligibleOperation",
    "ordinary self-owned NFT and authorized voter required",
  );
  incentiveRequire(
    timestamp > epoch.voteStart && epoch.start > snapshot.lastVoted,
    "IneligibleOperation",
    "new epoch strictly after vote start required",
  );
  const votingPower =
    timestamp === escrow.timestamp
      ? lock.currentVotingPower
      : calculateLockVotingPower({
          amount: lock.amount,
          boost: lock.storedBoost,
          end: lock.end,
          permanent: lock.permanent,
          maxLockSeconds: escrow.maxLockSeconds,
          timestamp,
        }).boosted;
  if (action.kind === "reset")
    return Object.freeze({
      targets: Object.freeze([]),
      allocations: Object.freeze([]),
      usedWeight: 0n,
      votingPower,
      lastVoted: snapshot.lastVoted,
    });
  incentiveRequire(
    action.kind === "vote" &&
      bounded(action.targets) &&
      bounded(action.relativeWeights) &&
      action.targets.length === action.relativeWeights.length &&
      BigInt(action.targets.length) <= snapshot.maxVotingNum,
    "InvalidInput",
    "bounded matching vote targets and relative weights required",
  );
  incentiveRequire(
    timestamp <= epoch.voteEnd || snapshot.whitelisted,
    "IneligibleOperation",
    "NFT is outside ordinary voting window",
  );
  const targets = action.targets.map((value) => parseAddress(value));
  incentiveRequire(
    new Set(targets).size === targets.length &&
      targets.every((target) => {
        const row = snapshot.targets.find((row) => row.target === target);
        return row !== undefined && row.registered && row.alive;
      }),
    "IneligibleOperation",
    "distinct registered live voting targets required",
  );
  const allocation = allocateVotingPower({ votingPower, relativeWeights: action.relativeWeights });
  return Object.freeze({
    targets: Object.freeze(targets),
    allocations: allocation.allocations,
    usedWeight: allocation.usedWeight,
    votingPower,
    lastVoted: timestamp,
  });
}
