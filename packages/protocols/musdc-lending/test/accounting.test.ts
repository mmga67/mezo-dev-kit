import { describe, expect, test } from "vitest";
import {
  accrueLendingMarket,
  calculateLendingHealth,
  calculateLendingInterest,
  lendingToAssets,
  lendingToShares,
} from "../src/index.ts";
describe("lending exact accounting", () => {
  test("virtual shares preserve directional rounding and do not make a round trip profitable", () => {
    expect(lendingToShares(10n, 1000n, 1_000_000n, "down")).toBe(19980n);
    expect(lendingToShares(10n, 1000n, 1_000_000n, "up")).toBe(19981n);
    expect(lendingToAssets(19980n, 1000n, 1_000_000n, "down")).toBe(9n);
    expect(lendingToAssets(19980n, 1000n, 1_000_000n, "up")).toBe(10n);
    expect(lendingToShares(0n, 0n, 0n, "up")).toBe(0n);
  });
  test("the three-term Taylor accrual truncates each source-defined term", () => {
    expect(calculateLendingInterest(10n ** 12n, 3600n, 1_000_000n)).toEqual({
      compound: 3606487776000000n,
      interest: 3606n,
    });
  });
  test("fee shares dilute supply while interest accrues once to both asset totals", () => {
    const result = accrueLendingMarket(
      {
        totalSupplyAssets: 2_000_000n,
        totalSupplyShares: 2_000_000_000_000n,
        totalBorrowAssets: 1_000_000n,
        totalBorrowShares: 1_000_000_000_000n,
        lastUpdate: 0n,
        fee: 10n ** 17n,
      },
      10n ** 12n,
      3600n,
    );
    expect(result.interest).toBe(3606n);
    expect(result.totalSupplyAssets - result.totalBorrowAssets).toBe(1_000_000n);
    expect(result.feeShares).toBe(359416667n);
    expect(result.totalSupplyShares).toBe(2_000_359_416_667n);
  });
  test("health includes equality at LLTV and applies both floors before comparison", () => {
    const price = 77292270770000000000000000000n;
    expect(calculateLendingHealth(10n ** 18n, price, 860000000000000000n, 66471352862n)).toEqual({
      healthy: true,
      maxBorrowAssets: 66471352862n,
    });
    expect(
      calculateLendingHealth(10n ** 18n, price, 860000000000000000n, 66471352863n).healthy,
    ).toBe(false);
  });
  test.for([-1n, 1n << 256n])("invalid amount %s cannot enter conversions", (value) => {
    expect(() => lendingToShares(value, 1n, 1n, "down")).toThrow();
  });
  test("checked intermediate overflow rejects instead of returning a JS bigint beyond EVM bounds", () => {
    expect(() => calculateLendingInterest(1n << 255n, 2n, 1n)).toThrow();
  });
  test("future storage time, excessive fee, and impossible market totals reject", () => {
    const market = {
      totalSupplyAssets: 10n,
      totalSupplyShares: 10n,
      totalBorrowAssets: 5n,
      totalBorrowShares: 5n,
      lastUpdate: 10n,
      fee: 0n,
    };
    expect(() => accrueLendingMarket(market, 1n, 9n)).toThrow();
    expect(() => accrueLendingMarket(market, 0n, 1n << 128n)).toThrow();
    expect(() => accrueLendingMarket({ ...market, fee: 10n ** 18n + 1n }, 1n, 11n)).toThrow();
    expect(() => accrueLendingMarket({ ...market, totalBorrowAssets: 11n }, 1n, 11n)).toThrow();
  });
});
