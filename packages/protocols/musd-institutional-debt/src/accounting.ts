import { parseUint } from "@mezo-dev-kit/evm";
import { INSTITUTIONAL_MODEL } from "./model.generated.ts";

export type InstitutionalDebtErrorCode =
  "InvalidInput" | "IdentityMismatch" | "AccountingMismatch" | "LimitExceeded";
/**
 * Typed musd-institutional-debt failure. Branch on code rather than parsing the message.
 * Errors from other injected or foundational boundaries can propagate independently.
 */
export class InstitutionalDebtError extends Error {
  readonly code: InstitutionalDebtErrorCode;
  constructor(code: InstitutionalDebtErrorCode, message: string) {
    super(message);
    this.name = "InstitutionalDebtError";
    this.code = code;
  }
}
export function requireInstitutional(
  condition: boolean,
  code: InstitutionalDebtErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new InstitutionalDebtError(code, message);
}
const constants = INSTITUTIONAL_MODEL.constants;
const denominator = BigInt(constants.basisPoints) * BigInt(constants.secondsInYear);
/**
 * Accrue one institutional fee in MUSD base units, rounding down once.
 *
 * @param input - Elapsed seconds, MUSD principal and annual rate in uint16 basis points.
 * @remarks
 * The denominator uses the generated institutional protocol year. Interest and
 * originator fees are calculated separately to preserve their independent floors.
 * @throws EvmValueError - Invalid unsigned values or checked multiplication overflow.
 */
export function calculateInstitutionalFee(input: {
  readonly elapsedSeconds: bigint;
  readonly principal: bigint;
  readonly rateBps: bigint;
}): bigint {
  const elapsed = parseUint(input.elapsedSeconds),
    principal = parseUint(input.principal),
    rate = parseUint(input.rateBps, 16);
  return parseUint(parseUint(elapsed * principal) * rate) / denominator;
}
/**
 * Stored MUSD principal/fees plus uint16 annual basis-point rates and explicit Unix-second
 * timestamps.
 */
export interface InstitutionalDebtInput {
  readonly principal: bigint;
  readonly storedInterest: bigint;
  readonly storedOriginatorFee: bigint;
  readonly lastUpdateTimestamp: bigint;
  readonly interestRateBps: bigint;
  readonly originatorFeeRateBps: bigint;
  readonly asOf: bigint;
}
/**
 * MUSD debt with independently accrued interest and originator fees. A zero-principal position
 * follows the contract's zero-debt branch.
 */
export interface InstitutionalPositionDebt {
  readonly principal: bigint;
  readonly newInterest: bigint;
  readonly newOriginatorFee: bigint;
  readonly accruedInterest: bigint;
  readonly accruedOriginatorFee: bigint;
  readonly totalDebt: bigint;
}
/** EnclaveDebtManager.getPositionDebt, including its principal-zero early return. */
export function calculateInstitutionalPositionDebt(
  input: InstitutionalDebtInput,
): Readonly<InstitutionalPositionDebt> {
  const principal = parseUint(input.principal),
    storedInterest = parseUint(input.storedInterest),
    storedOriginatorFee = parseUint(input.storedOriginatorFee);
  const start = parseUint(input.lastUpdateTimestamp),
    end = parseUint(input.asOf),
    interestRate = parseUint(input.interestRateBps, 16),
    originatorRate = parseUint(input.originatorFeeRateBps, 16);
  if (principal === 0n)
    return Object.freeze({
      principal,
      newInterest: 0n,
      newOriginatorFee: 0n,
      accruedInterest: 0n,
      accruedOriginatorFee: 0n,
      totalDebt: 0n,
    });
  // PositionFeeAccrual returns zero before multiplication for zero rate or end <= start.
  const fee = (rateBps: bigint) =>
    rateBps === 0n || end <= start
      ? 0n
      : calculateInstitutionalFee({ principal, rateBps, elapsedSeconds: end - start });
  const newInterest = fee(interestRate),
    newOriginatorFee = fee(originatorRate);
  const accruedInterest = parseUint(storedInterest + newInterest),
    accruedOriginatorFee = parseUint(storedOriginatorFee + newOriginatorFee);
  return Object.freeze({
    principal,
    newInterest,
    newOriginatorFee,
    accruedInterest,
    accruedOriginatorFee,
    totalDebt: parseUint(principal + accruedInterest + accruedOriginatorFee),
  });
}
/**
 * 1e18-scaled collateral ratio and thresholds. Equality is allowed; zero debt uses uint256 max.
 */
export interface InstitutionalHealth {
  readonly currentCr: bigint;
  readonly warningCr: bigint;
  readonly minimumCr: bigint;
  readonly belowWarning: boolean;
  readonly belowMinimum: boolean;
}
/**
 * Compare an institutional collateral ratio against warning and minimum thresholds.
 *
 * @remarks
 * BTC/MUSD base units, USD/BTC price and ratios use the package's 18-decimal scales.
 * Threshold equality is not below the threshold. Zero debt yields uint256 max.
 * This calculation does not verify price provenance or refresh its inputs.
 */
