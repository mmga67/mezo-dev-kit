import { parseUint } from "@mezo-dev-kit/evm";
import { BORROWING_CONSTANTS } from "./constants.generated.ts";
import { BorrowingError } from "./errors.ts";

const WAD = BigInt(BORROWING_CONSTANTS.decimalPrecision);
const NICR = BigInt(BORROWING_CONSTANTS.nicrPrecision);
const MAX = BigInt(BORROWING_CONSTANTS.uint256Max);
const YEAR = BigInt(BORROWING_CONSTANTS.secondsInProtocolYear);
const BPS = BigInt(BORROWING_CONSTANTS.basisPoints);

export function uint(value: unknown): bigint {
  try {
    return parseUint(value);
  } catch (cause) {
    throw new BorrowingError("InvalidInput", "expected uint256 bigint", { cause });
  }
}
export function add(a: bigint, b: bigint): bigint {
  return uint(uint(a) + uint(b));
}
export function sub(a: bigint, b: bigint): bigint {
  return uint(uint(a) - uint(b));
}
export function mul(a: bigint, b: bigint): bigint {
  return uint(uint(a) * uint(b));
}
export function min(a: bigint, b: bigint): bigint {
  uint(a);
  uint(b);
  return a < b ? a : b;
}
function div(a: bigint, b: bigint): bigint {
  uint(a);
  uint(b);
  if (b === 0n) throw new BorrowingError("InvalidInput", "division by zero");
  return a / b;
}
export function calculateCollateralValue(collateral: bigint, price: bigint): bigint {
  return div(mul(collateral, price), WAD);
}
export function calculateCollateralRatio(collateral: bigint, debt: bigint, price: bigint): bigint {
  uint(collateral);
  uint(debt);
  uint(price);
  return debt === 0n ? MAX : div(mul(collateral, price), debt);
}
export function calculateNominalCollateralRatio(collateral: bigint, principal: bigint): bigint {
  uint(collateral);
  uint(principal);
  return principal === 0n ? MAX : div(mul(collateral, NICR), principal);
}
export function calculateSimpleInterest(
  principal: bigint,
  annualRateBps: bigint,
  elapsedSeconds: bigint,
): bigint {
  if (uint(annualRateBps) > 65535n)
    throw new BorrowingError("InvalidInput", "annual rate exceeds uint16");
  return div(mul(mul(principal, annualRateBps), elapsedSeconds), mul(BPS, YEAR));
}
export function calculateBorrowingFee(requestedDebt: bigint, borrowingRate: bigint): bigint {
  return div(mul(requestedDebt, borrowingRate), WAD);
}
export function calculateRefinancingFee(
  netDebt: bigint,
  percentage: bigint,
  borrowingRate: bigint,
): bigint {
  if (uint(percentage) > 255n)
    throw new BorrowingError("InvalidInput", "refinance percentage exceeds uint8");
  return calculateBorrowingFee(div(mul(percentage, netDebt), 100n), borrowingRate);
}
export function calculateBorrowingCapacity(
  collateral: bigint,
  price: bigint,
  minimumCollateralRatio: bigint,
): bigint {
  return div(mul(collateral, price), minimumCollateralRatio);
}
export function splitDebtPayment(
  interestOwed: bigint,
  payment: bigint,
): Readonly<{ principalAdjustment: bigint; interestAdjustment: bigint }> {
  const interestAdjustment = min(interestOwed, payment);
  return Object.freeze({
    interestAdjustment,
    principalAdjustment: sub(payment, interestAdjustment),
  });
}
export function calculatePendingReward(
  stake: bigint,
  cumulative: bigint,
  snapshot: bigint,
): bigint {
  return div(mul(stake, sub(cumulative, snapshot)), WAD);
}
