import { parseUint } from "@mezo-dev-kit/evm";
import { poolRequire } from "./errors.ts";
import { clAmountDelta, getCLTickAtSqrtRatio, getCLUsableTicks } from "./cl-math.ts";
import { POOL_MODEL } from "./model.generated.ts";
const model = POOL_MODEL.cl,
  Q96 = BigInt(model.constants.Q96),
  Q128 = BigInt(model.constants.Q128),
  scale = BigInt(model.swapFeeScale),
  max256 = (1n << 256n) - 1n;
const ceil = (a: bigint, b: bigint) => parseUint(a / b + (a % b === 0n ? 0n : 1n));
/**
 * One exact-input step with Q64.96 prices, uint128 liquidity, remaining input and fee at the
 * generated CL scale.
 */
export interface CLSwapStepInput {
  /**
   * Square-root price in Q64.96 fixed point for token1/token0, not a decimal display price.
   */
  readonly sqrtPriceX96: bigint;
  readonly sqrtTargetX96: bigint;
  readonly liquidity: bigint;
  readonly amountRemaining: bigint;
  readonly fee: bigint;
}
/**
 * One step's next price, net input, output and separate fee in the input token's base units;
 * not a complete route quote.
 */
export interface CLSwapStep {
  /**
   * Square-root price in Q64.96 fixed point for token1/token0, not a decimal display price.
   */
  readonly sqrtPriceX96: bigint;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly feeAmount: bigint;
}
/** Exact-input SwapMath; this is a calculation, not a quote or execution simulation. */
export function calculateCLSwapStep(input: CLSwapStepInput): Readonly<CLSwapStep> {
  const current = parseUint(input.sqrtPriceX96, 160),
    target = parseUint(input.sqrtTargetX96, 160),
    liquidity = parseUint(input.liquidity, 128),
    remaining = parseUint(input.amountRemaining),
    fee = parseUint(input.fee, 24);
  getCLTickAtSqrtRatio(current);
  poolRequire(
    target >= BigInt(model.constants.minSqrtRatioX96) &&
      target <= BigInt(model.constants.maxSqrtRatioX96) &&
      fee < scale &&
      remaining < 1n << 255n,
    "InvalidInput",
    "CL swap target, fee or signed input out of range",
  );
  const zeroForOne = current >= target,
    lessFee = (remaining * (scale - fee)) / scale;
  let next = target,
    amountIn = clAmountDelta(
      zeroForOne ? target : current,
      zeroForOne ? current : target,
      liquidity,
      zeroForOne,
      true,
    );
  if (lessFee < amountIn) {
    poolRequire(
      liquidity > 0n,
      "InvalidInput",
      "positive CL liquidity required for price movement",
    );
    if (zeroForOne) {
      if (lessFee === 0n) next = current;
      else {
        const numerator = liquidity << 96n,
          product = lessFee * current,
          denominator = numerator + product;
        // Preserve the deployed overflow fallback instead of simplifying the rational expression.
        next =
          product <= max256 && denominator <= max256
            ? ceil(numerator * current, denominator)
            : ceil(numerator, parseUint(numerator / current + lessFee));
      }
    } else next = parseUint(current + parseUint((lessFee * Q96) / liquidity), 160);
  }
  if (next !== target)
    amountIn = clAmountDelta(
      zeroForOne ? next : current,
      zeroForOne ? current : next,
      liquidity,
      zeroForOne,
      true,
    );
  const amountOut = clAmountDelta(
      zeroForOne ? next : current,
      zeroForOne ? current : next,
      liquidity,
      !zeroForOne,
      false,
    ),
    feeAmount = next !== target ? remaining - amountIn : ceil(amountIn * fee, scale - fee);
  poolRequire(
    amountIn + feeAmount <= remaining,
    "UnsafeState",
    "CL step spends more than remaining input",
  );
  return Object.freeze({ sqrtPriceX96: next, amountIn, amountOut, feeAmount });
}
/**
 * Separate gauge/unstaked fee amounts and Q128 growth, with explicit gauge-accounting overflow
 * evidence.
 */
