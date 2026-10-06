/** Candidate schema version 1. Captures never accept or promote canonical evidence. */
export type EvidenceRecipe =
  "network.identity" | "runtime.current" | "price.skip" | "incentives.configuration";
export type EvidenceFreshness = "fresh" | "stale" | "future" | "missing" | "not-evaluated";
export type EvidenceFailure =
  | "wrong-chain"
  | "invalid-price"
  | "runtime-changed"
  | "configuration-changed"
  | "unsupported-codec"
  | "reorg"
  | "invalid-response"
  | "transport-error"
  | "rpc-error"
  | "timeout"
  | "response-too-large"
  | "request-budget"
  | "cancelled"
  | "unavailable";
export interface EvidencePolicy {
  readonly maxRequests: number;
  readonly maxAttempts: number;
  readonly maxResponseBytes: number;
  readonly timeoutMs: number;
  readonly maxBlockAgeSeconds: string;
  readonly maxPriceAgeSeconds: string;
}
export interface EvidenceRequest {
  readonly formatVersion: 1;
  /** Application-generated identifier, independent of provider credentials. */
  readonly runId: string;
  readonly providerId: string;
  readonly networkId: string;
  readonly recipe: EvidenceRecipe;
  /** Explicit bounded selection; empty for network and price recipes. */
  readonly contractIds: readonly string[];
  readonly policy: EvidencePolicy;
}
export interface EvidenceCoordinate {
  readonly chainId: string;
  readonly blockNumber: string;
  readonly blockHash: string;
  readonly blockTimestamp: string;
}
export interface RuntimeEvidenceValue {
  readonly address: string;
  readonly addressCodeSha256: string;
  readonly implementationAddress: string | null;
  readonly implementationCodeSha256: string | null;
  /** Raw 32-byte slot value, including its padding. Null for non-proxies. */
  readonly implementationSlotValue: string | null;
}
export interface PriceEvidenceValue {
  readonly answer: string;
  readonly decimals: number;
  readonly roundId: string;
  readonly startedAt: string;
  readonly publishedAt: string;
  readonly answeredInRound: string;
  readonly confidence: null;
}
/** A field's explicit representation. Base units retain their owning token/power semantics. */
export interface IncentiveEvidenceValue {
  readonly valueUnit: "address" | "address-list" | "seconds" | "count" | "base-units" | "text";
  readonly value: string | readonly string[];
}
interface ObservationBase {
  readonly id: string;
  readonly status: "match" | "conflict" | "observed" | "unavailable" | "not-run";
  readonly error: EvidenceFailure | null;
  readonly freshness: EvidenceFreshness;
  readonly sourceRefs: readonly string[];
}
export type EvidenceObservation = ObservationBase &
  (
    | { readonly unit: "chain-id"; readonly expected: string; readonly observed: string | null }
    | {
        readonly unit: "runtime-identity";
        readonly expected: RuntimeEvidenceValue | null;
        readonly observed: RuntimeEvidenceValue | null;
      }
    | {
        readonly unit: "usd-per-btc";
        readonly expected: null;
        readonly observed: PriceEvidenceValue | null;
      }
    | {
        readonly unit: "incentive-configuration" | "incentive-state" | "incentive-metadata";
        readonly expected: IncentiveEvidenceValue | null;
        readonly observed: IncentiveEvidenceValue | null;
      }
  );
export interface EvidenceReport {
  readonly formatVersion: 1;
  readonly request: EvidenceRequest;
  readonly recipeRevision: string;
  readonly inputDigest: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: "complete" | "partial" | "failed" | "cancelled";
  readonly coordinate: EvidenceCoordinate | null;
  readonly anchorIntegrity: "consistent" | "changed" | "unavailable";
  readonly blockFreshness: EvidenceFreshness;
  readonly historicalIntegrity: "not-assessed";
  readonly canonicalAcceptance: "unreviewed";
  readonly failure: EvidenceFailure | null;
  readonly requestsUsed: number;
  readonly coverage: { readonly planned: number; readonly collected: number };
  readonly observations: readonly EvidenceObservation[];
  readonly limitations: readonly string[];
}
export interface EvidenceProgress {
  readonly formatVersion: 1;
  readonly runId: string;
  readonly sequence: number;
  readonly phase: "started" | "claim" | "finished";
  readonly collected: number;
  readonly planned: number;
}
/** Must honor cancellation, timeout and response-byte limits before buffering JSON. */
export type EvidenceRpcRequest = (input: {
  readonly method: string;
  readonly params: readonly unknown[];
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}) => Promise<unknown>;
export interface EvidencePorts {
  readonly request: EvidenceRpcRequest;
  /** Unix seconds; monotonically nondecreasing during a run. */
  readonly now: () => bigint;
  readonly signal?: AbortSignal;
  /** Progress is advisory; a throwing consumer callback rejects the operation. */
  readonly onProgress?: (event: EvidenceProgress) => void;
}
/** Safe fixed diagnostic. Raw provider messages, URLs and response bodies are never retained. */
export class EvidenceError extends Error {
  readonly code: EvidenceFailure | "invalid-input";
  readonly retryable: boolean;
  constructor(code: EvidenceFailure | "invalid-input", retryable = false) {
    super(`Evidence operation: ${code}`);
    this.name = "EvidenceError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Offline recipe scope and canonical input fingerprints. */
export interface EvidenceCapabilities {
  readonly formatVersion: 1;
  readonly recipeRevision: string;
  readonly inputDigest: string;
  readonly maxConcurrency: 1;
  readonly inputs: readonly { readonly path: string; readonly sha256: string }[];
  readonly recipes: readonly {
    readonly id: EvidenceRecipe;
    readonly networkIds: readonly string[];
  }[];
  readonly networks: readonly {
    readonly id: string;
    readonly displayName: string;
    readonly chainId: string;
    readonly runtimeContracts: readonly string[];
    readonly unavailableRuntimeContracts: readonly string[];
  }[];
  readonly limitations: readonly string[];
  /** Bounded revisioned claims; IDs, baseline coordinates and omissions remain visible offline. */
  readonly incentiveFields: readonly {
    readonly id: string;
    readonly contractId: string;
    readonly classification: "configuration" | "state" | "metadata";
    readonly unit: string;
    readonly supported: boolean;
    readonly interpretation: string;
  }[];
  readonly incentiveBaseline: {
    readonly blockNumber: string;
    readonly blockHash: string;
    readonly blockTimestamp: string;
  };
}
