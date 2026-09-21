import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractAbiEntry, ContractAddress, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreReadBlock, CoreReadTransport, HexData, ReadCoordinate } from "@mezo-dev-kit/core";
import type { LendingAmount, LendingMarketState } from "./accounting.ts";
import type { LendingReadErrorCode } from "./errors.ts";
export type LendingAbiValue = string | bigint | readonly LendingAbiValue[];
/**
 * Explicit ABI read with positional arguments; the codec does not establish deployment or
 * market identity.
 */
export interface LendingCall {
  readonly abi: readonly ContractAbiEntry[];
  readonly functionName: string;
  readonly args: readonly LendingAbiValue[];
}
/**
 * Small ABI port for lending reads. Decode into untrusted values; the domain reader owns
 * runtime validation.
 */
export interface LendingCodec {
  /**
   * Encode the supplied ABI/function and ordered arguments without redefining the domain ABI.
   */
  encodeRead(call: LendingCall): HexData;
  /**
   * Decode return data while preserving tuple order and failure; the reader validates the
   * resulting unknown values.
   */
  decodeRead(call: LendingCall & { readonly data: unknown }): unknown;
}
type Awaitable<T> = T | Promise<T>;
/**
 * Exact-coordinate market, runtime, storage and token-balance ports. Implementations must not
 * silently read a different head.
 */
export interface LendingTransport extends Omit<CoreReadTransport, "getBlock"> {
  /**
   * Return the requested block including untrusted timestamp for anchored accrual and freshness
   * checks.
   */
  getBlock(
    blockNumber: bigint,
  ): Awaitable<(CoreReadBlock & { readonly timestamp: unknown }) | null | undefined>;
  /**
   * Return runtime bytes at the exact coordinate; do not substitute current-head code.
   */
  getCode(request: ReadCoordinate & { readonly address: ContractAddress }): Awaitable<unknown>;
  /**
   * Read the exact slot at the supplied coordinate; interpretation belongs to the domain
   * reader.
   */
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
/**
 * Registry and explicit read/codec dependencies. The reader obtains oracle state and applies
 * the caller-supplied age policy.
 */
export interface LendingReaderConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly transport: LendingTransport;
  readonly codec: LendingCodec;
}
/**
 * Typed available value or explicit optional-read failure. An unavailable price/debt/position
 * must not become zero.
 */
export type LendingReadValue<T> =
  | Readonly<{ status: "available"; value: Readonly<T> }>
  | Readonly<{
      status: "unavailable";
      error: Readonly<{ code: LendingReadErrorCode; field: string }>;
    }>;
/**
 * Protocol-oracle state in the market price scale, with Unix-second publication/asOf and
 * explicit maximum age.
 */
export interface LendingPrice {
  readonly sourceClass: "protocol-oracle-state";
  /**
   * Market oracle scale including token-unit adjustment; do not pass a display USD/BTC price.
   */
  readonly price: bigint;
  readonly publishedAt: bigint;
  readonly asOf: bigint;
  readonly maxAgeSeconds: bigint;
}
/**
 * Supply and borrow shares plus BTC collateral. Convert shares using matching market totals and
 * operation-specific rounding.
 */
export interface LendingPosition {
  readonly supplyShares: LendingAmount<"Morpho-supply-shares">;
  readonly borrowShares: LendingAmount<"Morpho-borrow-shares">;
  readonly collateral: LendingAmount<"BTC-wei">;
}
/**
 * One-coordinate stored/accrued market and account state. Optional components preserve failure
 * status; accounting liquidity differs from token custody.
 */
export interface LendingSnapshot {
  readonly coordinate: ReadCoordinate;
  /**
   * Unix seconds from the selected block, used for interest and price-age evaluation.
   */
  readonly asOf: bigint;
  readonly marketId: HexData;
  readonly account: ContractAddress;
  readonly evidence: Readonly<{ inputDigest: string; verifiedAt: string; reviewAfter: string }>;
  readonly storedMarket: Readonly<LendingMarketState>;
  /**
   * Per-second interest rate scaled by 1e18; not an annual rate.
   */
  readonly borrowRate: LendingReadValue<bigint>;
  readonly accruedMarket: LendingReadValue<
    LendingMarketState & { interest: bigint; feeShares: bigint }
  >;
  readonly position: LendingReadValue<LendingPosition>;
  /** Present in current reader output; optional for compatibility with older stored snapshots. */
  readonly feeRecipient?: LendingReadValue<ContractAddress>;
  readonly price: LendingReadValue<LendingPrice>;
  readonly supplyAssets: LendingReadValue<LendingAmount<"mUSDC">>;
  readonly debt: LendingReadValue<LendingAmount<"mUSDC-debt">>;
  readonly health: LendingReadValue<{
    healthy: boolean;
    maxBorrowAssets: bigint | null;
    reason: "zero-debt" | "evaluated";
  }>;
  readonly tokenLiquidity: LendingReadValue<LendingAmount<"mUSDC">>;
  /**
   * Supply minus borrow accounting totals; actual token liquidity is reported separately.
   */
  readonly accountingLiquidity: LendingAmount<"mUSDC">;
}
/**
 * Anchored market and borrower reads under an explicit maximum price age. Returned health
 * distinguishes zero debt from evaluated collateral.
 */
export interface LendingReader {
  /**
   * Read and accrue market/account state at one block, with explicit maximum oracle age in
   * seconds. Optional failures remain visible.
   */
  read(input: {
    readonly account: ContractAddress;
    readonly maxPriceAgeSeconds: bigint;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<LendingSnapshot>>;
}
