import { BorrowingError } from "./errors.ts";
import { add, calculateSimpleInterest, sub, uint } from "./math.ts";
import type { BorrowerStatus, BorrowingPosition } from "./types.ts";

const statuses: readonly BorrowerStatus[] = [
  "nonexistent",
  "active",
  "closed-by-owner",
  "closed-by-liquidation",
  "closed-by-redemption",
];

export function isBorrowerStatus(value: unknown): value is BorrowerStatus {
  return typeof value === "string" && (statuses as readonly string[]).includes(value);
}

/** Decode already-entire amounts without adding pending rewards or interest twice. */
export function normalizeBorrowingPosition(input: {
  readonly stored: readonly unknown[];
  readonly entire: readonly unknown[];
  readonly timestamp: bigint;
  readonly gasCompensation: bigint;
}): Readonly<BorrowingPosition> {
  if (
    !Array.isArray(input.stored) ||
    input.stored.length !== 9 ||
    !Array.isArray(input.entire) ||
    input.entire.length !== 6
  )
    throw new BorrowingError("InvalidState", "expected Troves and getEntireDebtAndColl tuples");
  const stored = input.stored.map(uint);
  const entire = input.entire.map(uint);
  const status = statuses[Number(uint(stored[4]))];
  if (!status) throw new BorrowingError("InvalidState", "unknown borrower status");
  const storedCollateral = uint(stored[0]);
  const storedPrincipal = uint(stored[1]);
  const storedInterest = uint(stored[2]);
  const collateral = uint(entire[0]);
  const principal = uint(entire[1]);
  const interest = uint(entire[2]);
  const pendingCollateral = uint(entire[3]);
  const pendingPrincipal = uint(entire[4]);
  const pendingInterest = uint(entire[5]);
  const annualRateBps = uint(stored[5]);
  const lastInterestUpdateTime = uint(stored[6]);
  const accruedInterest = calculateSimpleInterest(
    storedPrincipal,
    annualRateBps,
    sub(input.timestamp, lastInterestUpdateTime),
  );
  if (
    collateral !== add(storedCollateral, pendingCollateral) ||
    principal !== add(storedPrincipal, pendingPrincipal) ||
    interest !== add(add(storedInterest, accruedInterest), pendingInterest)
  )
    throw new BorrowingError(
      "InvalidState",
      "entire position disagrees with stored, pending or accrued amounts",
    );
  if (
    status !== "active" &&
    (pendingCollateral !== 0n || pendingPrincipal !== 0n || pendingInterest !== 0n)
  )
    throw new BorrowingError("InvalidState", "inactive trove has pending redistribution");
  const debt = add(principal, interest);
  const reserve = uint(input.gasCompensation);
  if (uint(stored[8]) >= 1n << 128n || (status === "active" && principal < reserve))
    throw new BorrowingError("InvalidState", "invalid owner index or active reserve accounting");
  return Object.freeze({
    status,
    storedCollateral,
    storedPrincipal,
    storedInterest,
    collateral,
    principal,
    interest,
    pendingCollateral,
    pendingPrincipal,
    pendingInterest,
    accruedInterest,
    debt,
    netDebt: status === "active" ? sub(debt, reserve) : debt,
    annualRateBps,
    lastInterestUpdateTime,
    maxBorrowingCapacity: uint(stored[7]),
    stake: uint(stored[3]),
    ownerArrayIndex: uint(stored[8]),
  });
}
