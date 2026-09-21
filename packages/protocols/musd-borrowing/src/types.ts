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
/**
 * Normalized borrower accounting. Entire collateral/principal/interest already include pending
 * redistribution and accrued interest; never add them twice.
 */
export interface BorrowingPosition {
  readonly stake: bigint;
  readonly ownerArrayIndex: bigint;
  readonly status: BorrowerStatus;
  readonly storedCollateral: bigint;
  readonly storedPrincipal: bigint;
  readonly storedInterest: bigint;
  /**
   * Entire BTC base units, including pending collateral redistribution.
   */
  readonly collateral: bigint;
  /**
   * Entire MUSD principal including pending principal and reserve; excludes interest.
   */
  readonly principal: bigint;
  /**
   * Entire MUSD interest including stored, pending and newly accrued components.
   */
  readonly interest: bigint;
  readonly pendingCollateral: bigint;
  readonly pendingPrincipal: bigint;
  readonly pendingInterest: bigint;
  readonly accruedInterest: bigint;
  /**
   * Composite MUSD debt including the gas-compensation reserve.
   */
  readonly debt: bigint;
  /**
   * MUSD debt excluding the gas-compensation reserve.
   */
  readonly netDebt: bigint;
  /**
   * Annual basis-point rate; distinct from one-off rates scaled by 1e18.
   */
  readonly annualRateBps: bigint;
  /**
   * Unix seconds of the position's last interest update.
   */
  readonly lastInterestUpdateTime: bigint;
  /**
   * Stored capacity in MUSD base units; a collateral topup does not automatically increase it.
   */
  readonly maxBorrowingCapacity: bigint;
}
/**
 * Borrower and system state read at one network/block/hash. BTC/MUSD amounts use 18 decimals;
 * price/ratios use 1e18 and annual rates use basis points.
 */
export interface BorrowingSnapshot {
  readonly account: `0x${string}`;
  readonly coordinate: Readonly<ReadCoordinate>;
  /**
   * Unix seconds at the snapshot coordinate; not milliseconds or an ambient clock.
   */
  readonly timestamp: bigint;
  readonly contracts: Readonly<Record<string, Readonly<ResolvedContract>>>;
  readonly position: Readonly<BorrowingPosition>;
  /**
   * Protocol USD/BTC price scaled by 1e18; reader-verified source identity, not a DEX quote.
   */
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
  /**
   * One-off borrowing fee rate scaled by 1e18; distinct from annualRateBps.
   */
  readonly borrowingRate: bigint;
  /**
   * Integer percent applied before the borrowing-rate fee; not basis points.
   */
  readonly refinancingFeePercentage: bigint;
  readonly offeredAnnualRateBps: bigint;
  readonly feeExempt: boolean;
  readonly canMint: boolean;
  readonly canBurn: boolean;
  readonly musdBalance: bigint;
  readonly surplus: bigint;
}
/**
 * One direct borrower intent. Collateral uses native BTC base units; debt/payment uses MUSD
 * base units. Both have 18 decimals in this deployment.
 */
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
/**
 * Caller fee/rate/ratio/freshness policy. These are preflight checks and reconciliation
 * reporting, not additional on-chain slippage arguments.
 */
export interface BorrowingBounds {
  /**
   * Maximum MUSD fee in 18-decimal base units.
   */
  readonly maxFee: bigint;
  /**
   * Maximum annual rate in basis points.
   */
  readonly maxAnnualRateBps: bigint;
  /**
   * Minimum collateral/debt ratio scaled by 1e18, not percent or LTV.
   */
  readonly minCollateralRatio: bigint;
  /**
   * Maximum accepted preparation age in blocks, checked by the owning operation.
   */
  readonly maxBlockAge: bigint;
}
/**
 * Expected position at the snapshot timestamp. Monetary values are base units, ICR/TCR use 1e18
 * and NICR uses 1e20; settlement may differ.
 */
export interface BorrowingForecast {
  readonly collateral: bigint;
  readonly principal: bigint;
  readonly interest: bigint;
  readonly debt: bigint;
  readonly fee: bigint;
  /**
   * Annual basis-point rate; distinct from one-off rates scaled by 1e18.
   */
  readonly annualRateBps: bigint;
  readonly maxBorrowingCapacity: bigint;
  readonly icr: bigint;
  readonly nicr: bigint;
  readonly postTcr: bigint;
  readonly repay: bigint;
}
/**
 * Sorted-list insertion neighbors plus the returned sampling seed. Hints locate principal-based
 * NICR and do not prove operation eligibility.
 */
