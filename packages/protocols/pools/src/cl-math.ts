import { parseUint } from "@mezo-dev-kit/evm";
import { poolRequire } from "./errors.ts";
import { POOL_MODEL } from "./model.generated.ts";
const model = POOL_MODEL.cl,
  minTick = model.constants.minTick,
  maxTick = model.constants.maxTick,
  q96 = BigInt(model.constants.Q96),
  q128 = BigInt(model.constants.Q128),
  minRatio = BigInt(model.constants.minSqrtRatioX96),
  maxRatio = BigInt(model.constants.maxSqrtRatioX96),
  mask256 = (1n << 256n) - 1n,
  mask128 = (1n << 128n) - 1n;

function tick(value: number): number {
  poolRequire(
    Number.isInteger(value) && value >= minTick && value <= maxTick,
    "InvalidInput",
    "CL tick outside supported range",
  );
  return value;
}
/** Bit-exact forward ratio; coefficients are generated from the retained TickMath source. */
export function getCLTickSqrtRatio(input: number): bigint {
  const value = tick(input),
    absolute = BigInt(Math.abs(value));
  let ratio = q128;
  model.tickMultipliers.forEach((coefficient, bit) => {
    if ((absolute & (1n << BigInt(bit))) !== 0n) ratio = (ratio * BigInt(coefficient)) >> 128n;
  });
  if (value > 0) ratio = mask256 / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}
/** Greatest tick whose exact forward ratio does not exceed the input; at most 21 comparisons. */
export function getCLTickAtSqrtRatio(input: bigint): number {
  const ratio = parseUint(input, 160);
  poolRequire(
    ratio >= minRatio && ratio < maxRatio,
    "InvalidInput",
    "CL inverse ratio outside half-open range",
  );
  let lower: number = minTick,
    upper: number = maxTick;
  while (lower < upper) {
    const middle = Math.floor((lower + upper + 1) / 2);
    if (getCLTickSqrtRatio(middle) <= ratio) lower = middle;
    else upper = middle - 1;
  }
  return lower;
}
/**
 * Find the lowest and highest usable ticks for a validated positive tick spacing.
 *
 * @returns Numeric tick bounds aligned inward to the canonical TickMath interval.
 * @throws PoolError - Spacing is outside the accepted integer range.
 */
export function getCLUsableTicks(
  tickSpacing: number,
): Readonly<{ tickLower: number; tickUpper: number }> {
  poolRequire(
    Number.isInteger(tickSpacing) && tickSpacing > 0 && tickSpacing <= maxTick,
    "InvalidInput",
    "positive CL tick spacing required",
  );
  return Object.freeze({
    tickLower: Math.ceil(minTick / tickSpacing) * tickSpacing,
    tickUpper: Math.floor(maxTick / tickSpacing) * tickSpacing,
  });
}
/**
 * Current/lower/upper square-root prices in Q64.96, with ordered canonical range bounds.
 */
export interface CLPriceRange {
  /**
   * Square-root price in Q64.96 fixed point for token1/token0, not a decimal display price.
   */
  readonly sqrtPriceX96: bigint;
  readonly sqrtLowerX96: bigint;
  readonly sqrtUpperX96: bigint;
}
/**
 * Separate token0/token1 base-unit amounts for a CL range; they cannot be summed without an
 * explicit valuation.
 */
