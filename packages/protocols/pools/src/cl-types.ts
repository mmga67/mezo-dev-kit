import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { CLAmounts, CLFees } from "./cl-math.ts";
/**
 * Sorted token addresses and tick spacing; spacing is distinct from a fee tier.
 */
export interface CLPoolKey {
  readonly token0: `0x${string}`;
  readonly token1: `0x${string}`;
  readonly tickSpacing: number;
}
/**
 * Explicit registry/RPC inputs for bounded pool, tick and position inspection.
 */
export interface CLPoolReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
/**
 * Sorted key/account plus bounded explicit NFT IDs and ticks at one optional block; no
 * exhaustive discovery is implied.
 */
export interface CLPoolReadInput {
  readonly key: CLPoolKey;
  readonly account: `0x${string}`;
  /** At most 16 explicit NFTs; no unbounded collection enumeration. */
  readonly tokenIds?: readonly bigint[];
  /** At most 32 additional tick boundaries; position boundaries are added automatically. */
  readonly ticks?: readonly number[];
  readonly blockNumber?: bigint;
}
/**
 * Initialized-boundary liquidity and fee growth. Net liquidity values are signed; fee indexes
 * use Q128.
 */
export interface CLTick {
  readonly tick: number;
  readonly liquidityGross: bigint;
  readonly liquidityNet: bigint;
  readonly stakedLiquidityNet: bigint;
  readonly feeGrowthOutside0X128: bigint;
  readonly feeGrowthOutside1X128: bigint;
  readonly initialized: boolean;
}
/**
 * Verified gauge identity/liveness and the supplied account's stake count; it does not by
 * itself identify an NFT depositor.
 */
export interface CLGaugeSnapshot {
  readonly address: `0x${string}`;
  readonly factory: `0x${string}`;
  readonly implementation: `0x${string}`;
  readonly voter: `0x${string}`;
  readonly rewardToken: `0x${string}`;
  readonly alive: boolean;
  readonly stakeCount: bigint;
}
/**
 * NFT principal/fee state with separate ERC-721 owner and nullable beneficial depositor.
 * Decrease credits owed balances before collection pays them.
 */
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
/**
 * Anchored CL pool graph, Q64.96 price, liquidity, bounded ticks/NFTs and separate
 * account/custody balances.
 */
export interface CLPoolSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
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
  /**
   * Square-root price in Q64.96 fixed point for token1/token0, not a decimal display price.
   */
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly unlocked: boolean;
  readonly liquidity: bigint;
  readonly stakedLiquidity: bigint;
  readonly maxLiquidityPerTick: bigint;
  readonly fee: bigint;
  readonly unstakedFee: bigint;
  readonly globalFee0X128: bigint;
  readonly globalFee1X128: bigint;
  readonly token0: Readonly<TokenSnapshot>;
  readonly token1: Readonly<TokenSnapshot>;
  readonly poolBalance0: bigint;
  readonly poolBalance1: bigint;
  readonly nativeBalance: bigint;
  readonly managerNativeBalance: bigint;
  readonly nftSupply: bigint;
  readonly writeCompatible: boolean;
  readonly ownedCount: bigint;
  readonly ticks: readonly Readonly<CLTick>[];
  readonly positions: readonly Readonly<CLPosition>[];
}
/**
 * Verified bounded CL reads. Missing pools reject; absent beneficial membership remains unknown
 * rather than inferred.
 */
export interface CLPoolReader {
  /**
   * Read the verified pool and bounded supplied ticks/NFTs at one block. Beneficial depositor
   * requires stake membership evidence.
   */
  read(input: CLPoolReadInput): Promise<Readonly<CLPoolSnapshot>>;
}
