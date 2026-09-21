import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { BasicPoolFees } from "./fees.ts";

/**
 * Sorted distinct token addresses plus stable/volatile discriminator; a key does not prove a
 * pool exists.
 */
export interface BasicPoolKey {
  readonly token0: `0x${string}`;
  readonly token1: `0x${string}`;
  readonly stable: boolean;
}
/**
 * Explicit mainnet registry and RPC inputs for verified pool discovery.
 */
export interface BasicPoolReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}
/**
 * Sorted key and account at an optional explicit block; omitted block selects a head.
 */
export interface BasicPoolReadInput {
  readonly key: BasicPoolKey;
  readonly account: `0x${string}`;
  readonly blockNumber?: bigint;
}
/**
 * Anchored pool/reserve/fee state with separate wallet and raw custody balances.
 * Token0/token1/LP units remain distinct.
 */
export interface BasicPoolSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
  readonly timestamp: bigint;
  readonly providerId: string;
  readonly key: Readonly<BasicPoolKey>;
  readonly account: `0x${string}`;
  readonly router: `0x${string}`;
  readonly factory: `0x${string}`;
  readonly factoryRegistry: `0x${string}`;
  readonly implementation: `0x${string}`;
  readonly pool: `0x${string}`;
  readonly poolFees: `0x${string}`;
  readonly fees: Readonly<BasicPoolFees>;
  readonly paused: boolean;
  readonly feeBps: bigint;
  readonly reserve0: bigint;
  readonly reserve1: bigint;
  readonly reserveTimestamp: bigint;
  readonly poolBalance0: bigint;
  readonly poolBalance1: bigint;
  readonly totalSupply: bigint;
  readonly poolLpBalance: bigint;
  /**
   * Whether verified assets match the current writer profile; broader pools can remain
   * readable.
   */
  readonly writeCompatible: boolean;
  readonly token0: Readonly<TokenSnapshot>;
  readonly token1: Readonly<TokenSnapshot>;
  readonly lp: Readonly<TokenSnapshot>;
}
/**
 * Verified basic-pool and account reads; readability and writer compatibility are separate
 * properties.
 */
export interface BasicPoolReader {
  /**
   * Discover and verify the sorted pool key, then read account/reserve/fee state at one block.
   * A missing pool rejects.
   */
  read(input: BasicPoolReadInput): Promise<Readonly<BasicPoolSnapshot>>;
}
/**
 * Desired token0/token1 maxima for add, or exact LP base units for remove.
 */
export type BasicLiquidityAction =
  | Readonly<{ kind: "add"; amount0Desired: bigint; amount1Desired: bigint }>
  | Readonly<{ kind: "remove"; liquidity: bigint }>;
/**
 * Token-specific minimums, LP minimum, Unix-second deadline and block-age policy; LP minimum is
 * a simulation check.
 */
export interface BasicLiquidityBounds {
  readonly minAmount0: bigint;
  readonly minAmount1: bigint;
  readonly minLiquidity: bigint;
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
 * Floor-aware expected token/LP amounts and resulting reserves/supply, without executing a
 * deposit or removal.
 */
export interface BasicLiquidityForecast {
  readonly kind: "add" | "remove";
  readonly amount0: bigint;
  readonly amount1: bigint;
  readonly liquidity: bigint;
  readonly nextReserve0: bigint;
  readonly nextReserve1: bigint;
  readonly nextTotalSupply: bigint;
}
