import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { ContractId } from "@mezo-dev-kit/contracts";
import type { Address } from "@mezo-dev-kit/evm";
import type { NativeRouteId } from "./native-types.ts";

export type NativeTransferTransport = Pick<
  RpcTransport,
  "getChainId" | "getBlockNumber" | "getBlock" | "getCode" | "getStorage" | "read" | "getBalance"
>;
export type NativeTransferErrorCode =
  | "InvalidInput"
  | "UnknownRoute"
  | "ChainMismatch"
  | "RuntimeMismatch"
  | "InvalidConfiguration"
  | "TransportFailure"
  | "ReorgDetected"
  | "StaleQuote"
  | "BoundExceeded"
  | "ApprovalRequired"
  | "InvalidEvidence";

/** Independent chain readers and a Mezo node's reported version; no signer or endpoint defaults. */
export interface NativeTransferReaderConfig {
  readonly routeId: NativeRouteId;
  readonly sourceTransport: NativeTransferTransport;
  readonly destinationTransport: NativeTransferTransport;
  /** Calls web3_clientVersion on the same Mezo provider. A report is not cryptographic engine proof. */
  readonly getMezoClientVersion: () => Promise<unknown>;
}
/** Explicit source base units, recipient, quote age and current fee-estimate bounds. */
export interface NativeTransferQuoteInput {
  readonly account: Address;
  readonly recipient: Address;
  readonly amount: bigint;
  /** Checked against the current estimate. The source call cannot enforce a future destination fee. */
  readonly maxEstimatedDestinationFee: bigint;
  /** Application-selected source native units retained for gas. The signer still owns gas/fee policy. */
  readonly sourceGasReserve: bigint;
  readonly maxSourceAgeBlocks: bigint;
  readonly maxDestinationAgeBlocks: bigint;
  readonly sourceBlockNumber?: bigint;
  readonly destinationBlockNumber?: bigint;
  readonly signal?: AbortSignal;
}
/** A verified bridge/token binding at one independently anchored chain coordinate. */
export interface NativeEndpointSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly contractId: ContractId;
  readonly bridge: Address;
  readonly token: Address;
  readonly decimals: number;
}
/** Current route state and estimated destination proceeds; this is not a delivery guarantee. */
export interface NativeTransferQuote {
  readonly routeId: NativeRouteId;
  readonly account: Address;
  readonly recipient: Address;
  readonly amount: bigint;
  readonly source: Readonly<NativeEndpointSnapshot>;
  readonly destination: Readonly<NativeEndpointSnapshot>;
  readonly sourceMinimum: bigint;
  /** null for the inbound ERC20 route; zero on the outbound route means no available capacity. */
  readonly sourceCapacity: bigint | null;
  readonly capacityResetBlock: bigint | null;
  readonly estimatedDestinationFee: bigint;
  readonly estimatedDestinationAmount: bigint;
  readonly maxEstimatedDestinationFee: bigint;
  readonly sourceGasReserve: bigint;
  readonly tokenBalance: bigint;
  readonly nativeBalance: bigint;
  readonly allowance: bigint;
  readonly maxSourceAgeBlocks: bigint;
  readonly maxDestinationAgeBlocks: bigint;
}
/** Signer-free current configuration, balance, allowance and destination-fee inspection. */
export interface NativeTransferReader {
  /** Verify both endpoints and return an anchored quote; missing approval is reported separately. */
  quote(input: NativeTransferQuoteInput): Promise<Readonly<NativeTransferQuote>>;
}
