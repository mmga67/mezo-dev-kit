import type { ContractRegistry, ResolvedContract } from "@mezo-dev-kit/contracts";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  ReadCoordinate,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";

export type BorrowerStatus =
  "nonexistent" | "active" | "closed-by-owner" | "closed-by-liquidation" | "closed-by-redemption";
export interface BorrowingPosition {
  readonly stake: bigint;
  readonly ownerArrayIndex: bigint;
  readonly status: BorrowerStatus;
  readonly storedCollateral: bigint;
  readonly storedPrincipal: bigint;
  readonly storedInterest: bigint;
  readonly collateral: bigint;
  readonly principal: bigint;
  readonly interest: bigint;
  readonly pendingCollateral: bigint;
  readonly pendingPrincipal: bigint;
  readonly pendingInterest: bigint;
  readonly accruedInterest: bigint;
  readonly debt: bigint;
  readonly netDebt: bigint;
  readonly annualRateBps: bigint;
  readonly lastInterestUpdateTime: bigint;
  readonly maxBorrowingCapacity: bigint;
}
export interface BorrowingSnapshot {
  readonly account: `0x${string}`;
  readonly coordinate: Readonly<ReadCoordinate>;
  readonly timestamp: bigint;
  readonly contracts: Readonly<Record<string, Readonly<ResolvedContract>>>;
  readonly position: Readonly<BorrowingPosition>;
  readonly price: bigint;
  readonly systemCollateral: bigint;
  readonly systemDebt: bigint;
  readonly tcr: bigint;
  readonly recoveryMode: boolean;
  readonly troveCount: bigint;
  readonly gasCompensation: bigint;
  readonly minimumNetDebt: bigint;
  readonly mcr: bigint;
  readonly ccr: bigint;
  readonly borrowingRate: bigint;
  readonly refinancingFeePercentage: bigint;
  readonly offeredAnnualRateBps: bigint;
  readonly feeExempt: boolean;
  readonly canMint: boolean;
  readonly canBurn: boolean;
  readonly musdBalance: bigint;
  readonly surplus: bigint;
}
export type BorrowingAction =
  | Readonly<{ kind: "open"; collateral: bigint; borrow: bigint }>
  | Readonly<{ kind: "add-collateral"; collateral: bigint }>
  | Readonly<{ kind: "withdraw-collateral"; collateral: bigint }>
  | Readonly<{ kind: "borrow"; amount: bigint }>
  | Readonly<{ kind: "repay"; amount: bigint }>
  | Readonly<{
      kind: "adjust";
      depositCollateral: bigint;
      withdrawCollateral: bigint;
      debtChange: bigint;
      increaseDebt: boolean;
    }>
  | Readonly<{ kind: "close" | "refinance" | "claim-surplus" }>;
export interface BorrowingBounds {
  readonly maxFee: bigint;
  readonly maxAnnualRateBps: bigint;
  readonly minCollateralRatio: bigint;
  readonly maxBlockAge: bigint;
}
export interface BorrowingForecast {
  readonly collateral: bigint;
  readonly principal: bigint;
  readonly interest: bigint;
  readonly debt: bigint;
  readonly fee: bigint;
  readonly annualRateBps: bigint;
  readonly maxBorrowingCapacity: bigint;
  readonly icr: bigint;
  readonly nicr: bigint;
  readonly postTcr: bigint;
  readonly repay: bigint;
}
export interface BorrowingHints {
  readonly upper: `0x${string}`;
  readonly lower: `0x${string}`;
  readonly seed: bigint;
}
export interface BorrowingReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
export interface BorrowingReader {
  read(input: {
    readonly account: `0x${string}`;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<BorrowingSnapshot>>;
  hints(input: {
    readonly snapshot: BorrowingSnapshot;
    readonly nominalRatio: bigint;
    readonly trials: bigint;
    readonly seed: bigint;
  }): Promise<Readonly<BorrowingHints>>;
}
export interface PreparedBorrowing {
  readonly snapshot: Readonly<BorrowingSnapshot>;
  readonly action: Readonly<BorrowingAction>;
  readonly bounds: Readonly<BorrowingBounds>;
  readonly forecast: Readonly<BorrowingForecast>;
  readonly transaction: Readonly<PreparedTransaction>;
  readonly hints: Readonly<BorrowingHints> | null;
}
export interface BorrowingWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: BorrowingAction;
    readonly bounds: BorrowingBounds;
    readonly trials: bigint;
    readonly seed: bigint;
  }): Promise<Readonly<PreparedBorrowing>>;
  simulate(prepared: PreparedBorrowing): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedBorrowing,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedBorrowing, record: unknown): Promise<Readonly<ReconciledBorrowing>>;
}
export interface BorrowingWriterConfig {
  readonly reader: BorrowingReader;
  readonly execution: ExecutionClient;
}
export interface BorrowingOutcome {
  readonly kind: BorrowingAction["kind"];
  readonly snapshot: Readonly<BorrowingSnapshot>;
  readonly fee: bigint;
  readonly collateralClaimed: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledBorrowing {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<BorrowingOutcome>;
}
