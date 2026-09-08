import { expect, test } from "vitest";
import { calculateBasicPoolFees, calculateBasicSwapFee } from "../src/index.ts";
const unit = 10n ** 18n;
const input = {
  balance: 3n,
  index0: unit,
  index1: unit,
  supplyIndex0: 0n,
  supplyIndex1: 0n,
  claimable0: 2n,
  claimable1: 7n,
};
test("wallet fee indices floor each asset independently and preserve stored credit", () => {
  expect(calculateBasicPoolFees({ ...input, index0: unit / 2n })).toMatchObject({
    pending0: 3n,
    pending1: 10n,
  });
  expect(calculateBasicPoolFees({ ...input, balance: 0n, supplyIndex0: unit + 1n })).toMatchObject({
    pending0: 2n,
    pending1: 7n,
  });
});
test("fee index underflow, checked product overflow and accumulated overflow reject", () => {
  expect(() => calculateBasicPoolFees({ ...input, supplyIndex0: unit + 1n })).toThrow(
    "index regressed",
  );
  expect(() => calculateBasicPoolFees({ ...input, balance: 2n ** 255n })).toThrow();
  expect(() => calculateBasicPoolFees({ ...input, claimable0: 2n ** 256n - 1n })).toThrow();
  expect(() => calculateBasicPoolFees({ ...input, balance: -1n })).toThrow();
});
test("basic fee calculation matches gross-input floor and uint256 bounds", () => {
  expect(calculateBasicSwapFee({ amountIn: 4999n, feeBps: 2n })).toBe(0n);
  expect(calculateBasicSwapFee({ amountIn: 5000n, feeBps: 2n })).toBe(1n);
  expect(calculateBasicSwapFee({ amountIn: 10000000n, feeBps: 2n })).toBe(2000n);
  expect(() => calculateBasicSwapFee({ amountIn: 1n, feeBps: 10000n })).toThrow();
  expect(() => calculateBasicSwapFee({ amountIn: 2n ** 255n, feeBps: 2n })).toThrow();
});
