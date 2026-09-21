import { parseUint } from "@mezo-dev-kit/evm";
import { poolRequire } from "./errors.ts";
import {
  calculateCLAmounts,
  calculateCLFees,
  calculateCLLiquidity,
  getCLTickAtSqrtRatio,
  getCLTickSqrtRatio,
} from "./cl-math.ts";
import type { CLPoolSnapshot, CLPosition } from "./cl-types.ts";
/**
 * One existing-pool position action. Token amounts, NFT IDs and liquidity are bigint; tick
 * bounds are integer numbers.
 */
export type CLPositionAction =
  | Readonly<{
      kind: "mint";
      tickLower: number;
      tickUpper: number;
      amount0Desired: bigint;
      amount1Desired: bigint;
    }>
  | Readonly<{ kind: "increase"; tokenId: bigint; amount0Desired: bigint; amount1Desired: bigint }>
  | Readonly<{ kind: "decrease"; tokenId: bigint; liquidity: bigint }>
  | Readonly<{ kind: "collect"; tokenId: bigint; amount0Max: bigint; amount1Max: bigint }>
  | Readonly<{ kind: "burn"; tokenId: bigint }>;
/**
 * Token minimums, liquidity/price bounds and deadline/age policy. Some bounds are client
 * checks; consult the writer reference.
 */
export interface CLPositionBounds {
  readonly minAmount0: bigint;
  readonly minAmount1: bigint;
  readonly minLiquidity: bigint;
  /**
   * Lower bound in Q64.96 square-root price units.
   */
  readonly sqrtPriceMinX96: bigint;
  /**
   * Upper bound in Q64.96 square-root price units.
   */
  readonly sqrtPriceMaxX96: bigint;
  /**
   * Absolute Unix seconds, not a duration.
   */
  readonly deadline: bigint;
  /**
   * Maximum allowed deadline distance from the observed timestamp, in seconds.
   */
  readonly maxDeadlineSeconds: bigint;
  /**
   * Maximum accepted preparation age in blocks, checked by the owning operation.
   */
  readonly maxBlockAge: bigint;
}
/**
 * Expected liquidity, amounts and owed balances. Decrease credits principal to the NFT; collect
 * is the wallet payment step.
 */
