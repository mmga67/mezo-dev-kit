import { parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { INCENTIVES_MODEL } from "./model.generated.ts";
const week = BigInt(INCENTIVES_MODEL.week),
  precision = BigInt(INCENTIVES_MODEL.boostConstants.precision);
const minimumBoost = BigInt(INCENTIVES_MODEL.boostConstants.minimumBoost),
  maximumBoost = BigInt(INCENTIVES_MODEL.boostConstants.maximumBoost);
function int128(value: unknown): bigint {
  const amount = parseUint(value);
  incentiveRequire(amount < 1n << 127n, "InvalidInput", "nonnegative int128 required");
  return amount;
}
/**
 * Round an explicit lock timestamp plus duration down to a protocol week.
 *
 * @param input - Unix timestamp, requested duration and deployment maximum, all in seconds.
 * @returns A future end no later than timestamp plus maxLockSeconds.
 * @throws IncentiveError - The rounded end is nonfuture or exceeds the maximum.
 * @throws EvmValueError - Invalid uint256 input or addition overflow.
 */
export function calculateLockEnd(input: {
  readonly timestamp: bigint;
  readonly duration: bigint;
  readonly maxLockSeconds: bigint;
}): bigint {
  const timestamp = parseUint(input.timestamp),
    duration = parseUint(input.duration),
    max = parseUint(input.maxLockSeconds),
    end = (parseUint(timestamp + duration) / week) * week;
  incentiveRequire(
    max > 0n && end > timestamp && end <= parseUint(timestamp + max),
    "InvalidInput",
    "rounded lock end is outside duration bounds",
  );
  return end;
}
/**
 * Current lock-based power estimate. Slopes floor before elapsed-time multiplication; estimates
 * do not include historical checkpoint/ownership suppression.
 */
export interface LockVotingPower {
  readonly unboosted: bigint;
  readonly boosted: bigint;
  readonly effectiveBoostedAmount: bigint;
  readonly slope: bigint;
  readonly boostedSlope: bigint;
}
/** A lock-based estimate, separate from historical checkpoint and same-block ownership suppression. */
export function calculateLockVotingPower(input: {
  readonly amount: bigint;
  readonly boost: bigint;
  readonly end: bigint;
  readonly permanent: boolean;
  readonly maxLockSeconds: bigint;
  readonly timestamp: bigint;
}): Readonly<LockVotingPower> {
  const amount = int128(input.amount),
    boost = parseUint(input.boost),
    end = parseUint(input.end),
    max = int128(input.maxLockSeconds),
    timestamp = parseUint(input.timestamp);
  incentiveRequire(
    max > 0n && typeof input.permanent === "boolean" && (!input.permanent || end === 0n),
    "InvalidInput",
    "invalid lock power inputs",
  );
  const effectiveBoostedAmount =
    boost === 0n ? amount : int128(parseUint(amount * boost) / precision);
  if (input.permanent)
    return Object.freeze({
      unboosted: amount,
      boosted: effectiveBoostedAmount,
      effectiveBoostedAmount,
      slope: 0n,
      boostedSlope: 0n,
    });
  const slope = amount / max,
    boostedSlope = effectiveBoostedAmount / max,
    remaining = end > timestamp ? int128(end - timestamp) : 0n;
  return Object.freeze({
    unboosted: int128(slope * remaining),
    boosted: int128(boostedSlope * remaining),
    effectiveBoostedAmount,
    slope,
    boostedSlope,
  });
}
/**
 * Calculate the capped 1e18-scaled factor from current BoostVoter weights.
 *
 * @remarks
 * Inputs belong to the boost voter, not PoolsVoter. Each ratio and intermediate
 * floor is preserved; zero denominators follow the deployed zero-ratio branches.
 * The function does not read current weights or establish vote eligibility.
 */
export function calculateBoostFactor(input: {
  readonly gaugeWeight: bigint;
  readonly votingVeTotalWeight: bigint;
  readonly boostableVeTotalWeight: bigint;
  readonly boostableVeWeight: bigint;
}): bigint {
  const weight = parseUint(input.gaugeWeight),
    votingTotal = parseUint(input.votingVeTotalWeight),
    boostableTotal = parseUint(input.boostableVeTotalWeight),
    target = parseUint(input.boostableVeWeight);
  const votingRatio = votingTotal === 0n ? 0n : parseUint(weight * precision) / votingTotal,
    boostableRatio = target === 0n ? 0n : parseUint(boostableTotal * precision) / target;
  const coefficient = (maximumBoost - minimumBoost) / precision,
    fraction = parseUint(parseUint(coefficient * boostableRatio) * votingRatio) / precision,
    result = parseUint(minimumBoost + fraction);
  return result < maximumBoost ? result : maximumBoost;
}
/**
 * Protocol week/open/close/next boundaries in Unix seconds. Voting opens strictly after
 * voteStart.
 */
export interface VotingEpoch {
  readonly start: bigint;
  readonly voteStart: bigint;
  readonly voteEnd: bigint;
  readonly next: bigint;
}
/**
 * Calculate the protocol week's voting boundaries in Unix seconds.
 *
 * @param timestamp - Explicit nonnegative Unix seconds; no clock is read.
 * @remarks
 * The result describes boundaries only. Eligibility starts strictly after voteStart;
 * a new epoch does not itself clear an NFT's existing allocations.
 */
export function calculateVotingEpoch(timestamp: bigint): Readonly<VotingEpoch> {
  const at = parseUint(timestamp),
    start = at - (at % week),
    next = parseUint(start + week);
  return Object.freeze({
    start,
    voteStart: parseUint(start + BigInt(INCENTIVES_MODEL.voteStartOffset)),
    voteEnd: next - BigInt(INCENTIVES_MODEL.voteEndOffset),
    next,
  });
}
/**
 * Per-target integer power, used total and unallocated floor dust. Target identity and
 * eligibility are not established by arithmetic.
 */
export interface VoteAllocation {
  readonly allocations: readonly bigint[];
  readonly usedWeight: bigint;
  readonly unallocatedFloorDust: bigint;
}
function boundedWeights(value: unknown): value is readonly bigint[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 64;
}
/**
 * Allocate integer voting power among one to 64 explicit relative weights.
 *
 * @returns Per-target floor-rounded allocations, their sum and unallocated dust.
 * @throws IncentiveError - Empty/oversized weights, zero total or any zero allocation.
 * @throws EvmValueError - Invalid unsigned input or checked arithmetic overflow.
 * @remarks
 * This arithmetic does not validate target liveness, ownership or epoch eligibility.
 */
export function allocateVotingPower(input: {
  readonly votingPower: bigint;
  readonly relativeWeights: readonly bigint[];
}): Readonly<VoteAllocation> {
  const power = parseUint(input.votingPower);
  incentiveRequire(
    boundedWeights(input.relativeWeights),
    "LimitExceeded",
    "one to 64 relative weights required",
  );
  const weights = input.relativeWeights.map((value) => parseUint(value)),
    total = weights.reduce((sum, weight) => parseUint(sum + weight), 0n);
  incentiveRequire(total > 0n, "InvalidInput", "positive relative weight sum required");
  const allocations = weights.map((weight) => parseUint(weight * power) / total);
  incentiveRequire(
    allocations.every((weight) => weight > 0n),
    "IneligibleOperation",
    "every floor-rounded vote must be nonzero",
  );
  const usedWeight = allocations.reduce((sum, weight) => parseUint(sum + weight), 0n);
  return Object.freeze({
    allocations: Object.freeze(allocations),
    usedWeight,
    unallocatedFloorDust: parseUint(power - usedWeight),
  });
}
