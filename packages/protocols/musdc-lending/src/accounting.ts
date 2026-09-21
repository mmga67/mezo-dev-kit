import { isUint } from "@mezo-dev-kit/evm";
import { LENDING_MODEL } from "./model.generated.ts";
import { LendingReadError } from "./errors.ts";

const C = LENDING_MODEL.constants;
const WAD = BigInt(C.WAD);
/**
 * Base-unit value with a market accounting tag; supply shares, borrow shares, BTC collateral
 * and mUSDC assets are not interchangeable.
 */
export interface LendingAmount<Unit extends string> {
  readonly unit: Unit;
  readonly baseUnits: bigint;
}
export function uint(value: unknown, field = "amount", bits = 256): bigint {
  if (!isUint(value, bits)) throw new LendingReadError("InvalidValue", field);
  return value;
}
export function amount<U extends string>(unit: U, value: bigint): LendingAmount<U> {
  return Object.freeze({ unit, baseUnits: uint(value) });
}
function add(a: bigint, b: bigint): bigint {
  return uint(uint(a) + uint(b), "sum");
}
function product(a: bigint, b: bigint): bigint {
  return uint(uint(a) * uint(b), "product");
}
function divide(a: bigint, b: bigint, round: "down" | "up"): bigint {
  if (b === 0n) throw new LendingReadError("InvalidValue", "division by zero");
  const result = a / b;
  return uint(result + (round === "up" && a % b !== 0n ? 1n : 0n));
}
/**
 * Convert asset base units to market shares with the deployed virtual assets/shares.
 *
 * @param totalAssets - Totals for the same market side and coordinate as totalShares.
 * @param rounding - Explicit up/down direction selected for the operation.
 * @throws LendingReadError - Invalid unsigned values, rounding or intermediate overflow.
 */
export function lendingToShares(
  assets: bigint,
  totalAssets: bigint,
  totalShares: bigint,
  rounding: "down" | "up",
): bigint {
  if (rounding !== "up" && rounding !== "down")
    throw new LendingReadError("InvalidValue", "rounding");
  return divide(
    product(assets, add(totalShares, BigInt(C.VIRTUAL_SHARES))),
    add(totalAssets, BigInt(C.VIRTUAL_ASSETS)),
    rounding,
  );
}
/**
 * Convert market shares to asset base units with the deployed virtual assets/shares.
 *
 * @param totalShares - Supply or borrow shares matching totalAssets at one coordinate.
 * @param rounding - Explicit up/down direction; debt estimates commonly require up.
 * @throws LendingReadError - Invalid unsigned values, rounding or intermediate overflow.
 */
export function lendingToAssets(
  shares: bigint,
  totalAssets: bigint,
  totalShares: bigint,
  rounding: "down" | "up",
): bigint {
  if (rounding !== "up" && rounding !== "down")
    throw new LendingReadError("InvalidValue", "rounding");
  return divide(
    product(shares, add(totalAssets, BigInt(C.VIRTUAL_ASSETS))),
    add(totalShares, BigInt(C.VIRTUAL_SHARES)),
    rounding,
  );
}
/**
 * Apply the deployed three-term Taylor interest approximation with integer floors.
 *
 * @param borrowRate - Per-second rate scaled by 1e18, not an annual percentage.
 * @param elapsed - Nonnegative seconds since accrual.
 * @param totalBorrowAssets - Outstanding loan-asset base units.
 * @returns The 1e18-scaled compound increment and accrued asset-base-unit interest.
 * @throws LendingReadError - Invalid unsigned input or checked intermediate overflow.
 */
