import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import type { CLPoolSnapshot } from "@mezo-dev-kit/pools";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
/**
 * Directed CL hop with numeric tick spacing encoded in the router path; spacing is not a
 * fee-tier field.
 */
export interface CLSwapHop {
  readonly tokenIn: `0x${string}`;
  readonly tokenOut: `0x${string}`;
  readonly tickSpacing: number;
}
/**
 * Explicit bounds on quote steps, bitmap reads and initialized tick crossings. Exhaustion
 * rejects incomplete execution quotes.
 */
export interface CLSwapBudget {
  readonly maxSteps: number;
  readonly maxBitmapWords: number;
  readonly maxCrossedTicks: number;
}
/**
 * Exact input amount, explicit CL route/allowlist and work budget at an optional fixed block.
 */
export interface CLSwapQuoteInput {
  readonly route: readonly CLSwapHop[];
  readonly intermediateAssets: readonly `0x${string}`[];
  readonly account: `0x${string}`;
  readonly amountIn: bigint;
  readonly maxAgeBlocks: bigint;
  readonly budget: CLSwapBudget;
  readonly blockNumber?: bigint;
}
/**
 * One initialized tick transition with liquidity and fee-growth effects retained for exact
 * reconciliation.
 */
export interface CLSwapCrossing {
  readonly liquidityGross: bigint;
  readonly tick: number;
  readonly liquidityNet: bigint;
  readonly stakedLiquidityNet: bigint;
  readonly feeOutsideAfter0X128: bigint;
  readonly feeOutsideAfter1X128: bigint;
}
/**
 * One pool's complete bounded swap prediction and touched tick/accounting state at the quote
 * coordinate.
 */
export interface CLSwapPoolQuote {
  readonly snapshot: Readonly<CLPoolSnapshot>;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly feeAmount: bigint;
  /**
   * Square-root price in Q64.96 fixed point for token1/token0, not a decimal display price.
   */
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly liquidity: bigint;
  readonly stakedLiquidity: bigint;
  readonly globalFee0X128: bigint;
  readonly globalFee1X128: bigint;
  readonly gaugeFeeBefore0: bigint;
  readonly gaugeFeeBefore1: bigint;
  readonly gaugeFeeAfter0: bigint;
  readonly gaugeFeeAfter1: bigint;
  readonly steps: number;
  readonly bitmapWords: number;
  readonly crossings: readonly Readonly<CLSwapCrossing>[];
}
/**
 * Complete route prediction at one coordinate with bounded traversal evidence; not an atomic
 * mixed-router plan.
 */
export interface CLSwapQuote {
  readonly sourceClass: "dex-execution-quote";
  readonly providerId: string;
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
  readonly timestamp: bigint;
  readonly account: `0x${string}`;
  readonly router: Readonly<ResolvedContract>;
  readonly routerNativeBalance: bigint;
  readonly route: readonly Readonly<CLSwapHop>[];
  readonly intermediateAssets: readonly `0x${string}`[];
  readonly path: `0x${string}`;
  readonly amountIn: bigint;
  readonly estimatedAmountOut: bigint;
  readonly amounts: readonly bigint[];
  readonly pools: readonly Readonly<CLSwapPoolQuote>[];
  readonly inputToken: Readonly<TokenSnapshot>;
  readonly outputToken: Readonly<TokenSnapshot>;
  readonly maxAgeBlocks: bigint;
  readonly budget: Readonly<CLSwapBudget>;
  readonly writeCompatible: boolean;
}
/**
 * Signer-free complete exact-input CL quotes; exhausted budgets and partial fills reject.
 */
export interface CLSwapReader {
  /**
   * Quote the complete supplied CL route within its traversal budget; partial fills or
   * exhausted work reject.
   */
  quote(input: CLSwapQuoteInput): Promise<Readonly<CLSwapQuote>>;
}
