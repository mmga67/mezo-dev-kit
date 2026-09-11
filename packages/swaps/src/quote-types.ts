import type { ReadCoordinate, RpcTransport } from "@mezo-dev-kit/core";
import type { BasicSwapHop, BasicSwapQuote, BasicSwapReader } from "./reader.ts";
import type { CLSwapBudget, CLSwapHop, CLSwapQuote, CLSwapReader } from "./cl-types.ts";

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

export interface SwapQuoteReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly transport: Pick<
    RpcTransport,
    "getChainId" | "getBlockNumber" | "getBlock" | "getBlockTimestamp"
  >;
  readonly basic?: BasicSwapReader;
  readonly concentratedLiquidity?: CLSwapReader;
}

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

export interface SwapQuoteResult {
  readonly state: "complete" | "partial" | "incomplete" | "unavailable";
  readonly coordinate: Readonly<ReadCoordinate>;
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

export interface SwapQuoteReader {
  quote(input: SwapQuoteRequest): Promise<Readonly<SwapQuoteResult>>;
}
