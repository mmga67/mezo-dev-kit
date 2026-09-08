import { expect, test } from "vitest";
import {
  calculateRedemptionLot,
  calculateRedemptionCollateral,
  calculateRedemptionFee,
  calculateRedemptionPartialLimit,
} from "../src/index.ts";
const W = 10n ** 18n;
test("lot excludes reserve, collateral floors per lot and fee floors on aggregate actual collateral", () => {
  expect(
    calculateRedemptionLot({
      remainingRequested: 500n * W,
      entireDebt: 220n * W,
      gasCompensation: 20n * W,
    }),
  ).toBe(200n * W);
  const first = calculateRedemptionCollateral({ musdLot: 100n * W, price: 3n * W }),
    second = calculateRedemptionCollateral({ musdLot: 50n * W, price: 3n * W });
  expect(first).toBe(33333333333333333333n);
  expect(second).toBe(16666666666666666666n);
  expect(
    calculateRedemptionFee({ collateralDrawn: first + second, redemptionRate: W / 100n }),
  ).toBe(499999999999999999n);
});
test("partial capacity preserves minimum debt and differs from full redemption capacity", () => {
  expect(
    calculateRedemptionPartialLimit({
      remainingRequested: 199n * W,
      netDebt: 200n * W,
      minimumNetDebt: 100n * W,
    }),
  ).toBe(100n * W);
  expect(
    calculateRedemptionPartialLimit({
      remainingRequested: W,
      netDebt: 100n * W,
      minimumNetDebt: 100n * W,
    }),
  ).toBe(0n);
});
test("financial helpers reject underflow, overflow, zero price and invalid fee rates", () => {
  expect(() =>
    calculateRedemptionLot({ remainingRequested: 1n, entireDebt: 19n, gasCompensation: 20n }),
  ).toThrow();
  expect(() => calculateRedemptionCollateral({ musdLot: 1n, price: 0n })).toThrow();
  expect(() => calculateRedemptionCollateral({ musdLot: 2n ** 256n - 1n, price: W })).toThrow();
  expect(() => calculateRedemptionFee({ collateralDrawn: W, redemptionRate: W + 1n })).toThrow();
});
