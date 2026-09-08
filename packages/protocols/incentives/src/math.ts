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
export interface VotingEpoch {
  readonly start: bigint;
  readonly voteStart: bigint;
  readonly voteEnd: bigint;
  readonly next: bigint;
}
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
export interface VoteAllocation {
  readonly allocations: readonly bigint[];
  readonly usedWeight: bigint;
  readonly unallocatedFloorDust: bigint;
}
function boundedWeights(value: unknown): value is readonly bigint[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 64;
}
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
