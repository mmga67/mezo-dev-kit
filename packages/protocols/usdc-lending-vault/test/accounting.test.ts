import { describe, expect, test } from "vitest";
import {
  calculateVaultHarvest,
  previewVaultConversion,
  wrapperToReceipts,
  wrapperToVaultShares,
} from "../src/index.ts";
describe("vault and wrapper accounting", () => {
  const state = {
    newTotalAssets: 1_000_000n,
    totalSupply: 10n ** 18n,
    performanceFeeShares: 0n,
    managementFeeShares: 0n,
    virtualShares: 10n ** 12n,
  };
  test("vault virtual shares and fee shares affect all four preview directions", () => {
    expect(previewVaultConversion(state, "deposit", 1_000_000n)).toBe(10n ** 18n);
    expect(previewVaultConversion(state, "mint", 10n ** 18n)).toBe(1_000_000n);
    const feeState = { ...state, performanceFeeShares: 1n, managementFeeShares: 2n };
    expect(previewVaultConversion(feeState, "deposit", 1_000_000n)).toBe(10n ** 18n + 2n);
    expect(previewVaultConversion(feeState, "withdraw", 1_000_000n)).toBe(10n ** 18n + 3n);
    expect(previewVaultConversion(feeState, "redeem", 10n ** 18n)).toBe(999999n);
  });
  test("wrapper conversion uses its own virtual terms and floors both directions", () => {
    expect(wrapperToReceipts(1000n, 9000n, 8000n)).toBe(1000n);
    expect(wrapperToVaultShares(1000n, 9000n, 8000n)).toBe(999n);
  });
  test("only appreciation above the gauge high-water mark becomes yield", () => {
    expect(
      calculateVaultHarvest({
        userVaultShares: 1_000_000n,
        currentRatio: 1_070_000n,
        lastShareRatio: 1_050_000n,
        gaugeSet: true,
      }),
    ).toEqual({ yieldShares: 18691n, newLastShareRatio: 1_070_000n });
    expect(
      calculateVaultHarvest({
        userVaultShares: 1_000_000n,
        currentRatio: 1_020_000n,
        lastShareRatio: 1_050_000n,
        gaugeSet: true,
      }),
    ).toEqual({ yieldShares: 0n, newLastShareRatio: 1_050_000n });
  });
  test("pre-gauge baseline follows the ratio without earmarking even through a dip", () => {
    expect(
      calculateVaultHarvest({
        userVaultShares: 1_000_000n,
        currentRatio: 1_020_000n,
        lastShareRatio: 1_050_000n,
        gaugeSet: false,
      }),
    ).toEqual({ yieldShares: 0n, newLastShareRatio: 1_020_000n });
  });
  test.for([-1n, 1n << 256n])("invalid amount %s rejects", (value) => {
    expect(() => previewVaultConversion(state, "deposit", value)).toThrow();
  });
  test("checked product overflow rejects instead of projecting an impossible EVM value", () => {
    expect(() => wrapperToReceipts(1n << 255n, 10n ** 18n, 1n)).toThrow();
  });
});
