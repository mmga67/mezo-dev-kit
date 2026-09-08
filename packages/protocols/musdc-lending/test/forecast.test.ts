import { expect, test } from "vitest";
import { createLendingReader, forecastLending } from "../src/index.ts";
import type { LendingBounds, LendingAction } from "../src/index.ts";
import { fixture, ACCOUNT, TIME } from "./fixture.ts";

const bounds: LendingBounds = {
  maxBlockAge: 20n,
  maxPriceAgeSeconds: 300n,
  minAssets: 1n,
  maxAssets: 1_000_000n,
  minShares: 0n,
  maxShares: 10n ** 30n,
  minBorrowHeadroom: 0n,
};
async function snapshot() {
  const f = await fixture();
  f.values.set("market", [
    2_000_000n,
    2_000_000_000_000n,
    1_000_000n,
    1_000_000_000_000n,
    TIME,
    0n,
  ]);
  return createLendingReader(f.config).read({ account: ACCOUNT, maxPriceAgeSeconds: 300n });
}
test.for([
  { kind: "supply", shares: 100_000_000n },
  { kind: "withdraw", shares: 100_000_000n },
  { kind: "borrow", shares: 100_000_000n },
  { kind: "repay", shares: 100_000_000n },
] as const)("$kind uses the market's exact asset/share scale", async ({ kind, shares }) => {
  const result = forecastLending(await snapshot(), { kind, quantity: { assets: 100n } }, bounds);
  expect(result.assets).toBe(100n);
  expect(result.shares).toBe(shares);
});
test("full repayment by shares clears debt and collateral withdrawal needs no price at zero debt", async () => {
  const state = await snapshot();
  expect(state.position.status).toBe("available");
  if (state.position.status !== "available") throw new Error("missing position");
  const result = forecastLending(
    state,
    { kind: "repay", quantity: { shares: state.position.value.borrowShares.baseUnits } },
    bounds,
  );
  expect(result.borrowShares).toBe(0n);
  expect(result.debt).toBe(0n);
  const cleared = {
    ...state,
    position: {
      status: "available" as const,
      value: {
        ...state.position.value,
        borrowShares: { unit: "Morpho-borrow-shares" as const, baseUnits: 0n },
      },
    },
    price: {
      status: "unavailable" as const,
      error: { code: "PriceMissingTime" as const, field: "price" },
    },
  };
  expect(
    forecastLending(
      cleared,
      { kind: "withdraw-collateral", assets: 10n ** 18n },
      { ...bounds, maxAssets: 10n ** 18n },
    ).collateral,
  ).toBe(0n);
});
test("ambiguous amounts, rounding to zero, depleted liquidity and unhealthy withdrawal fail", async () => {
  const state = await snapshot();
  expect(() => {
    Reflect.apply(forecastLending, undefined, [
      state,
      { kind: "repay", quantity: { assets: 1n, shares: 1n } },
      bounds,
    ]);
  }).toThrow("exactly one");
  expect(() =>
    forecastLending(state, { kind: "withdraw", quantity: { shares: 1n } }, bounds),
  ).toThrow("zero");
  expect(() =>
    forecastLending(
      {
        ...state,
        tokenLiquidity: { status: "available", value: { unit: "mUSDC", baseUnits: 0n } },
      },
      { kind: "borrow", quantity: { assets: 1n } },
      bounds,
    ),
  ).toThrow("liquidity");
  expect(() =>
    forecastLending(
      state,
      { kind: "withdraw-collateral", assets: 10n ** 18n },
      { ...bounds, maxAssets: 10n ** 18n },
    ),
  ).toThrow("collateral bound");
});
test("collateral supply needs neither accrued debt nor price, and every explicit bound is required", async () => {
  const state = await snapshot();
  const action: LendingAction = { kind: "supply-collateral", assets: 1n };
  const missing = {
    status: "unavailable" as const,
    error: { code: "ReadUnavailable" as const, field: "provider" },
  };
  expect(
    forecastLending({ ...state, accruedMarket: missing, price: missing }, action, bounds)
      .collateral,
  ).toBe(10n ** 18n + 1n);
  expect(() => {
    Reflect.apply(forecastLending, undefined, [state, action, { maxBlockAge: 1n }]);
  }).toThrow();
});
test("accrual credits the fee recipient's supply shares before a withdrawal", async () => {
  const state = await snapshot();
  if (state.accruedMarket.status !== "available" || state.position.status !== "available")
    throw new Error("missing state");
  const feeShares = 1_000_000n;
  const result = forecastLending(
    {
      ...state,
      accruedMarket: {
        status: "available",
        value: {
          ...state.accruedMarket.value,
          feeShares,
          totalSupplyShares: state.accruedMarket.value.totalSupplyShares + feeShares,
        },
      },
    },
    {
      kind: "withdraw",
      quantity: { shares: state.position.value.supplyShares.baseUnits + feeShares },
    },
    bounds,
  );
  expect(result.supplyShares).toBe(0n);
});
