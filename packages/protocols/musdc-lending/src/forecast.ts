import { parseUint } from "@mezo-dev-kit/evm";
import { calculateLendingHealth, lendingToAssets, lendingToShares } from "./accounting.ts";
import { LENDING_MODEL } from "./model.generated.ts";
import type { LendingSnapshot, LendingReadValue } from "./types.ts";

export type LendingQuantity =
  Readonly<{ assets: bigint; shares?: never }> | Readonly<{ shares: bigint; assets?: never }>;
export type LendingAction =
  | Readonly<{ kind: "supply" | "withdraw" | "borrow" | "repay"; quantity: LendingQuantity }>
  | Readonly<{ kind: "supply-collateral"; assets: bigint }>
  | Readonly<{ kind: "withdraw-collateral"; assets: bigint }>;
export interface LendingBounds {
  readonly maxBlockAge: bigint;
  readonly maxPriceAgeSeconds: bigint;
  readonly maxAssets: bigint;
  readonly minAssets: bigint;
  readonly maxShares: bigint;
  readonly minShares: bigint;
  readonly minBorrowHeadroom: bigint;
}
export interface LendingForecast {
  readonly assets: bigint;
  readonly shares: bigint;
  readonly collateral: bigint;
  readonly supplyShares: bigint;
  readonly borrowShares: bigint;
  readonly debt: bigint | null;
  readonly requiresApproval: boolean;
  readonly assetKind: "loan-token" | "collateral-token";
}
export type LendingWriteErrorCode =
  | "InvalidInput"
  | "UnavailableState"
  | "InsufficientBalance"
  | "InsufficientLiquidity"
  | "UnhealthyPosition"
  | "BoundsExceeded"
  | "ApprovalRequired"
  | "StaleState"
  | "ReconciliationMismatch";