export interface CLPositionForecast {
  readonly kind: CLPositionAction["kind"];
  readonly tokenId: bigint | null;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidityDelta: bigint;
  readonly liquidityAfter: bigint;
  /** Mint/increase spend, decrease credit, or maximum collect accounting; actual collection may be lower. */
  readonly amount0: bigint;
  readonly amount1: bigint;
  readonly tokensOwedAfter0: bigint;
  readonly tokensOwedAfter1: bigint;
  readonly lastInsideAfter0X128: bigint;
  readonly lastInsideAfter1X128: bigint;
}
export function clPosition(snapshot: CLPoolSnapshot, tokenId: bigint): CLPosition {
  parseUint(tokenId);
  const position = snapshot.positions.find((row) => row.tokenId === tokenId);
  poolRequire(position !== undefined, "InvalidInput", "CL position missing from snapshot");
  return position;
}
/** Source outcome only; independent of caller minimums and deadline policy for receipt verification. */
export function modelCLPosition(
  snapshot: CLPoolSnapshot,
  action: CLPositionAction,
): Readonly<CLPositionForecast> {
  poolRequire(
    snapshot.writeCompatible === true,
    "UnavailablePool",
    "CL assets are outside writer compatibility",
  );
  poolRequire(
    snapshot.unlocked &&
      ![
        snapshot.pool,
        snapshot.manager.address,
        snapshot.factory.address,
        snapshot.key.token0,
        snapshot.key.token1,
      ].includes(snapshot.account),
    "UnsafeState",
    "direct CL owner and unlocked pool required",
  );
  poolRequire(
    ["mint", "increase", "decrease", "collect", "burn"].includes(action.kind),
    "InvalidInput",
    "unknown CL position operation",
  );
  const position = action.kind === "mint" ? null : clPosition(snapshot, action.tokenId);
  if (position)
    poolRequire(
      position.owner === snapshot.account &&
        !position.staked &&
        position.fees0.overflowed === false &&
        position.fees1.overflowed === false,
      "UnsafeState",
      "self-owned unstaked CL position without accounting overflow required",
    );
  const tickLower = action.kind === "mint" ? action.tickLower : position!.tickLower,
    tickUpper = action.kind === "mint" ? action.tickUpper : position!.tickUpper;
  const lower = snapshot.ticks.find((row) => row.tick === tickLower),
    upper = snapshot.ticks.find((row) => row.tick === tickUpper);
  const sqrtLowerX96 = getCLTickSqrtRatio(tickLower),
    sqrtUpperX96 = getCLTickSqrtRatio(tickUpper);
  poolRequire(
    tickLower < tickUpper &&
      tickLower % snapshot.key.tickSpacing === 0 &&
      tickUpper % snapshot.key.tickSpacing === 0 &&
      lower !== undefined &&
      upper !== undefined,
    "InvalidInput",
    "complete aligned CL range required",
  );
  const prices = { sqrtPriceX96: snapshot.sqrtPriceX96, sqrtLowerX96, sqrtUpperX96 };
  let liquidityDelta = 0n,
    liquidityAfter = position?.liquidity ?? 0n,
    amount0 = 0n,
    amount1 = 0n,
    tokensOwedAfter0 = position?.tokensOwed0 ?? 0n,
    tokensOwedAfter1 = position?.tokensOwed1 ?? 0n,
    lastInsideAfter0X128 = position?.lastInside0X128 ?? 0n,
    lastInsideAfter1X128 = position?.lastInside1X128 ?? 0n;
  if (action.kind === "mint" || action.kind === "increase") {
    poolRequire(
      snapshot.factoryApproved && snapshot.managerNativeBalance === 0n,
      "UnsafeState",
      "approved CL factory and empty manager native refund custody required",
    );
    const desired0 = parseUint(action.amount0Desired),
      desired1 = parseUint(action.amount1Desired);
    poolRequire(
      desired0 > 0n || desired1 > 0n,
      "InvalidInput",
      "positive CL desired amount required",
    );
    poolRequire(
      desired0 <= snapshot.token0.balance && desired1 <= snapshot.token1.balance,
      "BoundExceeded",
      "insufficient CL wallet balance",
    );
    liquidityDelta = calculateCLLiquidity({ ...prices, amount0: desired0, amount1: desired1 });
    poolRequire(
      liquidityDelta > 0n && liquidityDelta < 1n << 127n,
      "BoundExceeded",
      "positive signed-int128 CL mint liquidity required",
    );
    liquidityAfter = parseUint(liquidityAfter + liquidityDelta, 128);
    for (const boundary of [lower, upper])
      poolRequire(
        boundary.liquidityGross + liquidityDelta <= snapshot.maxLiquidityPerTick,
        "BoundExceeded",
        "CL per-tick liquidity limit exceeded",
      );
    ({ amount0, amount1 } = calculateCLAmounts({
      ...prices,
      liquidity: liquidityDelta,
      rounding: "up",
    }));
    poolRequire(
      amount0 <= desired0 && amount1 <= desired1,
      "BoundExceeded",
      "CL rounded mint exceeds desired amounts",
    );
    const inside = (globalX128: bigint, lo: bigint, hi: bigint) =>
      calculateCLFees({
        liquidity: 0n,
        globalX128,
        lowerOutsideX128: lower.initialized ? lo : tickLower <= snapshot.tick ? globalX128 : 0n,
        upperOutsideX128: upper.initialized ? hi : tickUpper <= snapshot.tick ? globalX128 : 0n,
        lastInsideX128: 0n,
        tokensOwed: 0n,
        tick: snapshot.tick,
        tickLower,
        tickUpper,
        staked: false,
      }).insideX128;
    lastInsideAfter0X128 = inside(
      snapshot.globalFee0X128,
      lower.feeGrowthOutside0X128,
      upper.feeGrowthOutside0X128,
    );
    lastInsideAfter1X128 = inside(
      snapshot.globalFee1X128,
      lower.feeGrowthOutside1X128,
      upper.feeGrowthOutside1X128,
    );
    tokensOwedAfter0 = position?.fees0.tokensOwed ?? 0n;
    tokensOwedAfter1 = position?.fees1.tokensOwed ?? 0n;
  } else if (action.kind === "decrease") {
    const removed = parseUint(action.liquidity, 128);
    poolRequire(
      position !== null && removed > 0n && removed < 1n << 127n && removed <= position.liquidity,
      "BoundExceeded",
      "CL removal exceeds position or signed delta limit",
    );
    liquidityDelta = -removed;
    liquidityAfter = position.liquidity - removed;
    ({ amount0, amount1 } = calculateCLAmounts({
      ...prices,
      liquidity: removed,
      rounding: "down",
    }));
    tokensOwedAfter0 = parseUint(position.fees0.tokensOwed + amount0, 128);
    tokensOwedAfter1 = parseUint(position.fees1.tokensOwed + amount1, 128);
    lastInsideAfter0X128 = position.fees0.insideX128;
    lastInsideAfter1X128 = position.fees1.insideX128;
  } else if (action.kind === "collect") {
    const max0 = parseUint(action.amount0Max, 128),
      max1 = parseUint(action.amount1Max, 128);
    poolRequire(
      position !== null && (max0 > 0n || max1 > 0n),
      "InvalidInput",
      "positive CL collection cap required",
    );
    const owed0 = position.fees0.tokensOwed,
      owed1 = position.fees1.tokensOwed;
    amount0 = max0 < owed0 ? max0 : owed0;
    amount1 = max1 < owed1 ? max1 : owed1;
    tokensOwedAfter0 = owed0 - amount0;
    tokensOwedAfter1 = owed1 - amount1;
    if (position.liquidity > 0n) {
      lastInsideAfter0X128 = position.fees0.insideX128;
      lastInsideAfter1X128 = position.fees1.insideX128;
    }
  } else {
    poolRequire(
      position !== null &&
        position.liquidity === 0n &&
        position.tokensOwed0 === 0n &&
        position.tokensOwed1 === 0n,
      "UnsafeState",
      "CL NFT must be cleared before burning",
    );
  }
  if (snapshot.tick >= tickLower && snapshot.tick < tickUpper)
    parseUint(snapshot.liquidity + liquidityDelta, 128);
  return Object.freeze({
    kind: action.kind,
    tokenId: position?.tokenId ?? null,
    tickLower,
    tickUpper,
    liquidityDelta,
    liquidityAfter,
    amount0,
    amount1,
    tokensOwedAfter0,
    tokensOwedAfter1,
    lastInsideAfter0X128,
    lastInsideAfter1X128,
  });
}
export function clBounds(bounds: CLPositionBounds): void {
  for (const value of [
    bounds.minAmount0,
    bounds.minAmount1,
    bounds.minLiquidity,
    bounds.deadline,
    bounds.maxDeadlineSeconds,
    bounds.maxBlockAge,
  ])
    parseUint(value);
  getCLTickAtSqrtRatio(bounds.sqrtPriceMinX96);
  getCLTickAtSqrtRatio(bounds.sqrtPriceMaxX96);
  poolRequire(
    bounds.sqrtPriceMinX96 <= bounds.sqrtPriceMaxX96 && bounds.maxDeadlineSeconds > 0n,
    "InvalidInput",
    "ordered CL price bounds and deadline budget required",
  );
}
/**
 * Forecast one ordinary self-owned, unstaked CL position operation.
 *
 * @remarks
 * Mint/increase spend rounds up; decrease credits principal down into the NFT's owed
 * balances and does not pay the wallet. Collect and burn have separate eligibility.
 * Bounds distinguish token units, liquidity and Q64.96 prices. This pure forecast
 * uses supplied state; consult the reference for on-chain versus preflight bounds.
 */
