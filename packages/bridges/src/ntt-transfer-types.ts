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
export interface NttEndpointSnapshot {
  readonly coordinate: Readonly<ReadCoordinate>;
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
export interface NttTransferReaderConfig {
  readonly routeId: NttRouteId;
  readonly sourceTransport: NttTransferTransport;
  readonly destinationTransport: NttTransferTransport;
}
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
export interface NttTransferReader {
  quote(input: NttTransferQuoteInput): Promise<Readonly<NttTransferQuote>>;
}
