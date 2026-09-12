import type { RpcTransport } from "@mezo-dev-kit/core";
import type { Address, Hash32 } from "@mezo-dev-kit/evm";
import type { NATIVE_ROUTES } from "./model.generated.ts";
export type NativeRouteId = (typeof NATIVE_ROUTES)[number]["id"];
export type NativeObservationTransport = Pick<
  RpcTransport,
  | "getChainId"
  | "getBlockNumber"
  | "getBlock"
  | "getReceipt"
  | "getTransaction"
  | "getCode"
  | "getStorage"
  | "read"
>;
export interface NativeReceiptAnchor {
  readonly transactionHash: Hash32;
  readonly blockNumber: bigint;
  readonly blockHash: Hash32;
}
export type NativeObserverErrorCode =
  | "InvalidInput"
  | "UnknownRoute"
  | "ChainMismatch"
  | "TransportFailure"
  | "InvalidEvidence"
  | "RegistryUnavailable"
  | "DeliveryUnproven";
export interface NativeObservationIssue {
  readonly code: NativeObserverErrorCode;
  readonly stage: string;
  readonly message: string;
}
export interface NativeTransferTuple {
  readonly sequence: bigint;
  readonly recipient: Address;
  readonly sender: Address;
  readonly sourceToken: Address;
  readonly destinationToken: Address;
  readonly amount: bigint;
  readonly targetChain: bigint | null;
}
export interface NativeReceiptObservation {
  readonly transactionHash: Hash32;
  readonly anchor: Readonly<NativeReceiptAnchor> | null;
  readonly state:
    "missing" | "included" | "confirmed" | "reverted" | "reorged" | "invalid" | "unavailable";
  readonly confirmations: bigint | null;
  readonly requiredConfirmations: bigint;
  readonly proof: "none" | "source-validated" | "payload-accepted" | "attested" | "delivered";
  readonly settlement: Readonly<{ gross: bigint; net: bigint; fee: bigint }> | null;
  readonly issue: Readonly<NativeObservationIssue> | null;
}
export interface NativeObserverConfig {
  readonly routeId: NativeRouteId;
  readonly sourceTransport: NativeObservationTransport;
  readonly destinationTransport: NativeObservationTransport;
  readonly sourceConfirmations: bigint;
  readonly destinationConfirmations: bigint;
  /** Raw CometBFT /block result, required for inbound balance attribution. */
  readonly getMezoConsensusBlock?: (blockNumber: bigint) => Promise<unknown>;
}
export interface NativeObserveInput {
  readonly sourceTransactionHash: Hash32;
  readonly destinationTransactionHashes: readonly Hash32[];
  readonly previous?: Readonly<{
    source?: NativeReceiptAnchor;
    destinations?: readonly NativeReceiptAnchor[];
  }>;
  /** Stops further requests. In-flight transport cancellation remains caller-owned. */
  readonly signal?: AbortSignal;
}
export interface NativeDeliveryObservation {
  readonly routeId: NativeRouteId;
  readonly state:
    | "source-pending"
    | "source-reverted"
    | "message-pending"
    | "destination-progress"
    | "completed"
    | "reorged"
    | "ambiguous";
  readonly tuple: Readonly<NativeTransferTuple> | null;
  readonly source: Readonly<NativeReceiptObservation>;
  readonly destinations: readonly Readonly<NativeReceiptObservation>[];
  readonly completionTransactions: readonly Hash32[];
  readonly coverage: "provided-receipts-and-historical-coordinates-only";
}
export interface NativeDeliveryObserver {
  observe(input: NativeObserveInput): Promise<Readonly<NativeDeliveryObservation>>;
}
