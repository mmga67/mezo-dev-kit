import { parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { INCENTIVES_MODEL } from "./model.generated.ts";
/**
 * Distributor cursor state in Unix seconds. Missing first user point is null; it is not
 * timestamp zero.
 */
export interface RebaseCursorInput {
  readonly startTime: bigint;
  readonly lastTokenTime: bigint;
  readonly timeCursor: bigint;
  /** Null when the escrow has no user point; otherwise its first checkpoint timestamp. */
  readonly firstUserTimestamp: bigint | null;
}
/**
 * One completed protocol week with MEZO allocation and user/total voting power, used in bounded
 * integer claim accounting.
 */
export interface RebasePeriod {
  readonly week: bigint;
  readonly votingPower: bigint;
  readonly totalVotingPower: bigint;
  readonly allocated: bigint;
}
/**
 * One bounded claim amount and next cursor. hasMore means another explicit window remains;
 * periods is a count, not full-history coverage.
 */
export interface RebaseClaim {
  readonly amount: bigint;
  readonly epochStart: bigint;
  readonly nextCursor: bigint;
  readonly periods: bigint;
  readonly hasMore: boolean;
}
const week = BigInt(INCENTIVES_MODEL.week),
  limit = BigInt(INCENTIVES_MODEL.rebaseClaimIterationLimit);
export function rebaseWindow(input: RebaseCursorInput): Readonly<{
  epochStart: bigint;
  begin: bigint;
  end: bigint;
  nextCursor: bigint;
  periods: bigint;
  hasMore: boolean;
}> {
  const start = parseUint(input.startTime),
    last = parseUint(input.lastTokenTime),
    cursor = parseUint(input.timeCursor),
    end = last - (last % week);
  incentiveRequire(
    start % week === 0n && cursor % week === 0n && start <= last,
    "InvalidInput",
    "rebase cursor or distribution window is invalid",
  );
  if (input.firstUserTimestamp === null)
    return Object.freeze({
      epochStart: cursor,
      begin: cursor,
      end,
      nextCursor: cursor,
      periods: 0n,
      hasMore: false,
    });
  const first = parseUint(input.firstUserTimestamp),
    epochStart = cursor === 0n ? first - (first % week) : cursor;
  // Preserve the source's early-return order before startTime clamping.
  if (epochStart >= end)
    return Object.freeze({
      epochStart,
      begin: epochStart,
      end,
      nextCursor: epochStart,
      periods: 0n,
      hasMore: false,
    });
  const begin = epochStart < start ? start : epochStart,
    remaining = (end - begin) / week,
    periods = remaining < limit ? remaining : limit,
    nextCursor = parseUint(begin + periods * week);
  return Object.freeze({ epochStart, begin, end, nextCursor, periods, hasMore: nextCursor < end });
}
/** Exact bounded distributor claim; each weekly product and division floors independently. */
export function calculateRebaseClaim(
  input: RebaseCursorInput & { readonly periods: readonly RebasePeriod[] },
): Readonly<RebaseClaim> {
  const window = rebaseWindow(input);
  incentiveRequire(
    Array.isArray(input.periods) && BigInt(input.periods.length) === window.periods,
    "InvalidInput",
    "complete bounded rebase periods required",
  );
  let amount = 0n;
  input.periods.forEach((period: RebasePeriod, index) => {
    incentiveRequire(
      period !== null && typeof period === "object",
      "InvalidInput",
      "rebase period must be an object",
    );
    incentiveRequire(
      parseUint(period.week) === window.begin + BigInt(index) * week,
      "InvalidInput",
      "rebase weeks must be contiguous and ordered",
    );
    const supply = parseUint(period.totalVotingPower),
      power = parseUint(period.votingPower),
      allocated = parseUint(period.allocated);
    amount = parseUint(amount + parseUint(power * allocated) / (supply > 0n ? supply : 1n));
  });
  return Object.freeze({
    amount,
    epochStart: window.epochStart,
    nextCursor: window.nextCursor,
    periods: window.periods,
    hasMore: window.hasMore,
  });
}
