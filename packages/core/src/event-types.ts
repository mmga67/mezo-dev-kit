import type { NetworkId } from "@mezo-dev-kit/chains";
import type { ContractId, ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import type { RpcRequest } from "./rpc.ts";

export type EventTopics = readonly (null | `0x${string}` | readonly `0x${string}`[])[];
/**
 * Explicit finality, chunk and total-work limits for one scan; successful bounded work need not
 * exhaust the requested range.
 */
export interface EventScanPolicy {
  readonly blocksPerPage: number;
  readonly maxPages: number;
  /** A response at this limit is potentially truncated and never establishes coverage. */
  readonly maxLogsPerPage: number;
  readonly maxLogDataBytes: number;
  readonly overlapBlocks: number;
  readonly confirmations: bigint;
  readonly requestTimeoutMs: number;
}
/**
 * Scanner dependencies and fixed policies. Applications own persistence, scheduling and
 * continuation of returned checkpoints.
 */
export interface EventScannerConfig {
  readonly networkId: NetworkId;
  readonly registry: ContractRegistry;
  readonly request: RpcRequest;
  readonly providerId: string;
  /** Application-owned evidence for this provider's history and log-query limits. */
  readonly capabilityEvidenceId: string;
  readonly policy: EventScanPolicy;
}
/**
 * Block number/hash used to detect changed canonical history before trusting a retained scan
 * result.
 */
export interface EventAnchor {
  readonly blockNumber: string;
  readonly blockHash: `0x${string}`;
}
/** JSON-safe candidate. The caller atomically commits events, coverage and this value. */
export interface EventCheckpoint {
  readonly schemaVersion: 1;
  readonly queryId: string;
  readonly fromBlock: string;
  readonly throughBlock: string;
  readonly anchors: readonly EventAnchor[];
}
/**
 * Explicit event filter, block range and optional checkpoint. Coverage is limited by the
 * configured work budget.
 */
export interface EventScanInput {
  readonly contractId: ContractId;
  readonly topics: EventTopics;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly observedAt: bigint;
  readonly maxHeadAgeSeconds: bigint;
  readonly checkpoint?: unknown;
  readonly signal?: AbortSignal;
}
/**
 * Validated log plus stable block/transaction/log identity; its domain meaning still requires
 * ABI decoding.
 */
export interface ScannedEvent {
  readonly id: string;
  readonly address: `0x${string}`;
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly transactionHash: `0x${string}`;
  readonly transactionIndex: bigint;
  readonly logIndex: bigint;
  readonly topics: readonly `0x${string}`[];
  readonly data: `0x${string}`;
}
/**
 * Inclusive block coverage reported by the scanner. A bounded range does not imply
 * exhaustive history beyond these endpoints.
 */
export interface EventRange {
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}
export type EventScanIssue =
  | "provider-failure"
  | "timeout"
  | "aborted"
  | "log-limit"
  | "page-limit"
  | "unconfirmed"
  | "stale-head"
  | "invalid-response"
  | "chain-mismatch"
  | "source-changed"
  | "reorg";
/**
 * Bounded scan results, coverage, issues and continuation evidence. Persisted status alone
 * cannot prove completeness or current canonicality.
 */
export interface EventScanResult {
  readonly status: "complete" | "partial" | "unknown" | "reorged";
  readonly queryId: string;
  readonly source: Readonly<ResolvedContract>;
  readonly providerId: string;
  readonly capabilityEvidenceId: string;
  readonly observedAt: bigint;
  readonly requested: Readonly<EventRange>;
  /** Previous coverage claimed by the caller's checkpoint; only its overlap is reverified. */
  readonly resumedThrough: bigint | null;
  /** Coverage established by this invocation, including any re-read overlap. */
  readonly covered: Readonly<EventRange> | null;
  readonly gaps: readonly Readonly<EventRange>[];
  readonly confirmedHead: bigint | null;
  readonly events: readonly Readonly<ScannedEvent>[];
  readonly checkpoint: Readonly<EventCheckpoint> | null;
  readonly issue: EventScanIssue | null;
  readonly reorg: Readonly<{
    rollbackTo: Readonly<EventAnchor> | null;
    invalidatedFrom: bigint;
  }> | null;
}
/**
 * Bounded, reorg-aware event scanning over an injected provider, without automatic persistence
 * or background backfills.
 */
export interface EventScanner {
  /**
   * Scan within explicit page/log/block limits and return coverage plus continuation evidence.
   * Recheck retained anchors; do not infer completeness from a checkpoint.
   */
  scan(input: EventScanInput): Promise<Readonly<EventScanResult>>;
}
