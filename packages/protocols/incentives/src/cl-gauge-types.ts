import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
/** Incentives' required subset of a verified pool position; Pools retains discovery/fee math. */
export interface CLGaugePositionState {
  readonly tokenId: bigint;
  readonly owner: `0x${string}`;
  readonly approved: `0x${string}`;
  readonly staked: boolean;
  readonly beneficialDepositor: `0x${string}` | null;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly liquidity: bigint;
  readonly lastInside0X128: bigint;
  readonly lastInside1X128: bigint;
  readonly tokensOwed0: bigint;
  readonly tokensOwed1: bigint;
  readonly fees0: Readonly<{ insideX128: bigint; tokensOwed: bigint; overflowed: boolean }>;
  readonly fees1: Readonly<{ insideX128: bigint; tokensOwed: bigint; overflowed: boolean }>;
}
/**
 * Verified Pools projection consumed by Incentives. Pools owns discovery/fee math; this port
 * preserves coordinate and custody evidence.
 */
export interface CLGaugePoolState {
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
  readonly timestamp: bigint;
  readonly account: `0x${string}`;
  readonly key: Readonly<{ token0: `0x${string}`; token1: `0x${string}`; tickSpacing: number }>;
  readonly factory: Readonly<ResolvedContract>;
  readonly implementation: Readonly<ResolvedContract>;
  readonly manager: Readonly<ResolvedContract>;
  readonly pool: `0x${string}`;
  readonly gauge: Readonly<{
    address: `0x${string}`;
    factory: `0x${string}`;
    implementation: `0x${string}`;
    voter: `0x${string}`;
    rewardToken: `0x${string}`;
    alive: boolean;
    stakeCount: bigint;
  }> | null;
  /**
   * Square-root price in Q64.96 fixed point for token1/token0, not a decimal display price.
   */
  readonly sqrtPriceX96: bigint;
  readonly tick: number;
  readonly unlocked: boolean;
  readonly liquidity: bigint;
  readonly stakedLiquidity: bigint;
  readonly globalFee0X128: bigint;
  readonly globalFee1X128: bigint;
  readonly token0: Readonly<TokenSnapshot>;
  readonly token1: Readonly<TokenSnapshot>;
  readonly poolBalance0: bigint;
  readonly poolBalance1: bigint;
  readonly nativeBalance: bigint;
  readonly nftSupply: bigint;
  readonly ownedCount: bigint;
  readonly writeCompatible: boolean;
  readonly ticks: readonly Readonly<{
    tick: number;
    liquidityGross: bigint;
    liquidityNet: bigint;
    stakedLiquidityNet: bigint;
    feeGrowthOutside0X128: bigint;
    feeGrowthOutside1X128: bigint;
    initialized: boolean;
  }>[];
  readonly positions: readonly Readonly<CLGaugePositionState>[];
}
/** Bind a verified Pools CL reader to one selected key. This port must preserve its verification contract. */
export interface CLGaugePositionReader {
  /**
   * Return the verified Pools position projection at the requested block; preserve its
   * identity, fee and custody guarantees.
   */
  read(input: {
    readonly account: `0x${string}`;
    readonly tokenIds: readonly bigint[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<CLGaugePoolState>>;
}
/**
 * Gauge reward growth/accounting at one coordinate. Growth uses Q128; payout/rate values retain
 * reward-token base units.
 */
export interface CLGaugeRewardState {
  readonly rewardRate: bigint;
  readonly periodFinish: bigint;
  readonly globalX128: bigint;
  readonly reserve: bigint;
  readonly rollover: bigint;
  readonly lastUpdated: bigint;
  readonly lowerOutsideX128: bigint;
  readonly upperOutsideX128: bigint;
  readonly positionInsideX128: bigint;
  readonly positionLastUpdate: bigint;
  readonly stored: bigint;
}
/**
 * Verified pool/NFT/gauge state with explicit beneficial custody and reward entitlement; raw
 * gauge ownership is insufficient.
 */
export interface CLGaugeState {
  readonly pool: Readonly<CLGaugePoolState>;
  readonly position: Readonly<CLGaugePositionState>;
  readonly contract: Readonly<ResolvedContract>;
  readonly gauge: `0x${string}`;
  readonly staked: boolean;
  readonly gaugeApproved: boolean;
  readonly operatorApproved: boolean;
  readonly reward: Readonly<TokenSnapshot>;
  readonly rewardCustody: bigint;
  /** Newly accrued only; the deployed earned() getter excludes stored rewards. */
  readonly earned: bigint;
  readonly rewards: Readonly<CLGaugeRewardState>;
}
/**
 * Anchored one-NFT gauge custody and reward reads over the verified Pools position port.
 */
export interface CLGaugeReader {
  /**
   * Verify one NFT's gauge membership, beneficial depositor and reward state through the
   * anchored Pools reader.
   */
  read(input: {
    readonly account: `0x${string}`;
    readonly tokenId: bigint;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<CLGaugeState>>;
}
/**
 * Incentives dependencies plus an injected verified Pools position reader; avoid duplicating
 * pool discovery.
 */
export interface CLGaugeReaderConfig {
  readonly positions: CLGaugePositionReader;
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
/**
 * Separate NFT approval, stake, unstake or reward claim. Approval alone does not transfer
 * beneficial custody.
 */
export type CLGaugeAction = "approve" | "stake" | "unstake" | "claim-reward";
/**
 * Independent reward/token0/token1 payout minimums plus block age; each amount uses its own
 * token units.
 */
export interface CLGaugeBounds {
  readonly minReward: bigint;
  readonly minFee0: bigint;
  readonly minFee1: bigint;
  /**
   * Maximum accepted preparation age in blocks, checked by the owning operation.
   */
  readonly maxBlockAge: bigint;
}
/**
 * Expected custody and reward/pool-fee effects of one action. Accounting caps and actual token
 * payments can differ.
 */
export interface CLGaugeForecast {
  readonly action: CLGaugeAction;
  readonly reward: bigint;
  readonly feeCap0: bigint;
  readonly feeCap1: bigint;
  readonly activeStakeDelta: bigint;
  readonly stakeDelta: bigint;
  readonly rewardsAfter: Readonly<CLGaugeRewardState>;
}
