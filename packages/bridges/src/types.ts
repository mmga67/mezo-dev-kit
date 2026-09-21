import type { ExecutionTransport } from "@mezo-dev-kit/core";
import type { Hash32 } from "@mezo-dev-kit/evm";
import type { NTT_ROUTES } from "./model.generated.ts";
import type { NttObserverErrorCode } from "./errors.ts";

export type NttRouteId = (typeof NTT_ROUTES)[number]["id"];
/** Receipt-only port, structurally satisfied by Core's RPC transport. No signer or write methods. */
export type NttObservationTransport = Pick<
  ExecutionTransport,
  "getChainId" | "getBlockNumber" | "getBlock" | "getReceipt"
>;
/**
 * Transaction inclusion identity retained for later reorg checks; number and hash must travel
 * together.
 */
export interface NttReceiptAnchor {
  readonly transactionHash: Hash32;
  readonly blockNumber: bigint;
  readonly blockHash: Hash32;
}
/**
 * Typed evidence failure at an observation stage. Preserve the distinction from a confirmed
 * on-chain revert.
 */
export interface NttObservationIssue {
  readonly code: NttObserverErrorCode;
  readonly stage: string;
  readonly message: string;
}
/**
 * One candidate receipt and its current confirmation/evidence state. Retained digest evidence
 * on a reorged receipt is not canonical delivery.
 */
export interface NttReceiptObservation {
  readonly transactionHash: Hash32;
  readonly state:
    "missing" | "included" | "confirmed" | "reverted" | "reorged" | "invalid" | "unavailable";
  readonly anchor: Readonly<NttReceiptAnchor> | null;
  readonly confirmations: bigint | null;
  readonly requiredConfirmations: bigint;
  readonly evidence: "none" | "sent" | "outbound-queued" | "inbound-queued" | "redeemed";
  readonly digest: Hash32 | null;
  readonly issue: Readonly<NttObservationIssue> | null;
}
/**
 * Explicit route, per-chain receipt ports and positive confirmation counts; no signer is used.
 */
export interface NttObserverConfig {
  readonly routeId: NttRouteId;
  readonly sourceTransport: NttObservationTransport;
  readonly destinationTransport: NttObservationTransport;
  readonly sourceConfirmations: bigint;
  readonly destinationConfirmations: bigint;
}
/**
 * One source hash and a bounded candidate destination set, with optional prior anchors for
 * reorg detection.
 */
export interface NttObserveInput {
  readonly sourceTransactionHash: Hash32;
  /** Exhaustive only within the caller's explicit candidate set, at most 32 unique hashes. */
  readonly destinationTransactionHashes: readonly Hash32[];
  /** Select one message when a source transaction sends multiple messages on this route. */
  readonly expectedDigest?: Hash32;
  readonly previous?: Readonly<{
    readonly source?: NttReceiptAnchor;
    readonly destinations?: readonly NttReceiptAnchor[];
  }>;
}
/**
 * Joined evidence within the provided candidate receipts only. Completed requires canonical
 * confirmed source and matching destination redemption.
 */
export interface NttDeliveryObservation {
  readonly routeId: NttRouteId;
  readonly state:
    | "source-pending"
    | "source-reverted"
    | "source-queued"
    | "message-pending"
    | "destination-queued"
    | "completed"
    | "reorged"
    | "ambiguous";
  readonly digest: Hash32 | null;
  readonly source: Readonly<NttReceiptObservation>;
  readonly destinations: readonly Readonly<NttReceiptObservation>[];
  /** Only confirmed, canonical, matching redemptions appear here. */
  readonly completionTransactions: readonly Hash32[];
  readonly issues: readonly Readonly<NttObservationIssue>[];
  readonly coverage: "provided-receipts-only";
}
/**
 * Bounded receipt-only observation. Applications discover candidate hashes and persist/recheck
 * returned anchors.
 */
export interface NttDeliveryObserver {
  /**
   * Join the explicit receipt candidates by NTT digest and recheck both chain anchors. Missing
   * candidates do not prove transfer failure.
   */
  observe(input: NttObserveInput): Promise<Readonly<NttDeliveryObservation>>;
}
