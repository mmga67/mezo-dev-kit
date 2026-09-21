import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { BasicSwapHop, BasicSwapQuote, BasicSwapReader } from "./reader.ts";
import type { CLSwapBudget, CLSwapHop, CLSwapQuote, CLSwapReader } from "./cl-types.ts";

/**
 * Application-supplied basic or CL route with explicit intermediate policy and
 * required/optional failure semantics.
 */
export type SwapQuoteCandidate = Readonly<{
  id: string;
  required: boolean;
  intermediateAssets: readonly `0x${string}`[];
}> &
  (
    | Readonly<{ family: "basic"; route: readonly BasicSwapHop[] }>
    | Readonly<{
        family: "concentrated-liquidity";
        route: readonly CLSwapHop[];
        budget: CLSwapBudget;
      }>
  );

/**
 * One token pair/input amount and up to sixteen candidate routes with an explicit
 * writer-compatibility policy.
 */
export interface SwapQuoteRequest {
  readonly tokenIn: `0x${string}`;
  readonly tokenOut: `0x${string}`;
  readonly account: `0x${string}`;
  readonly amountIn: bigint;
  readonly maxAgeBlocks: bigint;
  readonly blockNumber?: bigint;
  readonly eligibility: "writer-compatible" | "all-quotes";
  readonly candidates: readonly SwapQuoteCandidate[];
}

/**
 * Shared coordinate transport and optional family readers; absent family support is an explicit
 * candidate failure.
 */
export interface SwapQuoteReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly transport: Pick<
    RpcTransport,
    "getChainId" | "getBlockNumber" | "getBlock" | "getBlockTimestamp"
  >;
  readonly basic?: BasicSwapReader;
  readonly concentratedLiquidity?: CLSwapReader;
}

/**
 * A fee already included in a quote, denominated in that hop's input token; do not subtract it
 * again.
 */
export interface SwapQuoteFee {
  readonly pool: `0x${string}`;
  readonly token: `0x${string}`;
  readonly decimals: bigint;
  /** Fee already included in the quote, in this hop's input-asset base units. */
  readonly amount: bigint;
}

export interface SwapQuoteIssue {
  readonly code: "ReaderUnavailable" | "QuoteUnavailable" | "InvalidQuote";
  readonly message: string;
  /** Kept for local diagnosis. Do not serialize raw upstream errors to users or logs. */
  readonly cause?: unknown;
}

/**
 * Explicit failed, quoted or ineligible candidate. A readable quote need not satisfy
 * writer-compatibility policy.
 */
export type SwapQuoteCandidateResult = Readonly<{
  id: string;
  required: boolean;
}> &
  (
    | Readonly<{ status: "failed"; issue: SwapQuoteIssue }>
    | (Readonly<{
        status: "quoted" | "ineligible";
        fees: readonly SwapQuoteFee[];
      }> &
        (
          | Readonly<{ family: "basic"; quote: BasicSwapQuote }>
          | Readonly<{ family: "concentrated-liquidity"; quote: CLSwapQuote }>
        ))
  );

/**
 * One-coordinate comparison over supplied candidates only. Ranking excludes gas/currency
 * adjustments and does not imply exhaustive best execution.
 */
export interface SwapQuoteResult {
  readonly state: "complete" | "partial" | "incomplete" | "unavailable";
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
  readonly timestamp: bigint;
  readonly observedHead: bigint;
  readonly expiresAfterBlock: bigint;
  readonly rankingPolicy: "highest-estimated-output";
  readonly eligibility: SwapQuoteRequest["eligibility"];
  readonly candidates: readonly SwapQuoteCandidateResult[];
  /** Candidate IDs, ordered by output descending, then ASCII ID ascending. */
  readonly ranked: readonly string[];
  readonly best: string | null;
  readonly coverage: Readonly<{
    scope: "provided-candidates-only";
    requested: number;
    attempted: number;
    quoted: number;
    eligible: number;
    failed: number;
    requiredFailures: number;
  }>;
  readonly priceImpact: Readonly<{
    status: "unavailable";
    reason: "no-validated-marginal-price-reference";
  }>;
  readonly gas: Readonly<{ status: "not-estimated"; rankingAdjustment: "none" }>;
  readonly currencyConversion: "none";
}

/**
 * Read-only bounded candidate comparison with visible required/optional failures and explicit
 * coverage.
 */
export interface SwapQuoteReader {
  /**
   * Compare only supplied candidates at one coordinate. Preserve required/optional failures and
   * inspect state/coverage before choosing best.
   */
  quote(input: SwapQuoteRequest): Promise<Readonly<SwapQuoteResult>>;
}
