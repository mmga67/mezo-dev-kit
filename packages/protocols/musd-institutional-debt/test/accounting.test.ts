import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  calculateInstitutionalFee,
  calculateInstitutionalPositionDebt,
  calculateInstitutionalHealth,
  calculateInstitutionalRepayment,
  calculateInstitutionalOutstandingDebt,
  calculateInstitutionalAccrual,
  isInstitutionalRateWithinCap,
} from "../src/index.ts";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected fixture object");
  return value as Record<string, unknown>;
}
const moduleUrl = new URL(
  "../../../../knowledge/protocols/musd/institutional-debt/",
  import.meta.url,
);
const index = object(JSON.parse(readFileSync(new URL("index.json", moduleUrl), "utf8")));
if (!Array.isArray(index.resources)) throw new Error("missing fixture resources");
const resource = object(
  index.resources.find(
    (entry: unknown) => object(entry).id === "institutional-debt-formula-fixtures",
  ),
);
if (typeof resource.path !== "string") throw new Error("missing fixture path");
const fixture = object(JSON.parse(readFileSync(new URL(resource.path, moduleUrl), "utf8")));
if (!Array.isArray(fixture.records)) throw new Error("missing fixtures");
for (const raw of fixture.records as readonly unknown[]) {
  const row = object(raw),
    input = object(row.input),
    expected = object(row.expected);
  const number = (name: string) => {
    const value = input[name];
    if (typeof value !== "string" || !/^\d+$/.test(value))
      throw new Error("expected integer fixture");
    return BigInt(value);
  };
  const expectNumber = (value: bigint, name: string) => {
    expect(value.toString()).toBe(expected[name]);
  };
  if (typeof row.id !== "string") throw new Error("missing fixture ID");
  switch (row.operation) {
    case "simple-fee":
      test(row.id, () => {
        expectNumber(
          calculateInstitutionalFee({
            principal: number("principal"),
            elapsedSeconds: number("elapsedSeconds"),
            rateBps: number("rateBps"),
          }),
          "fee",
        );
      });
      break;
    case "collateral-ratio":
      test(row.id, () => {
        expectNumber(
          calculateInstitutionalHealth({
            collateral: number("collateral"),
            price: number("price"),
            debt: number("debt"),
            warningCr: 0n,
            minimumCr: 0n,
          }).currentCr,
          "ratio",
        );
      });
      break;
    case "position-health":
      test(row.id, () => {
        const value = calculateInstitutionalHealth({
          collateral: number("currentCr"),
          price: 1n,
          debt: 1n,
          warningCr: number("warningCr"),
          minimumCr: number("minimumCr"),
        });
        expect(value.belowWarning).toBe(expected.belowWarning);
        expect(value.belowMinimum).toBe(expected.belowMinimum);
      });
      break;
    case "repayment-split":
      test(row.id, () => {
        const value = calculateInstitutionalRepayment({
          principal: number("principal"),
          totalFees: number("totalFees"),
          payment: number("payment"),
        });
        expect(
          JSON.parse(
            JSON.stringify(value, (_, field: unknown) =>
              typeof field === "bigint" ? field.toString() : field,
            ),
          ),
        ).toEqual(expected);
      });
      break;
    case "combined-rate":
      test(row.id, () => {
        expect(
          isInstitutionalRateWithinCap({
            interestRateBps: number("interestRateBps"),
            originatorFeeRateBps: number("originatorFeeRateBps"),
            maxCombinedRateBps: number("maxCombinedRateBps"),
          }),
        ).toBe(expected.accepted);
      });
      break;
    case "outstanding-debt":
      test(row.id, () => {
        expectNumber(
          calculateInstitutionalOutstandingDebt({
            totalPrincipal: number("totalPrincipal"),
            totalFeesStored: number("totalFeesStored"),
            accrued: number("accrued"),
            totalFeeSettled: number("totalFeeSettled"),
          }),
          "outstandingDebt",
        );
      });
      break;
  }
}
const position = {
  principal: 1000000n,
  storedInterest: 10000n,
  storedOriginatorFee: 100n,
  lastUpdateTimestamp: 1000n,
  interestRateBps: 100n,
  originatorFeeRateBps: 0n,
  asOf: 2593000n,
};
test("position floors each fee independently and retains stored balances", () => {
  expect(calculateInstitutionalPositionDebt(position)).toEqual({
    principal: 1000000n,
    newInterest: 821n,
    newOriginatorFee: 0n,
    accruedInterest: 10821n,
    accruedOriginatorFee: 100n,
    totalDebt: 1010921n,
  });
});
test("zero principal early return and future position timestamps match deployed branches", () => {
  expect(calculateInstitutionalPositionDebt({ ...position, principal: 0n }).totalDebt).toBe(0n);
  expect(calculateInstitutionalPositionDebt({ ...position, asOf: 0n }).newInterest).toBe(0n);
  expect(
    calculateInstitutionalPositionDebt({
      ...position,
      interestRateBps: 0n,
      principal: 2n ** 255n,
      storedInterest: 0n,
      storedOriginatorFee: 0n,
    }).totalDebt,
  ).toBe(2n ** 255n);
});
test("aggregate accrual has an independent numerator and a stricter time subtraction", () => {
  expect(
    calculateInstitutionalAccrual({ numerator: 100000000n, lastUpdateTime: 1n, asOf: 31556953n }),
  ).toBe(10000n);
  expect(calculateInstitutionalAccrual({ numerator: 0n, lastUpdateTime: 10n, asOf: 1n })).toBe(0n);
  expect(() =>
    calculateInstitutionalAccrual({ numerator: 1n, lastUpdateTime: 10n, asOf: 1n }),
  ).toThrow("future");
});
test("checked products, totals, signed inputs and uint16 rates reject invalid accounting", () => {
  expect(() =>
    calculateInstitutionalFee({ elapsedSeconds: 2n, principal: 2n ** 255n, rateBps: 1n }),
  ).toThrow();
  expect(() =>
    calculateInstitutionalHealth({
      collateral: 2n ** 255n,
      price: 2n,
      debt: 1n,
      warningCr: 0n,
      minimumCr: 0n,
    }),
  ).toThrow();
  expect(() =>
    calculateInstitutionalFee({ elapsedSeconds: 1n, principal: 1n, rateBps: 65536n }),
  ).toThrow();
  expect(() =>
    calculateInstitutionalPositionDebt({ ...position, storedInterest: 2n ** 256n - 1n }),
  ).toThrow();
  expect(() =>
    calculateInstitutionalRepayment({ principal: 1n, totalFees: 0n, payment: -1n }),
  ).toThrow();
});
