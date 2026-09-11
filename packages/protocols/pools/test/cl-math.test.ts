import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  calculateCLAmounts,
  calculateCLFees,
  calculateCLLiquidity,
  getCLTickAtSqrtRatio,
  getCLTickSqrtRatio,
  getCLUsableTicks,
} from "../src/index.ts";
const q96 = 1n << 96n,
  q128 = 1n << 128n;
const range = {
  sqrtPriceX96: q96,
  sqrtLowerX96: getCLTickSqrtRatio(-60),
  sqrtUpperX96: getCLTickSqrtRatio(60),
};
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
const fixture = object(
  JSON.parse(
    readFileSync(
      new URL("../../../../knowledge/protocols/pools/fixtures/math.json", import.meta.url),
      "utf8",
    ),
  ),
);
assert(Array.isArray(fixture.records));
test.for(
  fixture.records
    .filter((row: unknown) =>
      [
        "sqrt-ratio-at-tick",
        "usable-tick-bounds",
        "amounts-for-liquidity",
        "liquidity-for-amounts",
      ].includes(String(object(row).operation)),
    )
    .map((row: unknown) => object(row)),
)("canonical CL fixture $id", (row) => {
  const input = object(row.input),
    expected = object(row.expected);
  if (row.operation === "sqrt-ratio-at-tick") {
    assert(typeof input.tick === "number");
    expect(getCLTickSqrtRatio(input.tick).toString()).toBe(expected.sqrtPriceX96);
  } else if (row.operation === "usable-tick-bounds") {
    assert(typeof input.tickSpacing === "number");
    expect(getCLUsableTicks(input.tickSpacing)).toEqual({
      tickLower: expected.minUsableTick,
      tickUpper: expected.maxUsableTick,
    });
  } else {
    const prices = {
      sqrtPriceX96: BigInt(String(input.sqrtCurrentX96)),
      sqrtLowerX96: BigInt(String(input.sqrtLowerX96)),
      sqrtUpperX96: BigInt(String(input.sqrtUpperX96)),
    };
    if (row.operation === "amounts-for-liquidity")
      expect(
        calculateCLAmounts({
          ...prices,
          liquidity: BigInt(String(input.liquidity)),
          rounding: "down",
        }),
      ).toEqual({
        amount0: BigInt(String(expected.amount0)),
        amount1: BigInt(String(expected.amount1)),
      });
    else
      expect(
        calculateCLLiquidity({
          ...prices,
          amount0: BigInt(String(input.amount0)),
          amount1: BigInt(String(input.amount1)),
        }).toString(),
      ).toBe(expected.liquidity);
  }
});
test("inverse ticks preserve exact boundaries including adjacent wei and the excluded maximum", () => {
  for (const tick of [-887272, -100000, -60, -1, 0, 1, 60, 100000, 887271]) {
    const ratio = getCLTickSqrtRatio(tick);
    expect(getCLTickAtSqrtRatio(ratio)).toBe(tick);
    if (tick > -887272) expect(getCLTickAtSqrtRatio(ratio - 1n)).toBe(tick - 1);
  }
  expect(getCLTickAtSqrtRatio(getCLTickSqrtRatio(887272) - 1n)).toBe(887271);
  for (const value of [getCLTickSqrtRatio(-887272) - 1n, getCLTickSqrtRatio(887272)])
    expect(() => getCLTickAtSqrtRatio(value)).toThrow();
  for (const value of [NaN, 1.5, -887273, 887273])
    expect(() => getCLTickSqrtRatio(value)).toThrow();
});
test("mint ceil is sufficient while principal floor can be zero on a narrow small position", () => {
  expect(calculateCLAmounts({ ...range, liquidity: 1n, rounding: "down" })).toEqual({
    amount0: 0n,
    amount1: 0n,
  });
  expect(calculateCLAmounts({ ...range, liquidity: 1n, rounding: "up" })).toEqual({
    amount0: 1n,
    amount1: 1n,
  });
  for (const current of [
    range.sqrtLowerX96 - 1n,
    range.sqrtLowerX96,
    q96,
    range.sqrtUpperX96,
    range.sqrtUpperX96 + 1n,
  ]) {
    const prices = { ...range, sqrtPriceX96: current },
      liquidity = calculateCLLiquidity({ ...prices, amount0: 10000n, amount1: 20000n }),
      paid = calculateCLAmounts({ ...prices, liquidity, rounding: "up" });
    expect(paid.amount0 <= 10000n && paid.amount1 <= 20000n).toBe(true);
    if (current <= range.sqrtLowerX96) expect(paid.amount1).toBe(0n);
    if (current >= range.sqrtUpperX96) expect(paid.amount0).toBe(0n);
  }
});
test("uint128 conversion applies to each liquidity branch before choosing the minimum", () => {
  expect(() => calculateCLLiquidity({ ...range, amount0: 1n << 200n, amount1: 1n })).toThrow();
  expect(() => calculateCLAmounts({ ...range, liquidity: 1n << 128n, rounding: "down" })).toThrow();
});
test("price ranges reject uninitialized, equal or reversed bounds", () => {
  for (const prices of [
    { ...range, sqrtPriceX96: 0n },
    { ...range, sqrtUpperX96: range.sqrtLowerX96 },
    { ...range, sqrtLowerX96: range.sqrtUpperX96 + 1n },
  ])
    expect(() => calculateCLAmounts({ ...prices, liquidity: 1n, rounding: "down" })).toThrow();
});
test("fee growth uses source uint256 wrap and staked positions do not accrue ordinary swap fees", () => {
  const input = {
    liquidity: q128 - 1n,
    globalX128: 9n,
    lowerOutsideX128: 3n,
    upperOutsideX128: 2n,
    lastInsideX128: (1n << 256n) - 2n,
    tokensOwed: 10n,
    tick: 0,
    tickLower: -60,
    tickUpper: 60,
    staked: false,
  };
  expect(calculateCLFees(input)).toEqual({
    insideX128: 4n,
    accrued: 5n,
    tokensOwed: 15n,
    overflowed: false,
  });
  expect(calculateCLFees({ ...input, staked: true })).toMatchObject({
    accrued: 0n,
    tokensOwed: 10n,
  });
  expect(calculateCLFees({ ...input, tokensOwed: q128 - 1n })).toMatchObject({
    accrued: 5n,
    tokensOwed: 4n,
    overflowed: true,
  });
});
test.for([
  [-61, 1n],
  [-60, 4n],
  [59, 4n],
  [60, (1n << 256n) - 1n],
] as const)(
  "fee inside growth at tick %s respects lower-inclusive and upper-exclusive bounds",
  ([tick, insideX128]) => {
    expect(
      calculateCLFees({
        liquidity: 0n,
        globalX128: 9n,
        lowerOutsideX128: 3n,
        upperOutsideX128: 2n,
        lastInsideX128: 0n,
        tokensOwed: 0n,
        tick,
        tickLower: -60,
        tickUpper: 60,
        staked: false,
      }).insideX128,
    ).toBe(insideX128);
  },
);
