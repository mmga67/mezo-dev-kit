import { isUint } from "@mezo-dev-kit/evm";
import { SavingsReadError } from "./errors.ts";
import { SAVINGS_SCALE } from "./model.generated.ts";

const UINT256_MAX = (1n << 256n) - 1n;
export interface SavingsAmount<Unit extends string> {
  readonly unit: Unit;
  readonly baseUnits: bigint;
}
export function uint256(value: unknown, field: string): bigint {
  if (!isUint(value)) throw new SavingsReadError("InvalidReadValue", field);
  return value;
}
function checked(value: bigint, field: string): bigint {
  if (value > UINT256_MAX) throw new SavingsReadError("ArithmeticOverflow", field);
  return value;
}
export function amount<U extends string>(unit: U, value: bigint): Readonly<SavingsAmount<U>> {
  return Object.freeze({ unit, baseUnits: uint256(value, unit) });
}
export interface SavingsYieldInput {
  readonly balance: bigint;
  readonly yieldIndex: bigint;
  readonly supplyYieldIndex: bigint;
  readonly storedClaimableYield: bigint;
}
export interface SavingsYield {
  readonly storedClaimable: SavingsAmount<"MUSD">;
  readonly indexedUnclaimed: SavingsAmount<"MUSD">;
  readonly claimable: SavingsAmount<"MUSD">;
}
export function calculateSavingsYield(input: SavingsYieldInput): Readonly<SavingsYield> {
  const balance = uint256(input?.balance, "balance");
  const index = uint256(input?.yieldIndex, "yieldIndex");
  const userIndex = uint256(input?.supplyYieldIndex, "supplyYieldIndex");
  const stored = uint256(input?.storedClaimableYield, "storedClaimableYield");
  if (balance > 0n && userIndex > index)
    throw new SavingsReadError("InvalidIndex", "supplyYieldIndex");
  // The deployed update skips subtraction entirely for zero receipt balance.
  const accrued =
    balance === 0n
      ? 0n
      : checked(balance * (index - userIndex), "balance*indexDelta") / SAVINGS_SCALE;
  return Object.freeze({
    storedClaimable: amount("MUSD", stored),
    indexedUnclaimed: amount("MUSD", accrued),
    claimable: amount("MUSD", checked(stored + accrued, "claimableYield")),
  });
}
/** Pure accounting model; never constructs or submits a distribution. */
export function calculateSavingsDistribution(input: {
  readonly amount: bigint;
  readonly pendingYield: bigint;
  readonly totalSupply: bigint;
  readonly yieldIndex: bigint;
}): Readonly<{ pendingYield: bigint; yieldIndex: bigint }> {
  const received = uint256(input?.amount, "amount");
  const pending = uint256(input?.pendingYield, "pendingYield");
  const supply = uint256(input?.totalSupply, "totalSupply");
  const index = uint256(input?.yieldIndex, "yieldIndex");
  const available = checked(received + pending, "amount+pendingYield");
  if (supply === 0n) return Object.freeze({ pendingYield: available, yieldIndex: index });
  const ratio = checked(available * SAVINGS_SCALE, "available*scale") / supply;
  if (ratio === 0n) throw new SavingsReadError("AmountTooSmall", "ratio");
  return Object.freeze({
    pendingYield: 0n,
    yieldIndex: checked(index + ratio, "yieldIndex+ratio"),
  });
}
export function beneficialPrincipal(
  walletReceipts: bigint,
  gaugeBeneficialReceipts: bigint,
): SavingsAmount<"sMUSD"> {
  return amount(
    "sMUSD",
    checked(
      uint256(walletReceipts, "walletReceipts") +
        uint256(gaugeBeneficialReceipts, "gaugeBeneficialReceipts"),
      "beneficialPrincipal",
    ),
  );
}