export function forecastCLPosition(input: {
  readonly snapshot: CLPoolSnapshot;
  readonly action: CLPositionAction;
  readonly bounds: CLPositionBounds;
}): Readonly<CLPositionForecast> {
  const { snapshot, action, bounds } = input;
  clBounds(bounds);
  const forecast = modelCLPosition(snapshot, action),
    adding = action.kind === "mint" || action.kind === "increase";
  poolRequire(
    snapshot.sqrtPriceX96 >= bounds.sqrtPriceMinX96 &&
      snapshot.sqrtPriceX96 <= bounds.sqrtPriceMaxX96 &&
      bounds.deadline > snapshot.timestamp &&
      bounds.deadline - snapshot.timestamp <= bounds.maxDeadlineSeconds,
    "BoundExceeded",
    "CL price or deadline outside policy",
  );
  poolRequire(
    (adding
      ? bounds.minLiquidity > 0n && forecast.liquidityDelta >= bounds.minLiquidity
      : bounds.minLiquidity === 0n) &&
      forecast.amount0 >= bounds.minAmount0 &&
      forecast.amount1 >= bounds.minAmount1,
    "BoundExceeded",
    "CL minimum amount or liquidity unmet",
  );
  poolRequire(
    (forecast.amount0 > 0n ? bounds.minAmount0 > 0n : bounds.minAmount0 === 0n) &&
      (forecast.amount1 > 0n ? bounds.minAmount1 > 0n : bounds.minAmount1 === 0n),
    "InvalidInput",
    "explicit positive minimum for each expected CL amount required",
  );
  return forecast;
}
