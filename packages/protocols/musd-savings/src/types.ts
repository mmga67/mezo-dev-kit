import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractAbiEntry, ContractAddress, ContractRegistry } from "@mezo-dev-kit/contracts";
import type { CoreReadTransport, HexData, ReadCoordinate } from "@mezo-dev-kit/core";

import type { SavingsAmount, SavingsYield } from "./accounting.ts";
import type { SavingsReadErrorCode } from "./errors.ts";

type Awaitable<T> = T | Promise<T>;

/**
 * Canonical read ABI, function name and ordered arguments supplied to the codec; decoding must
 * preserve ABI tuple order.
 */
export interface SavingsCall {
  readonly abi: readonly ContractAbiEntry[];
  readonly functionName: string;
  readonly args: readonly ContractAddress[];
}
/** The application supplies its reviewed ABI library through this small port. */
export interface SavingsReadCodec {
  /**
   * Encode the supplied canonical ABI function and positional arguments; reject unsupported
   * shapes.
   */
  encodeRead(call: SavingsCall): HexData;
  /**
   * Decode return data into untrusted values for Savings validation; do not coerce a decode
   * failure into an empty tuple.
   */
  decodeRead(call: SavingsCall & { readonly data: unknown }): unknown;
}
/**
 * Exact target and calldata at a pinned network/block/hash, including dynamically discovered
 * roles.
 */
export interface SavingsTransportReadRequest extends ReadCoordinate {
  readonly address: ContractAddress;
  readonly data: HexData;
}
/**
 * Application read port for exact block calls, code and storage. Returned values are validated
 * by the reader.
 */
export interface SavingsReadTransport extends Omit<CoreReadTransport, "read"> {
  /**
   * Read this exact target/calldata at the supplied network/block/hash and propagate failure.
   */
  read(request: Readonly<SavingsTransportReadRequest>): Awaitable<unknown>;
  /**
   * Return runtime bytes for this address at the exact coordinate; the reader owns hash
   * comparison.
   */
  getCode(request: Readonly<ReadCoordinate & { address: ContractAddress }>): Awaitable<unknown>;
  /**
   * Return one storage slot at the supplied coordinate; the reader owns proxy/layout
   * interpretation.
   */
  getStorage(
    request: Readonly<ReadCoordinate & { address: ContractAddress; slot: HexData }>,
  ): Awaitable<unknown>;
}
/**
 * Explicit registry and read/codec ports. Use createSavingsRpcReader for the existing Core
 * transport adapter.
 */
export interface SavingsReaderConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly transport: SavingsReadTransport;
  readonly codec: SavingsReadCodec;
}
/**
 * Available typed value or an explicit optional failure. Narrow status before accessing data;
 * unavailable is not zero.
 */
export type SavingsReadValue<T> =
  | Readonly<{ status: "available"; value: Readonly<T> }>
  | Readonly<{
      status: "unavailable";
      error: Readonly<{ code: SavingsReadErrorCode; field: string }>;
    }>;
/**
 * Wallet-held principal receipts and their MUSD yield; gauge custody is accounted separately.
 */
export interface SavingsWallet {
  readonly principalReceipts: SavingsAmount<"sMUSD">;
  readonly yield: SavingsYield;
}
export interface SavingsStrategy {
  readonly address: ContractAddress;
  readonly vault: ContractAddress;
  readonly token: ContractAddress;
}
export interface SavingsConverter {
  readonly address: ContractAddress;
  readonly implementationAddress: ContractAddress;
  readonly savings: ContractAddress;
  readonly musdToken: ContractAddress;
  readonly maxSlippageBps: bigint;
}
/**
 * Verified gauge custody and beneficial receipt balances. Gauge rewards and voter revenue are
 * separate from wallet Savings yield.
 */
export interface SavingsGauge {
  readonly address: ContractAddress;
  readonly stakingToken: ContractAddress;
  readonly rewardToken: ContractAddress;
  readonly voter: ContractAddress;
  readonly beneficialReceipts: SavingsAmount<"sMUSD">;
  readonly custodyReceipts: SavingsAmount<"sMUSD">;
  readonly totalStakedReceipts: SavingsAmount<"sMUSD">;
  /** Reward token identity is read from this gauge; no implicit MEZO assumption. */
  readonly earnedRewards: SavingsReadValue<SavingsAmount<"gauge-reward-token">>;
  /** This belongs to voters, not the account's Savings yield. */
  readonly cachedVoterRevenue: SavingsReadValue<SavingsAmount<"MUSD">>;
}
/**
 * One-coordinate Savings graph, wallet and gauge accounting with per-result availability and
 * retained evidence provenance.
 */
export interface SavingsSnapshot {
  readonly coordinate: ReadCoordinate;
  readonly account: ContractAddress;
  readonly savings: ContractAddress;
  readonly evidence: Readonly<{
    inputDigest: string;
    verifiedAt: string;
    reviewAfter: string;
    supportStatus: "proposed";
    reviewStatus: string;
  }>;
  readonly global: Readonly<{
    principalSupply: SavingsAmount<"sMUSD">;
    pendingYield: SavingsAmount<"MUSD">;
    yieldIndex: bigint;
    gaugeYieldClaimCap: SavingsAmount<"MUSD">;
  }>;
  readonly wallet: SavingsReadValue<SavingsWallet>;
  readonly strategy: SavingsReadValue<SavingsStrategy>;
  readonly converter: SavingsReadValue<SavingsConverter>;
  readonly gauge: SavingsReadValue<SavingsGauge>;
  readonly beneficialPrincipal: SavingsReadValue<SavingsAmount<"sMUSD">>;
}
/**
 * Signer-free anchored Savings inspection; optional failures remain explicit in the snapshot.
 */
export interface SavingsReader {
  /**
   * Read one account's Savings graph, principal and yield at one block; optional failures
   * retain unavailable results.
   */
  read(input: {
    readonly account: ContractAddress;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<SavingsSnapshot>>;
}
