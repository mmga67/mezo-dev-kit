import { expect, test } from "vitest";
import { forecastCLPosition } from "../src/index.ts";
import { clBoundsFixture, clFixture, W } from "./cl-fixture.ts";
test("CL decrease credits principal and accrued fees without pretending it is a wallet payout", () => {
  const snapshot = clFixture(),
    forecast = forecastCLPosition({
      snapshot,
      action: { kind: "decrease", tokenId: 1n, liquidity: W },
      bounds: { ...clBoundsFixture(), minLiquidity: 0n },
    });
  expect(forecast.liquidityAfter).toBe(0n);
  expect(forecast.liquidityDelta).toBe(-W);
  expect(forecast.amount0).toBe(2995354955910780n);
  expect(forecast.tokensOwedAfter0).toBe(3n * W + 2n + forecast.amount0);
  expect(forecast.tokensOwedAfter1).toBe(2n * W + 2n + forecast.amount1);
});
test("new CL boundaries initialize fee snapshots instead of granting prior global fee growth", () => {
  const base = clFixture(),
    snapshot = {
      ...base,
      positions: [],
      liquidity: 0n,
      ticks: base.ticks.map((row) => ({
        ...row,
        initialized: false,
        liquidityGross: 0n,
        liquidityNet: 0n,
      })),
    },
    result = forecastCLPosition({
      snapshot,
      action: { kind: "mint", tickLower: -60, tickUpper: 60, amount0Desired: W, amount1Desired: W },
      bounds: clBoundsFixture(),
    });
  expect(result.lastInsideAfter0X128).toBe(0n);
  expect(result.lastInsideAfter1X128).toBe(0n);
  expect(result.tokensOwedAfter0).toBe(0n);
  expect(result.liquidityDelta).toBeGreaterThan(0n);
});
test("CL collection uses explicit caps, leaves residual accounting and forbids uncleared NFT burn", () => {
  const snapshot = clFixture(),
    bounds = { ...clBoundsFixture(), minLiquidity: 0n },
    result = forecastCLPosition({
      snapshot,
      action: { kind: "collect", tokenId: 1n, amount0Max: 7n, amount1Max: 9n },
      bounds,
    });
  expect(result.amount0).toBe(7n);
  expect(result.amount1).toBe(9n);
  expect(result.tokensOwedAfter0).toBe(3n * W - 5n);
  expect(result.liquidityDelta).toBe(0n);
  expect(() =>
    forecastCLPosition({
      snapshot,
      action: { kind: "burn", tokenId: 1n },
      bounds: { ...bounds, minAmount0: 0n, minAmount1: 0n },
    }),
  ).toThrow(/cleared/);
});
test.for([
  "owner",
  "staked",
  "asset",
  "refund",
  "tick-cap",
  "alignment",
  "price",
  "deadline",
  "minimum",
] as const)("CL %s restriction rejects unsupported or stale position changes", (kind) => {
  let snapshot = clFixture(),
    bounds = clBoundsFixture(),
    action = { kind: "increase" as const, tokenId: 1n, amount0Desired: W, amount1Desired: W };
  if (kind === "owner")
    snapshot = {
      ...snapshot,
      positions: snapshot.positions.map((row) => ({ ...row, owner: snapshot.factory.address })),
    };
  if (kind === "staked")
    snapshot = {
      ...snapshot,
      positions: snapshot.positions.map((row) => ({ ...row, staked: true })),
    };
  if (kind === "asset") snapshot = { ...snapshot, writeCompatible: false };
  if (kind === "refund") snapshot = { ...snapshot, managerNativeBalance: 1n };
  if (kind === "tick-cap") snapshot = { ...snapshot, maxLiquidityPerTick: W };
  if (kind === "alignment") snapshot = { ...snapshot, key: { ...snapshot.key, tickSpacing: 200 } };
  if (kind === "price") bounds = { ...bounds, sqrtPriceMaxX96: bounds.sqrtPriceMinX96 };
  if (kind === "deadline") bounds = { ...bounds, deadline: snapshot.timestamp };
  if (kind === "minimum") action = { ...action, amount0Desired: 0n, amount1Desired: 0n };
  expect(() => forecastCLPosition({ snapshot, action, bounds })).toThrow();
});
