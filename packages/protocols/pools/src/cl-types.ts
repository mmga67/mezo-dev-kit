import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { CLAmounts, CLFees } from "./cl-math.ts";
export interface CLPoolKey {
  readonly token0: `0x${string}`;
  readonly token1: `0x${string}`;
  readonly tickSpacing: number;
}
export interface CLPoolReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
export interface CLPoolReadInput {
  readonly key: CLPoolKey;
  readonly account: `0x${string}`;
  /** At most 16 explicit NFTs; no unbounded collection enumeration. */
  readonly tokenIds?: readonly bigint[];
  /** At most 32 additional tick boundaries; position boundaries are added automatically. */
  readonly ticks?: readonly number[];
  readonly blockNumber?: bigint;
}
export interface CLTick {
  readonly tick: number;
  readonly liquidityGross: bigint;
  readonly liquidityNet: bigint;
  readonly stakedLiquidityNet: bigint;
  readonly feeGrowthOutside0X128: bigint;
  readonly feeGrowthOutside1X128: bigint;
  readonly initialized: boolean;
}
export interface CLGaugeSnapshot {
  readonly address: `0x${string}`;
  readonly factory: `0x${string}`;
  readonly implementation: `0x${string}`;
  readonly voter: `0x${string}`;
  readonly rewardToken: `0x${string}`;
  readonly alive: boolean;
  readonly stakeCount: bigint;
}
export interface CLPosition {
  readonly tokenId: bigint;
  readonly owner: `0x${string}`;
  readonly approved: `0x${string}`;
  readonly callerApproved: boolean;
  readonly staked: boolean;
  /** Gauge custody requires proof from the supplied account's stake set; otherwise null. */
  readonly beneficialDepositor: `0x${string}` | null;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: bigint;
  readonly lastInside0X128: bigint;
  readonly lastInside1X128: bigint;
  readonly tokensOwed0: bigint;
  readonly tokensOwed1: bigint;
  readonly fees0: Readonly<CLFees>;
  readonly fees1: Readonly<CLFees>;
  readonly principal: Readonly<CLAmounts>;
  readonly gaugeReward: bigint | null;
}
export interface CLPoolSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly account: `0x${string}`;
  readonly providerId: string;
  readonly key: Readonly<CLPoolKey>;
  readonly factory: Readonly<ResolvedContract>;
  readonly implementation: Readonly<ResolvedContract>;
  readonly manager: Readonly<ResolvedContract>;
  readonly factoryRegistry: Readonly<ResolvedContract>;
  readonly factoryApproved: boolean;
  readonly pool: `0x${string}`;
  readonly gauge: Readonly<CLGaugeSnapshot> | null;
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly unlocked: boolean;
  readonly liquidity: bigint;
  readonly stakedLiquidity: bigint;
  readonly fee: bigint;
  readonly unstakedFee: bigint;
  readonly globalFee0X128: bigint;
  readonly globalFee1X128: bigint;
  readonly token0: Readonly<TokenSnapshot>;
  readonly token1: Readonly<TokenSnapshot>;
  readonly poolBalance0: bigint;
  readonly poolBalance1: bigint;
  readonly nativeBalance: bigint;
  readonly ownedCount: bigint;
  readonly ticks: readonly Readonly<CLTick>[];
  readonly positions: readonly Readonly<CLPosition>[];
}
export interface CLPoolReader {
  read(input: CLPoolReadInput): Promise<Readonly<CLPoolSnapshot>>;
}