export class LendingWriteError extends Error {
  readonly code: LendingWriteErrorCode;
  constructor(code: LendingWriteErrorCode, message: string) {
    super(message);
    this.name = "LendingWriteError";
    this.code = code;
  }
}
export function lendingRequired<T>(value: LendingReadValue<T>): Readonly<T> {
  if (value.status !== "available")
    throw new LendingWriteError("UnavailableState", "required lending state unavailable");
  return value.value;
}
export function lendingQuantity(input: LendingQuantity): readonly [bigint, bigint] {
  if (!input || (input.assets === undefined) === (input.shares === undefined))
    throw new LendingWriteError("InvalidInput", "select exactly one of assets or shares");
  const assets = input.assets === undefined ? 0n : parseUint(input.assets);
  const shares = input.shares === undefined ? 0n : parseUint(input.shares);
  if (assets === 0n && shares === 0n)
    throw new LendingWriteError("InvalidInput", "positive quantity required");
  return Object.freeze([assets, shares]);
}
export function forecastLending(
  snapshot: LendingSnapshot,
  action: LendingAction,
  bounds: LendingBounds,
): Readonly<LendingForecast> {
  for (const key of [
    "maxBlockAge",
    "maxPriceAgeSeconds",
    "maxAssets",
    "minAssets",
    "maxShares",
    "minShares",
    "minBorrowHeadroom",
  ] as const)
    parseUint(bounds[key]);
  if (
    bounds.maxBlockAge === 0n ||
    bounds.maxPriceAgeSeconds === 0n ||
    bounds.minAssets > bounds.maxAssets ||
    bounds.minShares > bounds.maxShares
  )
    throw new LendingWriteError("InvalidInput", "invalid lending bounds");
  if (
    !action ||
    !["supply", "withdraw", "borrow", "repay", "supply-collateral", "withdraw-collateral"].includes(
      action.kind,
    )
  )
    throw new LendingWriteError("InvalidInput", "unknown lending action");
  const position = lendingRequired(snapshot.position);
  let collateral = parseUint(position.collateral.baseUnits, 128);
  let supplyShares = parseUint(position.supplyShares.baseUnits);
  let borrowShares = parseUint(position.borrowShares.baseUnits, 128);
  let assets: bigint;
  let shares = 0n;
  let debt: bigint | null = null;
  const market =
    action.kind === "supply-collateral"
      ? snapshot.storedMarket
      : lendingRequired(snapshot.accruedMarket);
  if (action.kind !== "supply-collateral") {
    const accrued = lendingRequired(snapshot.accruedMarket);
    if (accrued.feeShares > 0n) {
      if (!snapshot.feeRecipient)
        throw new LendingWriteError(
          "UnavailableState",
          "fee recipient required for accrued shares",
        );
      if (lendingRequired(snapshot.feeRecipient) === snapshot.account)
        supplyShares = parseUint(supplyShares + accrued.feeShares);
    }
  }
  let totalBorrowAssets = market.totalBorrowAssets;
  let totalBorrowShares = market.totalBorrowShares;
  if (action.kind === "supply-collateral" || action.kind === "withdraw-collateral") {
    assets = parseUint(action.assets, 128);
    if (assets === 0n) throw new LendingWriteError("InvalidInput", "positive collateral required");
    if (action.kind === "withdraw-collateral" && assets > collateral)
      throw new LendingWriteError("InsufficientBalance", "insufficient collateral");
    collateral = parseUint(
      action.kind === "supply-collateral" ? collateral + assets : collateral - assets,
      128,
    );
  } else {
    const [inputAssets, inputShares] = lendingQuantity(action.quantity);
    const supply = action.kind === "supply" || action.kind === "withdraw";
    const totalAssets = supply ? market.totalSupplyAssets : market.totalBorrowAssets;
    const totalShares = supply ? market.totalSupplyShares : market.totalBorrowShares;
    const adding = action.kind === "supply" || action.kind === "repay";
    assets =
      inputAssets || lendingToAssets(inputShares, totalAssets, totalShares, adding ? "up" : "down");
    shares =
      inputShares || lendingToShares(inputAssets, totalAssets, totalShares, adding ? "down" : "up");
    if (assets === 0n || shares === 0n)
      throw new LendingWriteError("BoundsExceeded", "conversion rounds to zero");
    parseUint(assets, 128);
    parseUint(shares, 128);
    if (action.kind === "supply") {
      supplyShares = parseUint(supplyShares + shares);
      parseUint(market.totalSupplyShares + shares, 128);
      parseUint(market.totalSupplyAssets + assets, 128);
    }
    if (action.kind === "withdraw") {
      if (shares > supplyShares)
        throw new LendingWriteError("InsufficientBalance", "insufficient supply shares");
      supplyShares -= shares;
    }
    if (action.kind === "borrow") {
      borrowShares = parseUint(borrowShares + shares, 128);
      totalBorrowShares = parseUint(totalBorrowShares + shares, 128);
      totalBorrowAssets = parseUint(totalBorrowAssets + assets, 128);
    }
    if (action.kind === "repay") {
      if (shares > borrowShares)
        throw new LendingWriteError("InsufficientBalance", "repayment exceeds current shares");
      borrowShares -= shares;
      totalBorrowShares -= shares;
      totalBorrowAssets = totalBorrowAssets > assets ? totalBorrowAssets - assets : 0n;
    }
    if (action.kind === "withdraw" || action.kind === "borrow") {
      const liquidity = market.totalSupplyAssets - market.totalBorrowAssets;
      if (assets > liquidity || assets > lendingRequired(snapshot.tokenLiquidity).baseUnits)
        throw new LendingWriteError(
          "InsufficientLiquidity",
          "insufficient accounting or token liquidity",
        );
    }
  }
  if (
    assets < bounds.minAssets ||
    assets > bounds.maxAssets ||
    shares < bounds.minShares ||
    shares > bounds.maxShares
  )
    throw new LendingWriteError("BoundsExceeded", "conversion exceeds explicit bounds");
  if (action.kind !== "supply-collateral")
    debt = lendingToAssets(borrowShares, totalBorrowAssets, totalBorrowShares, "up");
  if (action.kind === "borrow" || action.kind === "withdraw-collateral") {
    if (debt === null) throw new LendingWriteError("UnavailableState", "missing accrued debt");
    if (debt !== 0n || bounds.minBorrowHeadroom > 0n) {
      const price = lendingRequired(snapshot.price);
      if (
        price.asOf !== snapshot.asOf ||
        price.publishedAt > snapshot.asOf ||
        snapshot.asOf - price.publishedAt > bounds.maxPriceAgeSeconds
      )
        throw new LendingWriteError("StaleState", "oracle datum expired");
      const health = calculateLendingHealth(
        collateral,
        price.price,
        BigInt(LENDING_MODEL.lltv),
        debt,
      );
      if (!health.healthy || health.maxBorrowAssets - debt < bounds.minBorrowHeadroom)
        throw new LendingWriteError(
          "UnhealthyPosition",
          "post-operation debt exceeds collateral bound",
        );
    }
  }
  return Object.freeze({
    assets,
    shares,
    collateral,
    supplyShares,
    borrowShares,
    debt,
    requiresApproval:
      action.kind === "supply" || action.kind === "repay" || action.kind === "supply-collateral",
    assetKind:
      action.kind === "supply-collateral" || action.kind === "withdraw-collateral"
        ? "collateral-token"
        : "loan-token",
  });
}
