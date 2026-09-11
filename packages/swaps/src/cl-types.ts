import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import type { CLPoolSnapshot } from "@mezo-dev-kit/pools";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
export interface CLSwapHop {
  readonly tokenIn: `0x${string}`;
  readonly tokenOut: `0x${string}`;
  readonly tickSpacing: number;
}
export interface CLSwapBudget {
  readonly maxSteps: number;
  readonly maxBitmapWords: number;
  readonly maxCrossedTicks: number;
}
export interface CLSwapQuoteInput {
  readonly route: readonly CLSwapHop[];
  readonly intermediateAssets: readonly `0x${string}`[];
  readonly account: `0x${string}`;
  readonly amountIn: bigint;
  readonly maxAgeBlocks: bigint;
  readonly budget: CLSwapBudget;
  readonly blockNumber?: bigint;
}
export interface CLSwapCrossing {
  readonly liquidityGross: bigint;
  readonly tick: number;
  readonly liquidityNet: bigint;
  readonly stakedLiquidityNet: bigint;
  readonly feeOutsideAfter0X128: bigint;
  readonly feeOutsideAfter1X128: bigint;
}
export interface CLSwapPoolQuote {
  readonly snapshot: Readonly<CLPoolSnapshot>;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly feeAmount: bigint;
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
export interface CLSwapQuote {
  readonly sourceClass: "dex-execution-quote";
  readonly providerId: string;
  readonly coordinate: Readonly<ReadCoordinate>;
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
export interface CLSwapReader {
  quote(input: CLSwapQuoteInput): Promise<Readonly<CLSwapQuote>>;
}
