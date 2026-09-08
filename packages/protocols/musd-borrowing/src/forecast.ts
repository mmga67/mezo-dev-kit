import { BorrowingError } from "./errors.ts";
import { isBorrowerStatus } from "./position.ts";
import {
  add,
  sub,
  uint,
  min,
  calculateBorrowingCapacity,
  calculateBorrowingFee,
  calculateCollateralRatio,
  calculateNominalCollateralRatio,
  calculateRefinancingFee,
  splitDebtPayment,
} from "./math.ts";
import type {
  BorrowingAction,
  BorrowingBounds,
  BorrowingForecast,
  BorrowingSnapshot,
} from "./types.ts";

function requireRule(condition: boolean, message: string): void {
  if (!condition) throw new BorrowingError("IneligibleOperation", message);
}

/** Pure forecast at the snapshot timestamp. It is not an execution-time price or fee guarantee. */
export function forecastBorrowing(
  snapshot: BorrowingSnapshot,
  action: BorrowingAction,
  bounds: BorrowingBounds,
): Readonly<BorrowingForecast> {
  if (!snapshot?.position || !isBorrowerStatus(snapshot.position.status))
    throw new BorrowingError("InvalidState", "valid borrower state is required");
  const s = snapshot;
  const p = s.position;
  for (const key of ["maxFee", "maxAnnualRateBps", "minCollateralRatio", "maxBlockAge"] as const)
    uint(bounds?.[key]);
  for (const value of [
    s.price,
    s.systemCollateral,
    s.systemDebt,
    s.gasCompensation,
    s.minimumNetDebt,
    s.mcr,
    s.ccr,
    s.borrowingRate,
    s.refinancingFeePercentage,
    s.offeredAnnualRateBps,
    s.musdBalance,
    s.surplus,
    s.troveCount,
    p.collateral,
    p.principal,
    p.interest,
    p.debt,
    p.maxBorrowingCapacity,
    p.annualRateBps,
  ])
    uint(value);
  for (const value of [s.canMint, s.canBurn, s.feeExempt, s.recoveryMode])
    if (typeof value !== "boolean")
      throw new BorrowingError("InvalidState", "missing required boolean state");
  if (s.price === 0n || s.mcr === 0n || s.ccr < s.mcr || p.debt !== add(p.principal, p.interest))
    throw new BorrowingError("InvalidState", "invalid price, ratios or debt");
  const tcr = calculateCollateralRatio(s.systemCollateral, s.systemDebt, s.price);
  const recovery = tcr < s.ccr;
  if (recovery !== s.recoveryMode || tcr !== s.tcr)
    throw new BorrowingError("InvalidState", "incoherent recovery mode");
  let collateral = p.collateral;
  let principal = p.principal;
  let interest = p.interest;
  let fee = 0n;
  let repay = 0n;
  let annualRateBps = p.annualRateBps;
  let capacity = p.maxBorrowingCapacity;
  let systemCollateral = s.systemCollateral;
  let systemDebt = s.systemDebt;
  if (action.kind === "claim-surplus") {
    requireRule(s.surplus > 0n, "no collateral surplus to claim");
  } else if (action.kind === "open") {
    requireRule(p.status !== "active", "borrower already has an active trove");
    requireRule(s.canMint, "BorrowerOperations cannot mint MUSD");
    collateral = uint(action.collateral);
    const requested = uint(action.borrow);
    requireRule(collateral > 0n, "opening collateral must be positive");
    fee = recovery || s.feeExempt ? 0n : calculateBorrowingFee(requested, s.borrowingRate);
    requireRule(add(requested, fee) >= s.minimumNetDebt, "net debt is below the minimum");
    principal = add(add(requested, fee), s.gasCompensation);
    interest = 0n;
    annualRateBps = s.offeredAnnualRateBps;
    capacity = calculateBorrowingCapacity(collateral, s.price, s.mcr);
    systemCollateral = add(systemCollateral, collateral);
    systemDebt = add(systemDebt, principal);
    requireRule(
      calculateCollateralRatio(collateral, principal, s.price) >= (recovery ? s.ccr : s.mcr),
      "opening collateral ratio is too low",
    );
    if (!recovery)
      requireRule(
        calculateCollateralRatio(systemCollateral, systemDebt, s.price) >= s.ccr,
        "opening would put system TCR below CCR",
      );
  } else {
    requireRule(p.status === "active", "operation requires an active trove");
    if (action.kind === "close") {
      requireRule(
        s.canMint && s.canBurn,
        "initial close path requires verified normal mint and burn roles",
      );
      requireRule(
        !recovery && s.troveCount > 1n,
        "cannot close in recovery or close the last trove",
      );
      repay = sub(p.debt, s.gasCompensation);
      requireRule(repay <= s.musdBalance, "insufficient MUSD to close");
      systemCollateral = sub(systemCollateral, collateral);
      systemDebt = sub(systemDebt, p.debt);
      requireRule(
        calculateCollateralRatio(systemCollateral, systemDebt, s.price) >= s.ccr,
        "closing would put system TCR below CCR",
      );
      collateral = 0n;
      principal = 0n;
      interest = 0n;
    } else if (action.kind === "refinance") {
      requireRule(!recovery, "cannot refinance in recovery mode");
      fee = s.feeExempt
        ? 0n
        : calculateRefinancingFee(
            sub(p.debt, s.gasCompensation),
            s.refinancingFeePercentage,
            s.borrowingRate,
          );
      requireRule(fee === 0n || s.canMint, "refinance fee requires mint permission");
      principal = add(principal, fee);
      systemDebt = add(systemDebt, fee);
      annualRateBps = s.offeredAnnualRateBps;
      capacity = calculateBorrowingCapacity(collateral, s.price, s.mcr);
      requireRule(
        calculateCollateralRatio(collateral, add(principal, interest), s.price) >= s.mcr &&
          calculateCollateralRatio(systemCollateral, systemDebt, s.price) >= s.ccr,
        "refinance violates collateral ratios",
      );
    } else {
      let deposit = 0n;
      let withdraw = 0n;
      let change = 0n;
      let increase = false;
      switch (action.kind) {
        case "add-collateral":
          deposit = uint(action.collateral);
          break;
        case "withdraw-collateral":
          withdraw = uint(action.collateral);
          break;
        case "borrow":
          change = uint(action.amount);
          increase = true;
          break;
        case "repay":
          change = uint(action.amount);
          break;
        case "adjust":
          deposit = uint(action.depositCollateral);
          withdraw = uint(action.withdrawCollateral);
          change = uint(action.debtChange);
          if (typeof action.increaseDebt !== "boolean")
            throw new BorrowingError("InvalidInput", "increaseDebt must be boolean");
          increase = action.increaseDebt;
          break;
        default:
          throw new BorrowingError("InvalidInput", "unknown borrowing action");
      }
      requireRule(
        !(deposit > 0n && withdraw > 0n),
        "cannot deposit and withdraw collateral together",
      );
      requireRule(
        add(add(deposit, withdraw), change) > 0n && (!increase || change > 0n),
        "adjustment must be nonzero",
      );
      requireRule(withdraw <= collateral, "collateral withdrawal exceeds position");
      if (increase) {
        requireRule(s.canMint, "debt increase requires mint permission");
        fee = recovery || s.feeExempt ? 0n : calculateBorrowingFee(change, s.borrowingRate);
        // The deployed guard compares total debt including interest, not principal alone.
        requireRule(
          add(p.debt, add(change, fee)) <= capacity,
          "debt increase exceeds stored borrowing capacity",
        );
        principal = add(principal, add(change, fee));
        systemDebt = add(systemDebt, add(change, fee));
      } else {
        requireRule(s.canBurn, "adjustment burn requires BorrowerOperations burn permission");
        if (change > 0n) {
          requireRule(
            change <= sub(p.debt, s.gasCompensation) &&
              sub(sub(p.debt, s.gasCompensation), change) >= s.minimumNetDebt,
            "repayment would violate minimum net debt; use close for full repayment",
          );
          requireRule(change <= s.musdBalance, "insufficient MUSD for repayment");
          const split = splitDebtPayment(interest, change);
          principal = sub(principal, split.principalAdjustment);
          interest = sub(interest, split.interestAdjustment);
          systemDebt = sub(systemDebt, change);
          repay = change;
        }
      }
      collateral = sub(add(collateral, deposit), withdraw);
      systemCollateral = sub(add(systemCollateral, deposit), withdraw);
      const newRatio = calculateCollateralRatio(collateral, add(principal, interest), s.price);
      if (recovery) {
        requireRule(withdraw === 0n, "no collateral withdrawal in recovery mode");
        if (increase)
          requireRule(
            newRatio >= s.ccr &&
              newRatio >= calculateCollateralRatio(p.collateral, p.debt, s.price),
            "recovery debt increase must meet CCR and preserve ICR",
          );
      } else
        requireRule(
          newRatio >= s.mcr &&
            calculateCollateralRatio(systemCollateral, systemDebt, s.price) >= s.ccr,
          "adjustment violates collateral ratios",
        );
      if (withdraw > 0n)
        capacity = min(capacity, calculateBorrowingCapacity(collateral, s.price, s.mcr));
    }
  }
  const debt = add(principal, interest);
  const icr = calculateCollateralRatio(collateral, debt, s.price);
  if (
    fee > bounds.maxFee ||
    (action.kind !== "close" &&
      action.kind !== "claim-surplus" &&
      annualRateBps > bounds.maxAnnualRateBps) ||
    (action.kind !== "close" && action.kind !== "claim-surplus" && icr < bounds.minCollateralRatio)
  )
    throw new BorrowingError(
      "BoundsExceeded",
      "forecast exceeds caller fee, rate or collateral ratio bounds",
    );
  return Object.freeze({
    collateral,
    principal,
    interest,
    debt,
    fee,
    annualRateBps,
    maxBorrowingCapacity: capacity,
    icr,
    nicr: calculateNominalCollateralRatio(collateral, principal),
    postTcr: calculateCollateralRatio(systemCollateral, systemDebt, s.price),
    repay,
  });
}