export interface CLAmounts {
  readonly amount0: bigint;
  readonly amount1: bigint;
}
function range(input: CLPriceRange) {
  const current = parseUint(input.sqrtPriceX96, 160),
    lower = parseUint(input.sqrtLowerX96, 160),
    upper = parseUint(input.sqrtUpperX96, 160);
  poolRequire(
    current >= minRatio &&
      current < maxRatio &&
      lower >= minRatio &&
      upper <= maxRatio &&
      lower < upper,
    "InvalidInput",
    "ordered initialized CL price range required",
  );
  return { current, lower, upper };
}
function division(numerator: bigint, denominator: bigint, up: boolean) {
  return parseUint(numerator / denominator + (up && numerator % denominator !== 0n ? 1n : 0n));
}
/** Internal shared SqrtPriceMath delta sequence, including the two token0 roundings. */
export function clAmountDelta(
  a: bigint,
  b: bigint,
  liquidity: bigint,
  token0: boolean,
  up: boolean,
): bigint {
  poolRequire(a > 0n && a <= b, "InvalidInput", "ordered positive CL delta prices required");
  return token0
    ? division(division((liquidity << 96n) * (b - a), b, up), a, up)
    : division(liquidity * (b - a), q96, up);
}
/** Principal burns floor; core mint debts ceil. Explicit rounding prevents display estimates becoming mint guarantees. */
export function calculateCLAmounts(
  input: CLPriceRange & { readonly liquidity: bigint; readonly rounding: "down" | "up" },
): Readonly<CLAmounts> {
  const { current, lower, upper } = range(input),
    liquidity = parseUint(input.liquidity, 128),
    up = input.rounding === "up";
  poolRequire(input.rounding === "down" || up, "InvalidInput", "explicit CL rounding required");
  const amount0 = (a: bigint, b: bigint) => clAmountDelta(a, b, liquidity, true, up),
    amount1 = (a: bigint, b: bigint) => clAmountDelta(a, b, liquidity, false, up);
  return Object.freeze({
    amount0: current >= upper ? 0n : amount0(current <= lower ? lower : current, upper),
    amount1: current <= lower ? 0n : amount1(lower, current >= upper ? upper : current),
  });
}
/** Position-manager liquidity from desired token amounts, with the source's intermediate floor. */
export function calculateCLLiquidity(input: CLPriceRange & CLAmounts): bigint {
  const { current, lower, upper } = range(input),
    amount0 = parseUint(input.amount0),
    amount1 = parseUint(input.amount1);
  const liquidity0 = (a: bigint, b: bigint) =>
      parseUint(division(amount0 * division(a * b, q96, false), b - a, false), 128),
    liquidity1 = (a: bigint, b: bigint) => parseUint(division(amount1 * q96, b - a, false), 128);
  let liquidity: bigint;
  if (current <= lower) liquidity = liquidity0(lower, upper);
  else if (current >= upper) liquidity = liquidity1(lower, upper);
  else {
    const a = liquidity0(current, upper),
      b = liquidity1(lower, current);
    liquidity = a < b ? a : b;
  }
  return parseUint(liquidity, 128);
}
/**
 * One-position, one-token Q128 fee growth and stored owed units, with explicit ticks and staked
 * custody.
 */
export interface CLFeeInput {
  readonly liquidity: bigint;
  readonly globalX128: bigint;
  readonly lowerOutsideX128: bigint;
  readonly upperOutsideX128: bigint;
  readonly lastInsideX128: bigint;
  readonly tokensOwed: bigint;
  readonly tick: number;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly staked: boolean;
}
/**
 * Wrapped inside index and accrued/stored fee accounting. Inspect overflowed before a writer
 * uses uint128-truncated tokensOwed.
 */
export interface CLFees {
  readonly insideX128: bigint;
  readonly accrued: bigint;
  readonly tokensOwed: bigint;
  /** Solidity 0.7 truncates uint128 accounting; writers must reject this condition. */
  readonly overflowed: boolean;
}
/**
 * Calculate one asset's CL position fee accounting from Q128 index growth.
 *
 * @remarks
 * Index subtraction wraps as uint256. Unstaked growth rounds down; staked positions
 * add no wallet growth. The returned tokensOwed mirrors uint128 truncation and
 * sets overflowed when truncation occurred; writers must reject that condition.
 * @param input - One-coordinate tick bounds, liquidity, index values and stored owed units.
 */
export function calculateCLFees(input: CLFeeInput): Readonly<CLFees> {
  const current = tick(input.tick),
    lower = tick(input.tickLower),
    upper = tick(input.tickUpper),
    liquidity = parseUint(input.liquidity, 128),
    global = parseUint(input.globalX128),
    lowerOutside = parseUint(input.lowerOutsideX128),
    upperOutside = parseUint(input.upperOutsideX128),
    last = parseUint(input.lastInsideX128),
    owed = parseUint(input.tokensOwed, 128);
  poolRequire(
    lower < upper && typeof input.staked === "boolean",
    "InvalidInput",
    "CL fee range and custody required",
  );
  const below = current >= lower ? lowerOutside : (global - lowerOutside) & mask256,
    above = current < upper ? upperOutside : (global - upperOutside) & mask256,
    insideX128 = (global - below - above) & mask256,
    accrued = input.staked
      ? 0n
      : division(((insideX128 - last) & mask256) * liquidity, q128, false),
    total = owed + accrued;
  return Object.freeze({
    insideX128,
    accrued,
    tokensOwed: total & mask128,
    overflowed: total > mask128,
  });
}
