import type {
  BorrowingPosition,
  BorrowingReaderConfig,
  BorrowingSnapshot,
} from "@mezo-dev-kit/musd-borrowing";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import type { RedemptionAmounts, RedemptionOutputSimulator } from "./trace.ts";
/**
 * One borrower's normalized debt/collateral and separate surplus at the redemption snapshot
 * coordinate.
 */
export interface RedemptionPosition {
  readonly account: `0x${string}`;
  readonly position: Readonly<BorrowingPosition>;
  readonly surplus: bigint;
}
/**
 * Borrower/system accounting and explicitly selected positions at one coordinate, used for
 * quotes and settlement attribution.
 */
export interface RedemptionSnapshot {
  readonly borrowing: Readonly<BorrowingSnapshot>;
  readonly positions: readonly Readonly<RedemptionPosition>[];
  readonly redemptionRate: bigint;
  readonly canBurn: boolean;
  readonly nativeBalance: bigint;
  readonly pcvNativeBalance: bigint;
  readonly pcvMusdBalance: bigint;
  readonly gasPoolBalance: bigint;
  readonly totalSupply: bigint;
  readonly activeCollateral: bigint;
  readonly activePrincipal: bigint;
  readonly activeInterest: bigint;
  readonly defaultCollateral: bigint;
  readonly defaultPrincipal: bigint;
  readonly defaultInterest: bigint;
  readonly interestNumerator: bigint;
  readonly interestUpdatedAt: bigint;
  readonly accruedSystemInterest: bigint;
}
/**
 * Explicit MUSD request and bounded sorted traversal. Seed/trials are deterministic inputs;
 * amountMode controls intentional unfilled remainder.
 */
export interface RedemptionQuoteInput {
  readonly account: `0x${string}`;
  readonly requestedAmount: bigint;
  /** Truncate is the default. Requested preserves an intentional unfilled remainder. */
  readonly amountMode?: "truncate" | "requested";
  readonly maxIterations: bigint;
  readonly maxTailScan: number;
  readonly trials: bigint;
  readonly seed: bigint;
  readonly blockNumber?: bigint;
}
/**
 * Bounded queue hints and attempted amount at one coordinate. Hints and helper truncation do
 * not prove exact execution output.
 */
export interface RedemptionQuote {
  readonly snapshot: Readonly<RedemptionSnapshot>;
  readonly input: Readonly<RedemptionQuoteInput>;
  readonly attemptedAmount: bigint;
  readonly helperTruncatedAmount: bigint;
  readonly first: `0x${string}`;
  readonly upper: `0x${string}`;
  readonly lower: `0x${string}`;
  readonly partialNominalRatio: bigint;
  readonly seed: bigint;
  /**
   * Count of explicitly inspected tail entries; does not imply full sorted-list coverage.
   */
  readonly tailEntriesChecked: number;
}
/**
 * Signer-free state inspection and bounded sorted-list quotes; exact output is a separate
 * simulation step.
 */
export interface RedemptionReader {
  /**
   * Read system accounting and an optional bounded borrower set at one block; unrequested
   * borrowers are not implicitly covered.
   */
  read(input: {
    readonly account: `0x${string}`;
    readonly borrowers?: readonly `0x${string}`[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<RedemptionSnapshot>>;
  /**
   * Walk only within the requested tail/iteration limits and calculate sorted hints. Exact
   * actual output requires a separate trace simulation.
   */
  quote(input: RedemptionQuoteInput): Promise<Readonly<RedemptionQuote>>;
}
export type RedemptionReaderConfig = BorrowingReaderConfig;
/**
 * Minimum actual MUSD and net BTC output, 1e18-scaled maximum rate, and preparation age in
 * blocks.
 */
export interface RedemptionBounds {
  /**
   * Minimum actual filled MUSD base units; attempted input may be larger.
   */
  readonly minActualAmount: bigint;
  /**
   * Minimum actual BTC base units after the redemption fee, before separate execution gas.
   */
  readonly minNetCollateral: bigint;
  /**
   * Maximum rate scaled by 1e18; preserve its on-chain fee-bound semantics.
   */
  readonly maxRedemptionRate: bigint;
  /**
   * Maximum accepted preparation age in blocks, checked by the owning operation.
   */
  readonly maxBlockAge: bigint;
}
/**
 * Bounded quote, caller limits and exact redeem call. It becomes executable only through the
 * matching writer simulation.
 */
export interface PreparedRedemption {
  readonly quote: Readonly<RedemptionQuote>;
  readonly bounds: Readonly<RedemptionBounds>;
  readonly transaction: Readonly<PreparedTransaction>;
}
/**
 * Actual attempted/filled/fee/net amounts with receipt-block state and policy outcome; gas is
 * separate native BTC expense.
 */
export interface RedemptionOutcome {
  readonly amounts: Readonly<RedemptionAmounts>;
  readonly snapshot: Readonly<RedemptionSnapshot>;
  /**
   * Native currency base units spent on execution; keep separate from token principal and
   * protocol fees.
   */
  readonly gasFee: bigint;
  readonly closedBorrowers: readonly `0x${string}`[];
  readonly partialBorrowers: readonly `0x${string}`[];
  /**
   * Whether actual settlement met caller policy; receipt success alone does not guarantee this
   * is true.
   */
  readonly boundsSatisfied: boolean;
}
export interface ReconciledRedemption {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<RedemptionOutcome>;
}
/**
 * State reader, Core execution, output simulator and RPC dependencies. Tracing is required to
 * establish exact simulated output.
 */
export interface RedemptionWriterConfig {
  readonly reader: RedemptionReader;
  readonly execution: ExecutionClient;
  readonly simulator: RedemptionOutputSimulator;
  readonly transport: RpcTransport;
}
/**
 * Explicit redemption lifecycle with bounded quotes and traced output; it performs no implicit
 * retries.
 */
export interface RedemptionWriter {
  /**
   * Read and validate the selected intent, then return its exact prepared call without signing.
   * Retain the original object for this writer's simulation/submission.
   */
  prepare(input: {
    readonly operationId: string;
    readonly quote: RedemptionQuoteInput;
    readonly bounds: RedemptionBounds;
  }): Promise<Readonly<PreparedRedemption>>;
  /**
   * Trace this writer's prepared redemption and verify actual output/fee bounds during exact
   * simulation; no transaction is sent.
   */
  simulate(prepared: PreparedRedemption): Promise<Readonly<SimulatedTransaction>>;
  /**
   * Revalidate and submit the matching writer-owned preparation/simulation through Core.
   * Returns a durable record, not confirmation or protocol completion. Recover an uncertain
   * send by its existing intent.
   */
  submit(
    prepared: PreparedRedemption,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  /**
   * Match the persisted intent and confirmed receipt, then verify actual redemption amounts and
   * borrower/system state. Required evidence mismatches can reject even when the EVM receipt
   * succeeded.
   */
  reconcile(prepared: PreparedRedemption, record: unknown): Promise<Readonly<ReconciledRedemption>>;
}
