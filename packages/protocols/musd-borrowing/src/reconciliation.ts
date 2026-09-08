import { BorrowingError } from "./errors.ts";
import { uint } from "./math.ts";
import type { BorrowingAction, BorrowingPosition } from "./types.ts";

export function verifyBorrowingUpdate(
  action: BorrowingAction,
  position: BorrowingPosition,
  update: readonly unknown[],
): void {
  const kind = action.kind;
  const expectedOperation =
    kind === "open" ? 0n : kind === "close" ? 1n : kind === "refinance" ? 3n : 2n;
  const increasingDebt = kind === "borrow" || (kind === "adjust" && action.increaseDebt);
  // Pinned BorrowerOperations._updateTroveFromAdjustment leaves newInterest at
  // zero in its debt-increase branch. TroveManager retains materialized interest.
  const expectedEventInterest = increasingDebt ? 0n : position.storedInterest;
  const expectedEventRate = kind === "close" ? 0n : position.annualRateBps;
  const expectedEventTime = kind === "close" ? 0n : position.lastInterestUpdateTime;
  if (
    uint(update[7]) !== expectedOperation ||
    uint(update[1]) !== position.storedPrincipal ||
    uint(update[2]) !== expectedEventInterest ||
    uint(update[3]) !== position.storedCollateral ||
    uint(update[4]) !== position.stake ||
    uint(update[5]) !== expectedEventRate ||
    uint(update[6]) !== expectedEventTime ||
    (kind === "close" ? position.status !== "closed-by-owner" : position.status !== "active")
  )
    throw new BorrowingError(
      "ReconciliationMismatch",
      "borrower event and end-of-block position disagree",
    );
}
