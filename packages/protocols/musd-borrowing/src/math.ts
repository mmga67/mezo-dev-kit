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
/**
 * Value BTC collateral in 18-decimal USD units, rounding down.
 *
 * @param collateral - Native BTC base units (18 decimals).
 * @param price - Protocol USD/BTC price scaled by 1e18.
 * @throws BorrowingError - Invalid uint256 input or intermediate multiplication overflow.
 */
export function calculateCollateralValue(collateral: bigint, price: bigint): bigint {
  return div(mul(collateral, price), WAD);
}
/**
 * Calculate the 1e18-scaled collateral/debt ratio using floor division.
 *
 * @param collateral - Native BTC base units (18 decimals).
 * @param debt - MUSD debt base units (18 decimals).
 * @param price - Protocol USD/BTC price scaled by 1e18.
 * @returns The ratio, or uint256 max for zero debt; the sentinel is not a finite ratio.
 * @throws BorrowingError - Invalid uint256 input or intermediate overflow.
 */
export function calculateCollateralRatio(collateral: bigint, debt: bigint, price: bigint): bigint {
  uint(collateral);
  uint(debt);
  uint(price);
  return debt === 0n ? MAX : div(mul(collateral, price), debt);
}
/**
 * Calculate the 1e20-scaled sorted-list ratio from collateral and principal.
 *
 * @remarks
 * Principal includes the reserve and excludes interest. Using total debt here would
 * change list ordering. Zero principal returns the uint256-max sentinel.
 * @throws BorrowingError - Invalid unsigned input or intermediate overflow.
 */
export function calculateNominalCollateralRatio(collateral: bigint, principal: bigint): bigint {
  uint(collateral);
  uint(principal);
  return principal === 0n ? MAX : div(mul(collateral, NICR), principal);
}
/**
 * Accrue simple interest in MUSD base units, rounding down once.
 *
 * @param principal - MUSD principal base units (18 decimals).
 * @param annualRateBps - Annual basis-point rate fitting uint16.
 * @param elapsedSeconds - Nonnegative elapsed time, using the generated protocol year.
 * @throws BorrowingError - Invalid bounds or checked intermediate overflow.
 */
export function calculateSimpleInterest(
  principal: bigint,
  annualRateBps: bigint,
  elapsedSeconds: bigint,
): bigint {
  if (uint(annualRateBps) > 65535n)
    throw new BorrowingError("InvalidInput", "annual rate exceeds uint16");
  return div(mul(mul(principal, annualRateBps), elapsedSeconds), mul(BPS, YEAR));
}
/**
 * Calculate the floor-rounded MUSD fee for requested debt.
 *
 * @param requestedDebt - Requested MUSD base units, before this fee.
 * @param borrowingRate - Fee rate scaled by 1e18; distinct from annual basis points.
 * @throws BorrowingError - Invalid uint256 input or intermediate overflow.
 */
export function calculateBorrowingFee(requestedDebt: bigint, borrowingRate: bigint): bigint {
  return div(mul(requestedDebt, borrowingRate), WAD);
}
/**
 * Calculate the deployed nested refinancing fee in MUSD base units.
 *
 * @param netDebt - Net MUSD debt base units.
 * @param percentage - Integer percentage fitting uint8, not basis points.
 * @param borrowingRate - Borrowing fee rate scaled by 1e18.
 * @remarks
 * The percentage product is floored before applying the borrowing rate. Combining
 * the divisions changes boundary results. Parameters come from the read snapshot.
 * @throws BorrowingError - Invalid bounds or checked intermediate overflow.
 */
export function calculateRefinancingFee(
  netDebt: bigint,
  percentage: bigint,
  borrowingRate: bigint,
): bigint {
  if (uint(percentage) > 255n)
    throw new BorrowingError("InvalidInput", "refinance percentage exceeds uint8");
  return calculateBorrowingFee(div(mul(percentage, netDebt), 100n), borrowingRate);
}
/**
 * Calculate a floor-rounded MUSD capacity from collateral, price and required ratio.
 *
 * @param collateral - Native BTC base units (18 decimals).
 * @param price - Protocol USD/BTC price scaled by 1e18.
 * @param minimumCollateralRatio - Positive ratio scaled by 1e18.
 * @remarks
 * This arithmetic does not subtract existing debt or enforce an existing position's
 * stored capacity. Use forecastBorrowing for an operation's eligibility.
 * @throws BorrowingError - Zero denominator, invalid unsigned input or overflow.
 */
export function calculateBorrowingCapacity(
  collateral: bigint,
  price: bigint,
  minimumCollateralRatio: bigint,
): bigint {
  return div(mul(collateral, price), minimumCollateralRatio);
}
/**
 * Allocate a MUSD payment to interest first, then principal.
 *
 * @returns Both adjustments in MUSD base units; their sum equals the payment.
 * @remarks
 * This function knows no principal balance. The operation forecast must separately
 * reject overpayment and minimum-debt violations.
 */
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
/**
 * Calculate a floor-rounded redistribution reward from a stake and index delta.
 *
 * @param cumulative - Current accumulator at the generated 1e18 precision.
 * @param snapshot - The stake owner's prior accumulator value.
 * @throws BorrowingError - Regressed index, invalid unsigned inputs or overflow.
 */
export function calculatePendingReward(
  stake: bigint,
  cumulative: bigint,
  snapshot: bigint,
): bigint {
  return div(mul(stake, sub(cumulative, snapshot)), WAD);
}
