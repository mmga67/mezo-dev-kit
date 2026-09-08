import { parseUint } from "@mezo-dev-kit/evm";
import { INSTITUTIONAL_MODEL } from "./model.generated.ts";

export type InstitutionalDebtErrorCode =
  "InvalidInput" | "IdentityMismatch" | "AccountingMismatch" | "LimitExceeded";
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
export interface InstitutionalDebtInput {
  readonly principal: bigint;
  readonly storedInterest: bigint;
  readonly storedOriginatorFee: bigint;
  readonly lastUpdateTimestamp: bigint;
  readonly interestRateBps: bigint;
  readonly originatorFeeRateBps: bigint;
  readonly asOf: bigint;
}
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
export interface InstitutionalHealth {
  readonly currentCr: bigint;
  readonly warningCr: bigint;
  readonly minimumCr: bigint;
  readonly belowWarning: boolean;
  readonly belowMinimum: boolean;
}
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
export interface InstitutionalAccumulator {
  readonly numerator: bigint;
  readonly lastUpdateTime: bigint;
}
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