export function calculateInstitutionalHealth(input: {
  readonly collateral: bigint;
  readonly price: bigint;
  readonly debt: bigint;
  readonly warningCr: bigint;
  readonly minimumCr: bigint;
}): Readonly<InstitutionalHealth> {
  const collateral = parseUint(input.collateral),
    price = parseUint(input.price),
    debt = parseUint(input.debt),
    warningCr = parseUint(input.warningCr),
    minimumCr = parseUint(input.minimumCr);
  const currentCr =
    debt === 0n ? BigInt(constants.maxUint256) : parseUint(collateral * price) / debt;
  return Object.freeze({
    currentCr,
    warningCr,
    minimumCr,
    belowWarning: currentCr < warningCr,
    belowMinimum: currentCr < minimumCr,
  });
}
/**
 * Accepted fee-first payment allocation or an explicit rejection reason. Rejected economic
 * input is a result, not a thrown error.
 */
export type InstitutionalRepayment =
  | Readonly<{
      accepted: false;
      reason: "payment-below-fees" | "principal-payment-exceeds-principal";
    }>
  | Readonly<{
      accepted: true;
      feePayment: bigint;
      principalPayment: bigint;
      remainingPrincipal: bigint;
    }>;
/**
 * Classify a MUSD payment and, when accepted, allocate fees before principal.
 *
 * @returns An accepted allocation or a rejected result with a reason when payment
 * is below all fees or exceeds principal plus fees. These rejections do not throw.
 * @throws EvmValueError - An input is not a valid uint256 bigint.
 * @remarks
 * All amounts are MUSD base units. No transaction is prepared or submitted.
 */
export function calculateInstitutionalRepayment(input: {
  readonly principal: bigint;
  readonly totalFees: bigint;
  readonly payment: bigint;
}): InstitutionalRepayment {
  const principal = parseUint(input.principal),
    totalFees = parseUint(input.totalFees),
    payment = parseUint(input.payment);
  if (payment < totalFees) return Object.freeze({ accepted: false, reason: "payment-below-fees" });
  const principalPayment = payment - totalFees;
  if (principalPayment > principal)
    return Object.freeze({ accepted: false, reason: "principal-payment-exceeds-principal" });
  return Object.freeze({
    accepted: true,
    feePayment: totalFees,
    principalPayment,
    remainingPrincipal: principal - principalPayment,
  });
}
/**
 * Compare the widened sum of two uint16 basis-point rates with an inclusive cap.
 *
 * @throws EvmValueError - Any rate or the cap does not fit uint16.
 * @remarks
 * The caller supplies the current governed cap; this function performs no read.
 */
export function isInstitutionalRateWithinCap(input: {
  readonly interestRateBps: bigint;
  readonly originatorFeeRateBps: bigint;
  readonly maxCombinedRateBps: bigint;
}): boolean {
  return (
    parseUint(input.interestRateBps, 16) + parseUint(input.originatorFeeRateBps, 16) <=
    parseUint(input.maxCombinedRateBps, 16)
  );
}
/**
 * Aggregate principal-times-basis-point numerator with its Unix-second update time; retain the
 * independent aggregate rounding.
 */
export interface InstitutionalAccumulator {
  readonly numerator: bigint;
  readonly lastUpdateTime: bigint;
}
/**
 * Accrue an aggregate principal-times-rate numerator to explicit Unix seconds.
 *
 * @remarks
 * The numerator aggregates MUSD principal base units times annual basis-point rates.
 * Zero numerator returns zero before timestamp-order validation. Nonzero accrual
 * floors once using the generated denominator.
 * @throws InstitutionalDebtError - A nonzero accumulator starts after asOf.
 * @throws EvmValueError - Invalid uint256 values or intermediate overflow.
 */
export function calculateInstitutionalAccrual(
  input: InstitutionalAccumulator & { readonly asOf: bigint },
): bigint {
  const numerator = parseUint(input.numerator),
    start = parseUint(input.lastUpdateTime),
    end = parseUint(input.asOf);
  if (numerator === 0n) return 0n;
  requireInstitutional(
    end >= start,
    "AccountingMismatch",
    "aggregate accumulator timestamp is in the future",
  );
  return parseUint((end - start) * numerator) / denominator;
}
/**
 * Combine MUSD principal with unpaid stored and newly accrued aggregate fees.
 *
 * @remarks
 * Fees are clamped to zero when settled fees exceed the aggregate fee total,
 * matching the independent aggregate/position rounding boundary. Inputs and result
 * are MUSD base units; the function does not enumerate positions.
 */
export function calculateInstitutionalOutstandingDebt(input: {
  readonly totalPrincipal: bigint;
  readonly totalFeesStored: bigint;
  readonly accrued: bigint;
  readonly totalFeeSettled: bigint;
}): bigint {
  const principal = parseUint(input.totalPrincipal),
    stored = parseUint(input.totalFeesStored),
    accrued = parseUint(input.accrued),
    settled = parseUint(input.totalFeeSettled),
    fees = parseUint(stored + accrued);
  return parseUint(principal + (fees > settled ? fees - settled : 0n));
}
