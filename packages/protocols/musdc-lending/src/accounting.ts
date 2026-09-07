import { LENDING_MODEL } from "./model.generated.ts";
import { LendingReadError } from "./errors.ts";

const C = LENDING_MODEL.constants;
const WAD = BigInt(C.WAD);
export interface LendingAmount<Unit extends string> {
  readonly unit: Unit;
  readonly baseUnits: bigint;
}
export function uint(value: unknown, field = "amount", bits = 256): bigint {
  if (typeof value !== "bigint" || value < 0n || value > (1n << BigInt(bits)) - 1n)
    throw new LendingReadError("InvalidValue", field);
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
export function calculateLendingInterest(
  borrowRate: bigint,
  elapsed: bigint,
  totalBorrowAssets: bigint,
): Readonly<{ compound: bigint; interest: bigint }> {
  const first = product(borrowRate, elapsed);
  const second = product(first, first) / (2n * WAD);
  const third = product(second, first) / (3n * WAD);
  const compound = add(add(first, second), third);
  return Object.freeze({ compound, interest: product(totalBorrowAssets, compound) / WAD });
}
export interface LendingMarketState {
  readonly totalSupplyAssets: bigint;
  readonly totalSupplyShares: bigint;
  readonly totalBorrowAssets: bigint;
  readonly totalBorrowShares: bigint;
  readonly lastUpdate: bigint;
  readonly fee: bigint;
}
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
