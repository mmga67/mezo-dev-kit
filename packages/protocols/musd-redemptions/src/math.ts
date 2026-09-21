import { parseUint } from "@mezo-dev-kit/evm";
import { redemptionRequire } from "./errors.ts";
import { REDEMPTION_MODEL } from "./model.generated.ts";
const precision = BigInt(REDEMPTION_MODEL.decimalPrecision);
/**
 * Cap a MUSD redemption lot at the position's debt excluding its gas reserve.
 *
 * @param input - Remaining request, entire debt and gas compensation in MUSD base units.
 * @throws RedemptionError - Entire debt is smaller than its reserve.
 */
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
/**
 * Convert a MUSD lot to native BTC base units, rounding down.
 *
 * @param input - MUSD base units and a positive protocol USD/BTC price scaled by 1e18.
 * @throws RedemptionError - Price is zero.
 * @throws EvmValueError - Invalid unsigned inputs or intermediate overflow.
 */
export function calculateRedemptionCollateral(input: {
  readonly musdLot: bigint;
  readonly price: bigint;
}): bigint {
  const amount = parseUint(input.musdLot),
    price = parseUint(input.price);
  redemptionRequire(price > 0n, "InvalidInput", "positive protocol price required");
  return parseUint(amount * precision) / price;
}
/**
 * Calculate the floor-rounded BTC fee on actual aggregate redeemed collateral.
 *
 * @param input - Gross BTC base units and a redemption rate from zero through 1e18.
 * @remarks
 * Apply the fee to aggregate actual gross collateral, not independently to each lot.
 * @throws RedemptionError - The rate exceeds its precision.
 */
export function calculateRedemptionFee(input: {
  readonly collateralDrawn: bigint;
  readonly redemptionRate: bigint;
}): bigint {
  const collateral = parseUint(input.collateralDrawn),
    rate = parseUint(input.redemptionRate);
  redemptionRequire(rate <= precision, "InvalidInput", "redemption rate exceeds precision");
  return parseUint(collateral * rate) / precision;
}
/**
 * Cap a partial MUSD redemption while retaining the required minimum net debt.
 *
 * @returns The smaller of the remaining request and partial capacity, or zero when
 * net debt is at/below the minimum. All amounts are MUSD base units.
 * @remarks
 * A full redemption uses calculateRedemptionLot instead.
 */
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
