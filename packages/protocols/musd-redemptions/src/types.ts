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
export interface RedemptionPosition {
  readonly account: `0x${string}`;
  readonly position: Readonly<BorrowingPosition>;
  readonly surplus: bigint;
}
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
  readonly tailEntriesChecked: number;
}
export interface RedemptionReader {
  read(input: {
    readonly account: `0x${string}`;
    readonly borrowers?: readonly `0x${string}`[];
    readonly blockNumber?: bigint;
  }): Promise<Readonly<RedemptionSnapshot>>;
  quote(input: RedemptionQuoteInput): Promise<Readonly<RedemptionQuote>>;
}
export type RedemptionReaderConfig = BorrowingReaderConfig;
export interface RedemptionBounds {
  readonly minActualAmount: bigint;
  readonly minNetCollateral: bigint;
  readonly maxRedemptionRate: bigint;
  readonly maxBlockAge: bigint;
}
export interface PreparedRedemption {
  readonly quote: Readonly<RedemptionQuote>;
  readonly bounds: Readonly<RedemptionBounds>;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface RedemptionOutcome {
  readonly amounts: Readonly<RedemptionAmounts>;
  readonly snapshot: Readonly<RedemptionSnapshot>;
  readonly gasFee: bigint;
  readonly closedBorrowers: readonly `0x${string}`[];
  readonly partialBorrowers: readonly `0x${string}`[];
  readonly boundsSatisfied: boolean;
}
export interface ReconciledRedemption {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<RedemptionOutcome>;
}
export interface RedemptionWriterConfig {
  readonly reader: RedemptionReader;
  readonly execution: ExecutionClient;
  readonly simulator: RedemptionOutputSimulator;
  readonly transport: RpcTransport;
}
export interface RedemptionWriter {
  prepare(input: {
    readonly operationId: string;
    readonly quote: RedemptionQuoteInput;
    readonly bounds: RedemptionBounds;
  }): Promise<Readonly<PreparedRedemption>>;
  simulate(prepared: PreparedRedemption): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedRedemption,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedRedemption, record: unknown): Promise<Readonly<ReconciledRedemption>>;
}
