import { parseUint } from "@mezo-dev-kit/evm";
import { previewVaultConversion, wrapperToReceipts, wrapperToVaultShares } from "./accounting.ts";
import type { VaultReadValue, VaultSnapshot } from "./types.ts";

export type VaultAction =
  | Readonly<{ kind: "deposit" | "withdraw"; assets: bigint }>
  | Readonly<{ kind: "mint" | "redeem" | "wrap-and-stake"; shares: bigint }>
  | Readonly<{ kind: "unwrap"; receipts: bigint }>;
export interface VaultBounds {
  readonly maxBlockAge: bigint;
  readonly maxPriceAgeSeconds: bigint;
  readonly minOutput: bigint;
  readonly maxInput: bigint;
}
export interface VaultForecast {
  readonly input: bigint;
  readonly output: bigint;
  readonly assets: bigint;
  readonly shares: bigint;
  readonly receipts: bigint;
  readonly requiresApproval: boolean;
}
export type VaultWriteErrorCode =
  | "InvalidInput"
  | "UnavailableState"
  | "InsufficientBalance"
  | "InsufficientLiquidity"
  | "GateClosed"
  | "CapacityExceeded"
  | "BoundsExceeded"
  | "ApprovalRequired"
  | "StaleState"
  | "ReconciliationMismatch";
export class VaultWriteError extends Error {
  readonly code: VaultWriteErrorCode;
  constructor(code: VaultWriteErrorCode, message: string) {
    super(message);
    this.name = "VaultWriteError";
    this.code = code;
  }
}
export function vaultRequired<T>(value: VaultReadValue<T>): Readonly<T> {
  if (value.status !== "available")
    throw new VaultWriteError("UnavailableState", "required vault state unavailable");
  return value.value;
}
export function forecastVault(
  snapshot: VaultSnapshot,
  action: VaultAction,
  bounds: VaultBounds,
): Readonly<VaultForecast> {
  for (const key of ["maxBlockAge", "maxPriceAgeSeconds", "minOutput", "maxInput"] as const)
    parseUint(bounds[key]);
  if (bounds.maxBlockAge === 0n || bounds.maxPriceAgeSeconds === 0n)
    throw new VaultWriteError("InvalidInput", "positive age bounds required");
  let assets = 0n;
  let shares: bigint;
  let receipts = 0n;
  let input: bigint;
  let output: bigint;
  const state = vaultRequired(snapshot.vaultState);
  switch (action.kind) {
    case "deposit":
      assets = parseUint(action.assets, 128);
      shares = previewVaultConversion(state, "deposit", assets);
      input = assets;
      output = shares;
      break;
    case "mint":
      shares = parseUint(action.shares);
      assets = previewVaultConversion(state, "mint", shares);
      input = assets;
      output = shares;
      break;
    case "withdraw":
      assets = parseUint(action.assets, 128);
      shares = previewVaultConversion(state, "withdraw", assets);
      input = shares;
      output = assets;
      break;
    case "redeem":
      shares = parseUint(action.shares);
      assets = previewVaultConversion(state, "redeem", shares);
      input = shares;
      output = assets;
      break;
    case "wrap-and-stake":
      shares = parseUint(action.shares);
      receipts = wrapperToReceipts(
        shares,
        snapshot.wrapperState.receiptSupply.baseUnits,
        vaultRequired(snapshot.harvest).userVaultSharesAfterHarvest.baseUnits,
      );
      input = shares;
      output = receipts;
      break;
    case "unwrap":
      receipts = parseUint(action.receipts);
      shares = wrapperToVaultShares(
        receipts,
        snapshot.wrapperState.receiptSupply.baseUnits,
        vaultRequired(snapshot.harvest).userVaultSharesAfterHarvest.baseUnits,
      );
      input = receipts;
      output = shares;
      break;
    default:
      throw new VaultWriteError("InvalidInput", "unknown vault action");
  }
  if (input === 0n || output === 0n || input > bounds.maxInput || output < bounds.minOutput)
    throw new VaultWriteError(
      "BoundsExceeded",
      "vault conversion exceeds bounds or rounds to zero",
    );
  if (
    (action.kind === "withdraw" || action.kind === "redeem" || action.kind === "wrap-and-stake") &&
    shares > vaultRequired(snapshot.walletVaultShares).baseUnits
  )
    throw new VaultWriteError("InsufficientBalance", "insufficient wallet vault shares");
  if (action.kind === "unwrap" && receipts > vaultRequired(snapshot.walletReceipts).baseUnits)
    throw new VaultWriteError("InsufficientBalance", "unstake receipts before unwrapping");
  if (action.kind === "withdraw" || action.kind === "redeem") {
    const idle = vaultRequired(snapshot.idleLiquidity).baseUnits;
    if (assets > idle) {
      const market = snapshot.underlyingMarket;
      if (
        market.accruedMarket.status !== "available" ||
        market.tokenLiquidity.status !== "available" ||
        market.supplyAssets.status !== "available"
      )
        throw new VaultWriteError("UnavailableState", "withdrawal liquidity unavailable");
      const shortfall = assets - idle;
      if (
        shortfall > market.tokenLiquidity.value.baseUnits ||
        shortfall >
          market.accruedMarket.value.totalSupplyAssets -
            market.accruedMarket.value.totalBorrowAssets ||
        shortfall > market.supplyAssets.value.baseUnits
      )
        throw new VaultWriteError(
          "InsufficientLiquidity",
          "ordinary deallocation cannot supply withdrawal",
        );
    }
  }
  return Object.freeze({
    input,
    output,
    assets,
    shares,
    receipts,
    requiresApproval:
      action.kind === "deposit" || action.kind === "mint" || action.kind === "wrap-and-stake",
  });
}
