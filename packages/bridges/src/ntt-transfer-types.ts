import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { Address, HexData } from "@mezo-dev-kit/evm";
import type { NttRouteId } from "./types.ts";

export type NttTransferTransport = Pick<
  RpcTransport,
  | "getChainId"
  | "getBlockNumber"
  | "getBlock"
  | "getCode"
  | "getStorage"
  | "read"
  | "getBalance"
  | "getBlockTimestamp"
>;
export type NttTransferErrorCode =
  | "InvalidInput"
  | "UnknownRoute"
  | "ChainMismatch"
  | "InvalidConfiguration"
  | "RuntimeMismatch"
  | "TransportFailure"
  | "ReorgDetected"
  | "StaleQuote"
  | "AmountHasDust"
  | "BoundExceeded"
  | "ApprovalRequired"
  | "InvalidEvidence"
  | "RecoveryUnavailable";
/**
 * Verified endpoint state at its own chain coordinate. Capacities use endpoint token units;
 * timestamp/rate-limit duration use seconds.
 */
export interface NttEndpointSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
  readonly timestamp: bigint;
  readonly manager: Address;
  readonly transceiver: Address;
  readonly token: Address;
  readonly decimals: number;
  readonly mode: "locking" | "burning";
  readonly managerPaused: boolean;
  readonly transceiverPaused: boolean;
  readonly transceiverIndex: bigint;
  readonly outboundCapacity: bigint;
  readonly inboundCapacity: bigint;
  readonly rateLimitDuration: bigint;
  readonly nextSequence: bigint;
  readonly standardRelayingEnabled: boolean;
  readonly specialRelayingEnabled: boolean;
  readonly wormholeEvmChain: boolean;
}
/**
 * One explicit route with separate source/destination read ports. The two chains have
 * independent coordinates.
 */
export interface NttTransferReaderConfig {
  readonly routeId: NttRouteId;
  readonly sourceTransport: NttTransferTransport;
  readonly destinationTransport: NttTransferTransport;
}
/**
 * Explicit sender/recipients, source-token base units, queue preference and per-chain age
 * bounds. Native fee uses source-native base units.
 */
export interface NttTransferQuoteInput {
  readonly account: Address;
  readonly recipient: Address;
  readonly refundRecipient: Address;
  readonly amount: bigint;
  readonly shouldQueue: boolean;
  readonly maxNativeFee: bigint;
  readonly maxSourceAgeBlocks: bigint;
  readonly maxDestinationAgeBlocks: bigint;
  readonly sourceBlockNumber?: bigint;
  readonly destinationBlockNumber?: bigint;
  readonly signal?: AbortSignal;
}
/**
 * Current endpoint/fee/capacity quote. Source, destination and trimmed amounts retain different
 * decimal scales; a queue prediction is not delivery proof.
 */
export interface NttTransferQuote {
  readonly routeId: NttRouteId;
  readonly account: Address;
  readonly recipient: Address;
  readonly refundRecipient: Address;
  readonly amount: bigint;
  readonly destinationAmount: bigint;
  readonly trimmedAmount: bigint;
  readonly trimmedDecimals: number;
  readonly packedAmount: bigint;
  readonly shouldQueue: boolean;
  readonly source: Readonly<NttEndpointSnapshot>;
  readonly destination: Readonly<NttEndpointSnapshot>;
  /** Explicit manual Wormhole publication. Off-chain delivery may still occur; no SLA. */
  readonly relayMode: "manual";
  readonly instructions: HexData;
  readonly nativeFee: bigint;
  readonly maxNativeFee: bigint;
  readonly nativeBalance: bigint;
  readonly tokenBalance: bigint;
  readonly allowance: bigint;
  readonly sourceWouldQueue: boolean;
  readonly destinationWouldQueue: boolean;
  readonly maxSourceAgeBlocks: bigint;
  readonly maxDestinationAgeBlocks: bigint;
}
/**
 * Signer-free current NTT quote inspection. Runtime/peer/capacity verification is separate from
 * historical delivery observation.
 */
export interface NttTransferReader {
  /**
   * Verify both current endpoints and calculate source/destination/trimmed amounts, fee and
   * queue disposition; no transfer is submitted.
   */
  quote(input: NttTransferQuoteInput): Promise<Readonly<NttTransferQuote>>;
}
