import { isUint } from "@mezo-dev-kit/evm";
import { SavingsReadError } from "./errors.ts";
import { SAVINGS_SCALE } from "./model.generated.ts";

const UINT256_MAX = (1n << 256n) - 1n;
/**
 * Integer base units tagged with the accounting asset; a tag does not convert sMUSD principal
 * into MUSD yield.
 */
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
/**
 * One-coordinate sMUSD balance, global/user index and stored MUSD yield. Index precision comes
 * from the generated Savings model.
 */
export interface SavingsYieldInput {
  readonly balance: bigint;
  readonly yieldIndex: bigint;
  readonly supplyYieldIndex: bigint;
  readonly storedClaimableYield: bigint;
}
/**
 * Stored, newly indexed and total claimable MUSD yield. These amounts exclude sMUSD principal
 * and gauge-token rewards.
 */
export interface SavingsYield {
  readonly storedClaimable: SavingsAmount<"MUSD">;
  readonly indexedUnclaimed: SavingsAmount<"MUSD">;
  readonly claimable: SavingsAmount<"MUSD">;
}
/**
 * Separate stored MUSD yield from newly indexed yield for an sMUSD balance.
 *
 * @remarks
 * Balance uses sMUSD base units; stored/output yield uses MUSD base units. Indexes
 * use the generated Savings precision. New yield floors once. A zero balance
 * preserves stored credit without subtracting indexes, matching the contract.
 * @throws SavingsReadError - Invalid input, regressed index for a positive balance,
 * or checked arithmetic overflow.
 */
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
/**
 * Project how received and pending MUSD yield update the Savings index.
 *
 * @remarks
 * Amounts use MUSD base units, totalSupply uses sMUSD base units and yieldIndex
 * uses the generated Savings precision. Zero supply retains all available yield
 * as pending. Otherwise the index increment floors once; a zero increment rejects.
 * This pure model never prepares or submits a distribution.
 * @throws SavingsReadError - Invalid unsigned input, overflow or AmountTooSmall.
 */
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
