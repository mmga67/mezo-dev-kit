import { isUint } from "@mezo-dev-kit/evm";
import { VaultReadError } from "./errors.ts";
import { VAULT_MODEL } from "./model.generated.ts";
/**
 * Tagged base units: underlying assets, vault shares and wrapper receipts have distinct
 * accounting meaning.
 */
export interface VaultAmount<U extends string> {
  readonly unit: U;
  readonly baseUnits: bigint;
}
export function uint(value: unknown, field = "amount"): bigint {
  if (!isUint(value)) throw new VaultReadError("InvalidValue", field);
  return value;
}
export function amount<U extends string>(unit: U, value: bigint): Readonly<VaultAmount<U>> {
  return Object.freeze({ unit, baseUnits: uint(value) });
}
function add(a: bigint, b: bigint): bigint {
  return uint(uint(a) + uint(b));
}
function mulDiv(a: bigint, b: bigint, c: bigint, rounding: "down" | "up"): bigint {
  const product = uint(uint(a) * uint(b));
  uint(c);
  if (c === 0n || !["down", "up"].includes(rounding))
    throw new VaultReadError("InvalidValue", "division");
  return uint(product / c + (rounding === "up" && product % c !== 0n ? 1n : 0n));
}
/** Inputs include the fee shares returned by VaultV2.accrueInterestView at one coordinate. */
export interface VaultPreviewState {
  readonly newTotalAssets: bigint;
  readonly totalSupply: bigint;
  readonly performanceFeeShares: bigint;
  readonly managementFeeShares: bigint;
  readonly virtualShares: bigint;
}
/**
 * Preview a fee-aware VaultV2 asset/share conversion with operation-specific rounding.
 *
 * @param state - One-coordinate totals including the accrueInterestView fee shares.
 * @param value - Asset base units for deposit/withdraw; vault shares for mint/redeem.
 * @returns Shares for deposit/withdraw, assets for mint/redeem. Deposit/redeem round
 * down; mint/withdraw round up. Virtual supply and assets are included.
 * @throws VaultReadError - Invalid operation, unsigned value, denominator or overflow.
 */
export function previewVaultConversion(
  state: VaultPreviewState,
  operation: "deposit" | "mint" | "withdraw" | "redeem",
  value: bigint,
): bigint {
  const supply = add(
      add(add(state.totalSupply, state.performanceFeeShares), state.managementFeeShares),
      state.virtualShares,
    ),
    assets = add(state.newTotalAssets, 1n);
  switch (operation) {
    case "deposit":
      return mulDiv(value, supply, assets, "down");
    case "withdraw":
      return mulDiv(value, supply, assets, "up");
    case "mint":
      return mulDiv(value, assets, supply, "up");
    case "redeem":
      return mulDiv(value, assets, supply, "down");
    default:
      throw new VaultReadError("InvalidValue", "operation");
  }
}
/**
 * Convert vault shares to wrapper receipts, rounding down with the deployed virtual terms.
 *
 * @param receiptSupply - Total wrapper receipt supply at the same coordinate.
 * @param userVaultShares - Wrapper accounting backing its users, not one wallet's balance.
 * @throws VaultReadError - Invalid unsigned inputs or arithmetic overflow.
 */
export function wrapperToReceipts(
  vaultShares: bigint,
  receiptSupply: bigint,
  userVaultShares: bigint,
): bigint {
  return mulDiv(
    vaultShares,
    add(receiptSupply, BigInt(VAULT_MODEL.wrapperVirtualShares)),
    add(userVaultShares, BigInt(VAULT_MODEL.wrapperVirtualAssets)),
    "down",
  );
}
/**
 * Convert wrapper receipts to their backing vault shares, rounding down.
 *
 * @param receiptSupply - Total wrapper receipt supply at the same coordinate.
 * @param userVaultShares - Wrapper accounting backing its users, not one wallet's balance.
 * @remarks
 * This conversion does not harvest yield or submit an unwrap.
 */
export function wrapperToVaultShares(
  receipts: bigint,
  receiptSupply: bigint,
  userVaultShares: bigint,
): bigint {
  return mulDiv(
    receipts,
    add(userVaultShares, BigInt(VAULT_MODEL.wrapperVirtualAssets)),
    add(receiptSupply, BigInt(VAULT_MODEL.wrapperVirtualShares)),
    "down",
  );
}
/**
 * Calculate wrapper yield shares from appreciation above the last share ratio.
 *
 * @remarks
 * When no gauge is set, yield is zero and the ratio tracks the current value.
 * With a gauge, a flat/falling ratio retains the prior high-water mark; appreciation
 * produces floor-rounded yield shares. Inputs must use the same ratio scale.
 * @returns Yield shares and the next accounting ratio without mutating state.
 */
export function calculateVaultHarvest(input: {
  readonly userVaultShares: bigint;
  readonly currentRatio: bigint;
  readonly lastShareRatio: bigint;
  readonly gaugeSet: boolean;
}): Readonly<{ yieldShares: bigint; newLastShareRatio: bigint }> {
  const { userVaultShares, currentRatio, lastShareRatio, gaugeSet } = input;
  uint(userVaultShares);
  uint(currentRatio);
  uint(lastShareRatio);
  if (typeof gaugeSet !== "boolean") throw new VaultReadError("InvalidValue", "gaugeSet");
  if (!gaugeSet) return Object.freeze({ yieldShares: 0n, newLastShareRatio: currentRatio });
  if (currentRatio <= lastShareRatio)
    return Object.freeze({ yieldShares: 0n, newLastShareRatio: lastShareRatio });
  return Object.freeze({
    yieldShares: mulDiv(userVaultShares, currentRatio - lastShareRatio, currentRatio, "down"),
    newLastShareRatio: currentRatio,
  });
}
