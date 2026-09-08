import { expect, test } from "vitest";
import { BorrowingError, forecastBorrowing } from "../src/index.ts";
import type { BorrowingBounds, BorrowingSnapshot } from "../src/index.ts";
const W = 10n ** 18n;
test("omitted runtime bounds do not silently disable preflight limits", () => {
  const incomplete: Partial<BorrowingBounds> = { maxFee: 100n * W };
  expect(() => {
    Reflect.apply(forecastBorrowing, undefined, [snapshot(), { kind: "refinance" }, incomplete]);
  }).toThrow(BorrowingError);
});
export const bounds: BorrowingBounds = {
  maxFee: 100n * W,
  maxAnnualRateBps: 1000n,
  minCollateralRatio: 0n,
  maxBlockAge: 20n,
};
export function snapshot(): BorrowingSnapshot {
  return {
    account: "0x0000000000000000000000000000000000000001",
    coordinate: {
      networkId: "mezo-mainnet",
      chainId: 31612n,
      blockNumber: 11703359n,
      blockHash: `0x${"a".repeat(64)}`,
    },
    timestamp: 1000n,
    contracts: {},
    position: {
      stake: 0n,
      ownerArrayIndex: 0n,
      status: "active",
      storedCollateral: W,
      storedPrincipal: 3000n * W,
      storedInterest: 100n * W,
      collateral: W,
      principal: 3000n * W,
      interest: 100n * W,
      pendingCollateral: 0n,
      pendingPrincipal: 0n,
      pendingInterest: 0n,
      accruedInterest: 0n,
      debt: 3100n * W,
      netDebt: 2900n * W,
      annualRateBps: 500n,
      lastInterestUpdateTime: 1000n,
      maxBorrowingCapacity: 4000n * W,
    },
    price: 60000n * W,
    systemCollateral: 100n * W,
    systemDebt: 1000000n * W,
    tcr: 6n * W,
    recoveryMode: false,
    troveCount: 100n,
    gasCompensation: 200n * W,
    minimumNetDebt: 1800n * W,
    mcr: (11n * W) / 10n,
    ccr: (15n * W) / 10n,
    borrowingRate: W / 1000n,
    refinancingFeePercentage: 20n,
    offeredAnnualRateBps: 400n,
    feeExempt: false,
    canMint: true,
    canBurn: true,
    musdBalance: 4000n * W,
    surplus: 0n,
  };
}
test("interest-first repayment preserves reserve and minimum net debt", () => {
  const s = snapshot();
  const result = forecastBorrowing(s, { kind: "repay", amount: 150n * W }, bounds);
  expect(result.principal).toBe(2950n * W);
  expect(result.interest).toBe(0n);
  expect(forecastBorrowing(s, { kind: "repay", amount: 1100n * W }, bounds).debt).toBe(2000n * W);
  expect(() => forecastBorrowing(s, { kind: "repay", amount: 1100n * W + 1n }, bounds)).toThrow();
});
test("capacity guard includes interest; collateral topups do not expand stored capacity", () => {
  const s = snapshot();
  expect(() => forecastBorrowing(s, { kind: "borrow", amount: 950n * W }, bounds)).toThrow();
  expect(
    forecastBorrowing(s, { kind: "add-collateral", collateral: W }, bounds).maxBorrowingCapacity,
  ).toBe(s.position.maxBorrowingCapacity);
});
test("recovery allows repayment and topup but blocks withdrawal, close and refinance", () => {
  const s = { ...snapshot(), systemCollateral: 20n * W, tcr: (12n * W) / 10n, recoveryMode: true };
  expect(forecastBorrowing(s, { kind: "repay", amount: W }, bounds).repay).toBe(W);
  expect(forecastBorrowing(s, { kind: "add-collateral", collateral: W }, bounds).fee).toBe(0n);
  for (const action of [
    { kind: "close" },
    { kind: "refinance" },
    { kind: "withdraw-collateral", collateral: 1n },
  ] as const)
    expect(() => forecastBorrowing(s, action, bounds)).toThrow();
});
test("refinance applies nested floors and updates rate and capacity without cash out", () => {
  const s = snapshot();
  const r = forecastBorrowing(s, { kind: "refinance" }, bounds);
  expect(r.fee).toBe((58n * W) / 100n);
  expect(r.principal).toBe(s.position.principal + r.fee);
  expect(r.annualRateBps).toBe(400n);
  expect(r.maxBorrowingCapacity).toBe((60000n * W * 10n) / 11n);
});
test("open uses composite debt and close returns zero debt", () => {
  const s = snapshot();
  const empty = {
    ...s,
    position: {
      ...s.position,
      status: "nonexistent" as const,
      collateral: 0n,
      principal: 0n,
      interest: 0n,
      debt: 0n,
    },
  };
  expect(
    forecastBorrowing(empty, { kind: "open", collateral: W, borrow: 2000n * W }, bounds).debt,
  ).toBe(2202n * W);
  expect(forecastBorrowing(s, { kind: "close" }, bounds).repay).toBe(2900n * W);
  expect(() => forecastBorrowing({ ...s, troveCount: 1n }, { kind: "close" }, bounds)).toThrow();
});
test("rejects bounds, invalid booleans and contradictory collateral changes", () => {
  expect(() =>
    forecastBorrowing(snapshot(), { kind: "refinance" }, { ...bounds, maxFee: 0n }),
  ).toThrow();
  expect(() =>
    forecastBorrowing(
      snapshot(),
      {
        kind: "adjust",
        depositCollateral: 1n,
        withdrawCollateral: 1n,
        debtChange: 0n,
        increaseDebt: false,
      },
      bounds,
    ),
  ).toThrow();
  expect(() =>
    forecastBorrowing(
      { ...snapshot(), price: 0n },
      { kind: "add-collateral", collateral: 1n },
      bounds,
    ),
  ).toThrow();
  expect(() => forecastBorrowing(snapshot(), { kind: "claim-surplus" }, bounds)).toThrow();
});
