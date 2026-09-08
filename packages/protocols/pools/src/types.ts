import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { BasicPoolFees } from "./fees.ts";

export interface BasicPoolKey {
  readonly token0: `0x${string}`;
  readonly token1: `0x${string}`;
  readonly stable: boolean;
}
export interface BasicPoolReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
}
export interface BasicPoolReadInput {
  readonly key: BasicPoolKey;
  readonly account: `0x${string}`;
  readonly blockNumber?: bigint;
}
export interface BasicPoolSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
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
  /** Initial verified writer assets are MUSD and mUSDC; other discovered pools remain readable. */
  readonly writeCompatible: boolean;
  readonly token0: Readonly<TokenSnapshot>;
  readonly token1: Readonly<TokenSnapshot>;
  readonly lp: Readonly<TokenSnapshot>;
}
export interface BasicPoolReader {
  read(input: BasicPoolReadInput): Promise<Readonly<BasicPoolSnapshot>>;
}
export type BasicLiquidityAction =
  | Readonly<{ kind: "add"; amount0Desired: bigint; amount1Desired: bigint }>
  | Readonly<{ kind: "remove"; liquidity: bigint }>;
export interface BasicLiquidityBounds {
  readonly minAmount0: bigint;
  readonly minAmount1: bigint;
  readonly minLiquidity: bigint;
  readonly deadline: bigint;
  readonly maxDeadlineSeconds: bigint;
  readonly maxBlockAge: bigint;
}
export interface BasicLiquidityForecast {
  readonly kind: "add" | "remove";
  readonly amount0: bigint;
  readonly amount1: bigint;
  readonly liquidity: bigint;
  readonly nextReserve0: bigint;
  readonly nextReserve1: bigint;
  readonly nextTotalSupply: bigint;
}
