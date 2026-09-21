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
/**
 * Native Bridge receipt inclusion identity retained for later canonicality checks.
 */
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
/**
 * Source-validated sequence, participants, token mapping and amount used to join delivery
 * evidence; asset units follow the route.
 */
export interface NativeTransferTuple {
  readonly sequence: bigint;
  readonly recipient: Address;
  readonly sender: Address;
  readonly sourceToken: Address;
  readonly destinationToken: Address;
  readonly amount: bigint;
  readonly targetChain: bigint | null;
}
/**
 * One receipt candidate with staged proof and optional token settlement. Accepted payload or
 * attestation alone need not prove delivery.
 */
export interface NativeReceiptObservation {
  readonly transactionHash: Hash32;
  readonly anchor: Readonly<NativeReceiptAnchor> | null;
  readonly state:
    "missing" | "included" | "confirmed" | "reverted" | "reorged" | "invalid" | "unavailable";
  readonly confirmations: bigint | null;
  readonly requiredConfirmations: bigint;
  readonly proof:
    | "none"
    | "source-validated"
    | "payload-accepted"
    | "attested"
    | "delivered"
    | "governance-recovery-required";
  readonly settlement: Readonly<{ gross: bigint; net: bigint; fee: bigint }> | null;
  readonly issue: Readonly<NativeObservationIssue> | null;
}
/**
 * Route-specific read dependencies and confirmation policy; inbound balance attribution
 * additionally requires consensus-block coverage.
 */
export interface NativeObserverConfig {
  readonly routeId: NativeRouteId;
  readonly sourceTransport: NativeObservationTransport;
  readonly destinationTransport: NativeObservationTransport;
  readonly sourceConfirmations: bigint;
  readonly destinationConfirmations: bigint;
  /** Raw CometBFT /block result, required for inbound balance attribution. */
  readonly getMezoConsensusBlock?: (blockNumber: bigint) => Promise<unknown>;
}
/** Current-generation observation also checks the Mezo provider's reported execution version. */
export interface NativeCurrentObserverConfig extends NativeObserverConfig {
  readonly getMezoClientVersion: () => Promise<unknown>;
}
/**
 * Explicit source and destination receipt candidates plus optional prior anchors. Cancellation
 * stops further requests, not necessarily in-flight I/O.
 */
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
/**
 * Joined Native Bridge evidence within provided receipts and the selected historical or
 * current runtime coverage. Source confirmation remains separate from recipient payment.
 */
export interface NativeDeliveryObservation {
  readonly routeId: NativeRouteId;
  readonly state:
    | "source-pending"
    | "source-reverted"
    | "message-pending"
    | "destination-progress"
    | "completed"
    | "governance-recovery-required"
    | "reorged"
    | "ambiguous";
  readonly tuple: Readonly<NativeTransferTuple> | null;
  readonly source: Readonly<NativeReceiptObservation>;
  readonly destinations: readonly Readonly<NativeReceiptObservation>[];
  readonly completionTransactions: readonly Hash32[];
  readonly coverage:
    | "provided-receipts-and-historical-coordinates-only"
    | "provided-receipts-and-current-runtime-only";
}
/**
 * Read-only Native delivery inspection with route-specific settlement proof and canonical
 * anchor checks.
 */
export interface NativeDeliveryObserver {
  /**
   * Validate source tuple and route-specific destination settlement within explicit
   * candidates and selected generation coverage, rechecking canonical anchors.
   */
  observe(input: NativeObserveInput): Promise<Readonly<NativeDeliveryObservation>>;
}
