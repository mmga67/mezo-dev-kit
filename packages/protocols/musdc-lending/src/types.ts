import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractAbiEntry, ContractAddress, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreReadBlock, CoreReadTransport, HexData, ReadCoordinate } from "@mezo-dev-kit/core";
import type { LendingAmount, LendingMarketState } from "./accounting.ts";
import type { LendingReadErrorCode } from "./errors.ts";
export type LendingAbiValue = string | bigint | readonly LendingAbiValue[];
export interface LendingCall {
  readonly abi: readonly ContractAbiEntry[];
  readonly functionName: string;
  readonly args: readonly LendingAbiValue[];
}
export interface LendingCodec {
  encodeRead(call: LendingCall): HexData;
  decodeRead(call: LendingCall & { readonly data: unknown }): unknown;
}
type Awaitable<T> = T | Promise<T>;
export interface LendingTransport extends Omit<CoreReadTransport, "getBlock"> {
  getBlock(
    blockNumber: bigint,
  ): Awaitable<(CoreReadBlock & { readonly timestamp: unknown }) | null | undefined>;
  getCode(request: ReadCoordinate & { readonly address: ContractAddress }): Awaitable<unknown>;
  getStorage(
    request: ReadCoordinate & { readonly address: ContractAddress; readonly slot: HexData },
  ): Awaitable<unknown>;
  /** Application-owned token read; must query this token/account at the exact coordinate. */
  getTokenBalance(
    request: ReadCoordinate & {
      readonly token: ContractAddress;
      readonly account: ContractAddress;
    },
  ): Awaitable<unknown>;
}
export interface LendingReaderConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly transport: LendingTransport;
  readonly codec: LendingCodec;
}
export type LendingReadValue<T> =
  | Readonly<{ status: "available"; value: Readonly<T> }>
  | Readonly<{
      status: "unavailable";
      error: Readonly<{ code: LendingReadErrorCode; field: string }>;
    }>;
export interface LendingPrice {
  readonly sourceClass: "protocol-oracle-state";
  readonly price: bigint;
  readonly publishedAt: bigint;
  readonly asOf: bigint;
  readonly maxAgeSeconds: bigint;
}
export interface LendingPosition {
  readonly supplyShares: LendingAmount<"Morpho-supply-shares">;
  readonly borrowShares: LendingAmount<"Morpho-borrow-shares">;
  readonly collateral: LendingAmount<"BTC-wei">;
}
export interface LendingSnapshot {
  readonly coordinate: ReadCoordinate;
  readonly asOf: bigint;
  readonly marketId: HexData;
  readonly account: ContractAddress;
  readonly evidence: Readonly<{ inputDigest: string; verifiedAt: string; reviewAfter: string }>;
  readonly storedMarket: Readonly<LendingMarketState>;
  readonly borrowRate: LendingReadValue<bigint>;
  readonly accruedMarket: LendingReadValue<
    LendingMarketState & { interest: bigint; feeShares: bigint }
  >;
  readonly position: LendingReadValue<LendingPosition>;
  readonly price: LendingReadValue<LendingPrice>;
  readonly supplyAssets: LendingReadValue<LendingAmount<"mUSDC">>;
  readonly debt: LendingReadValue<LendingAmount<"mUSDC-debt">>;
  readonly health: LendingReadValue<{
    healthy: boolean;
    maxBorrowAssets: bigint | null;
    reason: "zero-debt" | "evaluated";
  }>;
  readonly tokenLiquidity: LendingReadValue<LendingAmount<"mUSDC">>;
  readonly accountingLiquidity: LendingAmount<"mUSDC">;
}
export interface LendingReader {
  read(input: {
    readonly account: ContractAddress;
    readonly maxPriceAgeSeconds: bigint;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<LendingSnapshot>>;
}