export interface CLSwapFeeSplit {
  readonly unstakedFeeAmount: bigint;
  readonly gaugeFeeAmount: bigint;
  readonly growthX128: bigint;
  readonly overflowed: boolean;
}
/**
 * Split a step's input-token fee between unstaked liquidity and the gauge.
 *
 * @remarks
 * The staked share and levy on the unstaked share round up independently. GrowthX128
 * uses only unstaked liquidity. Fully staked liquidity assigns the fee to the gauge.
 * Inspect overflowed before using the result in a writer.
 * @param input - Token fee base units, uint128 liquidity and levy at the generated CL fee
 * scale.
 * @throws PoolError - Zero total liquidity, excessive staked liquidity or invalid levy.
 */
export function calculateCLSwapFeeSplit(input: {
  readonly feeAmount: bigint;
  readonly liquidity: bigint;
  readonly stakedLiquidity: bigint;
  readonly unstakedFee: bigint;
}): Readonly<CLSwapFeeSplit> {
  const fee = parseUint(input.feeAmount),
    liquidity = parseUint(input.liquidity, 128),
    staked = parseUint(input.stakedLiquidity, 128),
    levy = parseUint(input.unstakedFee, 24);
  poolRequire(
    liquidity > 0n && staked <= liquidity && levy <= scale,
    "InvalidInput",
    "CL fee split requires valid active liquidity and rate",
  );
  const stakedShare = ceil(fee * staked, liquidity),
    unstakedShare = fee - stakedShare,
    stakedLevy = ceil(unstakedShare * levy, scale),
    gaugeFeeAmount = stakedShare + stakedLevy,
    unstakedFeeAmount = fee - gaugeFeeAmount;
  return Object.freeze({
    unstakedFeeAmount,
    gaugeFeeAmount,
    growthX128:
      liquidity === staked ? 0n : parseUint((unstakedFeeAmount * Q128) / (liquidity - staked)),
    overflowed: gaugeFeeAmount >= 1n << 128n,
  });
}
/**
 * Directional compressed-tick location in one bitmap word; negative division floors toward
 * minus infinity.
 */
export interface CLBitmapLocation {
  readonly word: number;
  readonly bit: number;
  readonly compressed: number;
}
/**
 * Locate the one bitmap word and bit for a directional initialized-tick search.
 *
 * @remarks
 * Negative tick division floors toward minus infinity. Rightward search starts at
 * the next compressed tick. This helper computes a location; it performs no RPC.
 * @param input - Numeric tick/spacing and zeroForOne direction.
 */
export function getCLBitmapLocation(input: {
  readonly tick: number;
  readonly tickSpacing: number;
  readonly zeroForOne: boolean;
}): Readonly<CLBitmapLocation> {
  getCLUsableTicks(input.tickSpacing);
  poolRequire(
    Number.isInteger(input.tick) &&
      input.tick >= model.constants.minTick - 1 &&
      input.tick <= model.constants.maxTick &&
      typeof input.zeroForOne === "boolean",
    "InvalidInput",
    "CL bitmap tick or direction invalid",
  );
  const compressed = Math.floor(input.tick / input.tickSpacing) + (input.zeroForOne ? 0 : 1),
    word = Math.floor(compressed / 256),
    bit = compressed - word * 256;
  return Object.freeze({ compressed, word, bit });
}
/** Searches one supplied bitmap word; an empty word returns its boundary, not an invented tick. */
export function findCLBitmapTick(input: {
  readonly tick: number;
  readonly tickSpacing: number;
  readonly zeroForOne: boolean;
  readonly bitmap: bigint;
}): Readonly<{ tick: number; initialized: boolean }> {
  const { compressed, bit } = getCLBitmapLocation(input),
    bitmap = parseUint(input.bitmap),
    mask = input.zeroForOne ? (1n << BigInt(bit + 1)) - 1n : max256 ^ ((1n << BigInt(bit)) - 1n),
    masked = bitmap & mask;
  let selected = input.zeroForOne ? 0 : 255;
  if (masked !== 0n) {
    if (input.zeroForOne) selected = masked.toString(2).length - 1;
    else {
      selected = 0;
      while (((masked >> BigInt(selected)) & 1n) === 0n) selected++;
    }
  }
  return Object.freeze({
    tick: Number(BigInt.asIntN(24, BigInt((compressed - bit + selected) * input.tickSpacing))),
    initialized: masked !== 0n,
  });
}
