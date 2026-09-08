import { parseUint } from "@mezo-dev-kit/evm";
import { redemptionRequire } from "./errors.ts";
import { REDEMPTION_MODEL } from "./model.generated.ts";
const precision = BigInt(REDEMPTION_MODEL.decimalPrecision);
export function calculateRedemptionLot(input: {
  readonly remainingRequested: bigint;
  readonly entireDebt: bigint;
  readonly gasCompensation: bigint;
}): bigint {
  const remaining = parseUint(input.remainingRequested),
    debt = parseUint(input.entireDebt),
    reserve = parseUint(input.gasCompensation);
  redemptionRequire(debt >= reserve, "InvalidInput", "entire debt below gas reserve");
  const netDebt = debt - reserve;
  return remaining < netDebt ? remaining : netDebt;
}
export function calculateRedemptionCollateral(input: {
  readonly musdLot: bigint;
  readonly price: bigint;
}): bigint {
  const amount = parseUint(input.musdLot),
    price = parseUint(input.price);
  redemptionRequire(price > 0n, "InvalidInput", "positive protocol price required");
  return parseUint(amount * precision) / price;
}
export function calculateRedemptionFee(input: {
  readonly collateralDrawn: bigint;
  readonly redemptionRate: bigint;
}): bigint {
  const collateral = parseUint(input.collateralDrawn),
    rate = parseUint(input.redemptionRate);
  redemptionRequire(rate <= precision, "InvalidInput", "redemption rate exceeds precision");
  return parseUint(collateral * rate) / precision;
}
export function calculateRedemptionPartialLimit(input: {
  readonly remainingRequested: bigint;
  readonly netDebt: bigint;
  readonly minimumNetDebt: bigint;
}): bigint {
  const remaining = parseUint(input.remainingRequested),
    debt = parseUint(input.netDebt),
    minimum = parseUint(input.minimumNetDebt);
  const capacity = debt > minimum ? debt - minimum : 0n;
  return remaining < capacity ? remaining : capacity;
}
