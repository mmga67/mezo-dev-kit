import { expect, test } from "vitest";
import {
  calculateCLSwapStep,
  calculateCLSwapFeeSplit,
  getCLBitmapLocation,
  findCLBitmapTick,
  getCLTickSqrtRatio,
} from "../src/index.ts";
import { clSwapVectors } from "./cl-swap-vectors.ts";
test.for(clSwapVectors)("CL source differential case $label", ({ input, result }) => {
  expect(calculateCLSwapStep(input)).toEqual(result);
});
test("CL fee splitting rounds the staked share and unstaked levy separately", () => {
  expect(
    calculateCLSwapFeeSplit({
      feeAmount: 101n,
      liquidity: 100n,
      stakedLiquidity: 33n,
      unstakedFee: 100000n,
    }),
  ).toEqual({
    unstakedFeeAmount: 60n,
    gaugeFeeAmount: 41n,
    growthX128: (60n * (1n << 128n)) / 67n,
    overflowed: false,
  });
  expect(
    calculateCLSwapFeeSplit({
      feeAmount: 101n,
      liquidity: 100n,
      stakedLiquidity: 0n,
      unstakedFee: 100000n,
    }),
  ).toMatchObject({
    unstakedFeeAmount: 90n,
    gaugeFeeAmount: 11n,
    growthX128: (90n * (1n << 128n)) / 100n,
  });
  expect(
    calculateCLSwapFeeSplit({
      feeAmount: 101n,
      liquidity: 100n,
      stakedLiquidity: 100n,
      unstakedFee: 100000n,
    }),
  ).toMatchObject({ unstakedFeeAmount: 0n, gaugeFeeAmount: 101n, growthX128: 0n });
  expect(
    calculateCLSwapFeeSplit({
      feeAmount: 1n << 128n,
      liquidity: 1n,
      stakedLiquidity: 1n,
      unstakedFee: 0n,
    }).overflowed,
  ).toBe(true);
});
test("negative compressed ticks floor toward minus infinity and directional scans select their own word", () => {
  expect(getCLBitmapLocation({ tick: -1, tickSpacing: 60, zeroForOne: true })).toEqual({
    word: -1,
    bit: 255,
    compressed: -1,
  });
  expect(getCLBitmapLocation({ tick: -1, tickSpacing: 60, zeroForOne: false })).toEqual({
    word: 0,
    bit: 0,
    compressed: 0,
  });
  expect(
    findCLBitmapTick({ tick: -1, tickSpacing: 60, zeroForOne: true, bitmap: 1n << 255n }),
  ).toEqual({ tick: -60, initialized: true });
  expect(findCLBitmapTick({ tick: -1, tickSpacing: 60, zeroForOne: false, bitmap: 1n })).toEqual({
    tick: 0,
    initialized: true,
  });
  expect(findCLBitmapTick({ tick: 0, tickSpacing: 60, zeroForOne: true, bitmap: 0n })).toEqual({
    tick: 0,
    initialized: false,
  });
  expect(findCLBitmapTick({ tick: 0, tickSpacing: 60, zeroForOne: false, bitmap: 0n })).toEqual({
    tick: 15300,
    initialized: false,
  });
});
test("CL invalid swap fee, signed amount and inconsistent staked liquidity fail", () => {
  const input = {
    sqrtPriceX96: getCLTickSqrtRatio(0),
    sqrtTargetX96: getCLTickSqrtRatio(-60),
    liquidity: 100n,
    amountRemaining: 1n,
    fee: 0n,
  };
  expect(() => calculateCLSwapStep({ ...input, fee: 1000000n })).toThrow();
  expect(() => calculateCLSwapStep({ ...input, amountRemaining: 1n << 255n })).toThrow();
  expect(() =>
    calculateCLSwapFeeSplit({ feeAmount: 1n, liquidity: 1n, stakedLiquidity: 2n, unstakedFee: 0n }),
  ).toThrow();
});
