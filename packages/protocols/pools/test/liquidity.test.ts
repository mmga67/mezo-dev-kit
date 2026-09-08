import { expect, test } from "vitest";
import { forecastBasicLiquidity, sortBasicPoolKey } from "../src/index.ts";
import { snapshot, bounds } from "./fixtures.ts";
test("existing-pool deposits select the limiting desired amount and floor LP shares", () => {
  expect(
    forecastBasicLiquidity(
      snapshot(),
      { kind: "add", amount0Desired: 501n, amount1Desired: 2000n },
      bounds,
    ),
  ).toEqual({
    kind: "add",
    amount0: 501n,
    amount1: 1002n,
    liquidity: 100n,
    nextReserve0: 5501n,
    nextReserve1: 11002n,
    nextTotalSupply: 1100n,
  });
  expect(
    forecastBasicLiquidity(
      snapshot(),
      { kind: "add", amount0Desired: 1000n, amount1Desired: 999n },
      bounds,
    ),
  ).toMatchObject({ amount0: 499n, amount1: 999n, liquidity: 99n });
});
test("withdrawal uses LP shares against both balances and burns exactly the requested shares", () => {
  expect(
    forecastBasicLiquidity(
      snapshot(),
      { kind: "remove", liquidity: 99n },
      { ...bounds, minLiquidity: 0n },
    ),
  ).toEqual({
    kind: "remove",
    amount0: 495n,
    amount1: 990n,
    liquidity: 99n,
    nextReserve0: 4505n,
    nextReserve1: 9010n,
    nextTotalSupply: 901n,
  });
});
test.for([{ poolBalance0: 5001n }, { poolLpBalance: 1n }, { poolBalance1: 9999n }])(
  "donations or pending burns cannot silently enter the quote: %o",
  (change) => {
    expect(() =>
      forecastBasicLiquidity(
        { ...snapshot(), ...change },
        { kind: "add", amount0Desired: 500n, amount1Desired: 1000n },
        bounds,
      ),
    ).toThrow(expect.objectContaining({ code: "UnsafeState" }));
  },
);
test("minimum LP, token outputs, expiry, balance and overflow bounds remain explicit", () => {
  const state = snapshot(),
    add = { kind: "add", amount0Desired: 500n, amount1Desired: 1000n } as const;
  expect(() => forecastBasicLiquidity(state, add, { ...bounds, minLiquidity: 101n })).toThrow();
  expect(() => forecastBasicLiquidity(state, add, { ...bounds, minAmount1: 1001n })).toThrow();
  expect(() => forecastBasicLiquidity(state, add, { ...bounds, deadline: 1000n })).toThrow();
  expect(() =>
    forecastBasicLiquidity(
      state,
      { kind: "remove", liquidity: 101n },
      { ...bounds, minLiquidity: 0n },
    ),
  ).toThrow();
  expect(() => forecastBasicLiquidity({ ...state, totalSupply: 0n }, add, bounds)).toThrow();
  expect(() =>
    forecastBasicLiquidity(state, { ...add, amount0Desired: 1n << 255n }, bounds),
  ).toThrow();
});
test("pool keys preserve stable mode while sorting distinct validated token identities", () => {
  const key = snapshot().key;
  expect(sortBasicPoolKey({ tokenA: key.token1, tokenB: key.token0, stable: true })).toEqual({
    ...key,
    stable: true,
  });
  expect(() =>
    sortBasicPoolKey({ tokenA: key.token0, tokenB: key.token0, stable: true }),
  ).toThrow();
});