export interface BorrowingHints {
  readonly upper: `0x${string}`;
  readonly lower: `0x${string}`;
  readonly seed: bigint;
}
/**
 * Explicit mainnet identity, canonical registry and signer-free RPC transport for borrower
 * reads.
 */
export interface BorrowingReaderConfig {
  readonly networkId: "mezo-mainnet";
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
}
/**
 * Anchored borrower reads and bounded sorted-list hints. Read failures never become invented
 * zero balances or actionable forecasts.
 */
export interface BorrowingReader {
  /**
   * Read and validate borrower/system state at the supplied block or one selected head. Returns
   * already-entire debt/collateral components; required failures reject.
   */
  read(input: {
    readonly account: `0x${string}`;
    readonly blockNumber?: bigint;
  }): Promise<Readonly<BorrowingSnapshot>>;
  /**
   * Find sorted insertion neighbors at the supplied snapshot, using principal-based 1e20 NICR,
   * one to 1000 trials and an explicit seed. Hints do not establish eligibility.
   */
  hints(input: {
    readonly snapshot: BorrowingSnapshot;
    readonly nominalRatio: bigint;
    readonly trials: bigint;
    readonly seed: bigint;
  }): Promise<Readonly<BorrowingHints>>;
}
/**
 * Snapshot, bounds, forecast and exact borrower call. Simulation/submission require the
 * original object from its writer instance.
 */
export interface PreparedBorrowing {
  readonly snapshot: Readonly<BorrowingSnapshot>;
  readonly action: Readonly<BorrowingAction>;
  readonly bounds: Readonly<BorrowingBounds>;
  readonly forecast: Readonly<BorrowingForecast>;
  readonly transaction: Readonly<PreparedTransaction>;
  readonly hints: Readonly<BorrowingHints> | null;
}
/**
 * Separate preparation, simulation, signing and protocol reconciliation. Persist the Core
 * submission record for recovery.
 */
export interface BorrowingWriter {
  /**
   * Read state, forecast the action/bounds and calculate insertion hints. Returns an exact
   * borrower call without signing; close and surplus claims need no insertion hints.
   */
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: BorrowingAction;
    readonly bounds: BorrowingBounds;
    readonly trials: bigint;
    readonly seed: bigint;
  }): Promise<Readonly<PreparedBorrowing>>;
  /**
   * Simulate this writer's exact borrower preparation through Core without submitting; no
   * ERC-20 approval step is added.
   */
  simulate(prepared: PreparedBorrowing): Promise<Readonly<SimulatedTransaction>>;
  /**
   * Revalidate and submit the matching writer-owned preparation/simulation through Core.
   * Returns a durable record, not confirmation or protocol completion. Recover an uncertain
   * send by its existing intent.
   */
  submit(
    prepared: PreparedBorrowing,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  /**
   * Match the persisted intent and confirmed receipt, then verify borrower accounting and
   * events. Required evidence mismatches can reject even when the EVM receipt succeeded.
   */
  reconcile(prepared: PreparedBorrowing, record: unknown): Promise<Readonly<ReconciledBorrowing>>;
}
/**
 * Borrower reader plus Core execution client; Core retains signer, transport, confirmation and
 * durable-store ownership.
 */
export interface BorrowingWriterConfig {
  readonly reader: BorrowingReader;
  readonly execution: ExecutionClient;
}
/**
 * Actual receipt-block borrower result. Inspect boundsSatisfied separately from receipt
 * success; collateralClaimed and fee have different asset units.
 */
export interface BorrowingOutcome {
  readonly kind: BorrowingAction["kind"];
  readonly snapshot: Readonly<BorrowingSnapshot>;
  /**
   * Actual borrowing/refinancing fee in MUSD base units.
   */
  readonly fee: bigint;
  /**
   * Actual claimed surplus in native BTC base units.
   */
  readonly collateralClaimed: bigint;
  /**
   * Whether actual settlement met caller policy; receipt success alone does not guarantee this
   * is true.
   */
  readonly boundsSatisfied: boolean;
}
/**
 * Matching durable intent, confirmed receipt and verified borrower outcome; this observation
 * does not preclude a later chain reorg.
 */
export interface ReconciledBorrowing {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<BorrowingOutcome>;
}