export function calculateLendingInterest(
  borrowRate: bigint,
  elapsed: bigint,
  totalBorrowAssets: bigint,
): Readonly<{ compound: bigint; interest: bigint }> {
  // Preserve each Taylor-term floor: combining the powers/divisions changes
  // debt and fee-share results at one-unit boundaries.
  const first = product(borrowRate, elapsed);
  const second = product(first, first) / (2n * WAD);
  const third = product(second, first) / (3n * WAD);
  const compound = add(add(first, second), third);
  return Object.freeze({ compound, interest: product(totalBorrowAssets, compound) / WAD });
}
/**
 * Stored or projected market totals. Asset/share quantities keep their own units, lastUpdate is
 * Unix seconds and fee is scaled by 1e18.
 */
export interface LendingMarketState {
  readonly totalSupplyAssets: bigint;
  readonly totalSupplyShares: bigint;
  readonly totalBorrowAssets: bigint;
  readonly totalBorrowShares: bigint;
  readonly lastUpdate: bigint;
  readonly fee: bigint;
}
/**
 * Project market totals and fee-share dilution to an explicit Unix timestamp.
 *
 * @param borrowRate - Per-second rate scaled by 1e18.
 * @param asOf - Seconds at or after market.lastUpdate; no clock or RPC is consulted.
 * @returns Updated totals plus interest and minted fee shares; input is not mutated.
 * @throws LendingReadError - Invalid market bounds, time regression or arithmetic overflow.
 */
export function accrueLendingMarket(
  market: LendingMarketState,
  borrowRate: bigint,
  asOf: bigint,
): Readonly<LendingMarketState & { interest: bigint; feeShares: bigint }> {
  for (const value of Object.values(market)) uint(value, "market", 128);
  uint(asOf, "asOf", 128);
  uint(borrowRate, "borrowRate");
  if (
    asOf < market.lastUpdate ||
    market.fee > WAD ||
    market.totalBorrowAssets > market.totalSupplyAssets
  )
    throw new LendingReadError("InvalidValue", "market bounds");
  const interest = calculateLendingInterest(
    borrowRate,
    asOf - market.lastUpdate,
    market.totalBorrowAssets,
  ).interest;
  const supply = uint(add(market.totalSupplyAssets, interest), "accruedSupplyAssets", 128);
  const borrow = uint(add(market.totalBorrowAssets, interest), "accruedBorrowAssets", 128);
  const feeAmount = product(interest, market.fee) / WAD;
  // Fee shares dilute suppliers against assets excluding the fee itself.
  // Using the full accrued supply here would understate the minted fee shares.
  const feeShares = lendingToShares(
    feeAmount,
    supply - feeAmount,
    market.totalSupplyShares,
    "down",
  );
  return Object.freeze({
    ...market,
    totalSupplyAssets: supply,
    totalBorrowAssets: borrow,
    totalSupplyShares: uint(add(market.totalSupplyShares, feeShares), "accruedSupplyShares", 128),
    lastUpdate: asOf,
    interest,
    feeShares,
  });
}
/**
 * Compare BTC-backed market debt with floor-rounded collateral borrowing power.
 *
 * @param collateral - BTC collateral base units.
 * @param price - Market oracle-scaled price, not an ordinary display USD price.
 * @param lltv - Liquidation loan-to-value ratio scaled by 1e18.
 * @param borrowed - mUSDC debt base units.
 * @returns Maximum borrow assets and inclusive health; zero debt is healthy.
 * @remarks
 * The caller must establish price identity and freshness before using this arithmetic.
 */
export function calculateLendingHealth(
  collateral: bigint,
  price: bigint,
  lltv: bigint,
  borrowed: bigint,
): Readonly<{ healthy: boolean; maxBorrowAssets: bigint }> {
  uint(collateral);
  uint(price);
  uint(lltv);
  uint(borrowed);
  if (lltv > WAD) throw new LendingReadError("InvalidValue", "lltv");
  const maxBorrowAssets =
    product(product(collateral, price) / BigInt(C.ORACLE_PRICE_SCALE), lltv) / WAD;
  return Object.freeze({
    healthy: borrowed === 0n || maxBorrowAssets >= borrowed,
    maxBorrowAssets,
  });
}
