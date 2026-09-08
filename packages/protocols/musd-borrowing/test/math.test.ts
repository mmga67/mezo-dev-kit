import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseUnsignedInteger } from "@mezo-dev-kit/evm";
import {
  calculateBorrowingCapacity,
  calculateBorrowingFee,
  calculateCollateralRatio,
  calculateCollateralValue,
  calculateNominalCollateralRatio,
  calculatePendingReward,
  calculateRefinancingFee,
  calculateSimpleInterest,
  splitDebtPayment,
} from "../src/index.ts";

const functions: Readonly<Record<string, (input: Record<string, bigint>) => unknown>> = {
  "collateral-value": (v) =>
    calculateCollateralValue(required(v, "collateral"), required(v, "price")),
  "collateral-ratio": (v) =>
    calculateCollateralRatio(required(v, "collateral"), required(v, "debt"), required(v, "price")),
  "nominal-collateral-ratio": (v) =>
    calculateNominalCollateralRatio(required(v, "collateral"), required(v, "principal")),
  "simple-interest": (v) =>
    calculateSimpleInterest(
      required(v, "principal"),
      required(v, "annualRateBps"),
      required(v, "elapsedSeconds"),
    ),
  "borrowing-fee": (v) =>
    calculateBorrowingFee(required(v, "requestedDebt"), required(v, "borrowingRate")),
  "refinancing-fee": (v) =>
    calculateRefinancingFee(
      required(v, "netDebt"),
      required(v, "refinancingFeePercentage"),
      required(v, "borrowingRate"),
    ),
  "max-borrowing-capacity": (v) =>
    calculateBorrowingCapacity(
      required(v, "collateral"),
      required(v, "price"),
      required(v, "minimumCollateralRatio"),
    ),
  "debt-payment-split": (v) =>
    splitDebtPayment(required(v, "interestOwed"), required(v, "payment")),
  "pending-reward": (v) =>
    calculatePendingReward(
      required(v, "stake"),
      required(v, "cumulativePerUnit"),
      required(v, "snapshotPerUnit"),
    ),
};
function required(value: Record<string, bigint>, key: string): bigint {
  const found = value[key];
  if (found === undefined) throw new Error(`missing ${key}`);
  return found;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected object");
  return value as Record<string, unknown>;
}
const catalog = object(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../../knowledge/protocols/musd/borrowing/fixtures/formulas.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
if (!Array.isArray(catalog.records)) throw new Error("missing canonical fixtures");
const cases = catalog.records
  .map((entry: unknown) => object(entry))
  .filter(
    (entry) => typeof entry.formulaId === "string" && functions[entry.formulaId] !== undefined,
  );
describe("canonical borrowing formula conformance", () => {
  test.for(cases)("$id", (fixture) => {
    if (typeof fixture.formulaId !== "string") throw new Error("invalid formula id");
    const fn = functions[fixture.formulaId];
    if (!fn) throw new Error("missing fixture implementation");
    const input = Object.fromEntries(
      Object.entries(object(fixture.inputs)).map(([key, value]) => [
        key,
        parseUnsignedInteger(value),
      ]),
    );
    const actual = JSON.parse(
      JSON.stringify(fn(input), (_key, value: unknown) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ) as unknown;
    expect(actual).toEqual(fixture.expected);
  });
  test("rejects Solidity overflow and underflow even when final quotient would fit", () => {
    expect(() => calculateCollateralRatio((1n << 256n) - 1n, 10n, 2n)).toThrow();
    expect(() => calculateSimpleInterest(1n, 65536n, 1n)).toThrow();
    expect(() => calculatePendingReward(1n, 0n, 1n)).toThrow();
    expect(() => calculateBorrowingCapacity(1n, 1n, 0n)).toThrow();
    expect(() => calculateBorrowingFee(-1n, 1n)).toThrow();
  });
});
