import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { CLPoolSnapshot } from "../src/index.ts";
import { calculateCLAmounts, calculateCLFees, getCLTickSqrtRatio } from "../src/index.ts";
import { snapshot as basicSnapshot } from "./fixtures.ts";
export const Q128 = 1n << 128n,
  W = 10n ** 18n;
export function clFixture(): CLPoolSnapshot {
  const base = basicSnapshot(),
    registry = createContractRegistry(),
    factory = registry.resolve({ ...base.coordinate, contractId: "mezo-earn.cl-factory" }),
    implementation = registry.resolve({
      ...base.coordinate,
      contractId: "mezo-earn.cl-pool-implementation",
    }),
    manager = registry.resolve({ ...base.coordinate, contractId: "mezo-earn.cl-position-manager" }),
    factoryRegistry = registry.resolve({
      ...base.coordinate,
      contractId: "incentives.factory-registry",
    }),
    key = { token0: base.key.token0, token1: base.key.token1, tickSpacing: 60 },
    globalFee0X128 = 3n * Q128,
    globalFee1X128 = 2n * Q128;
  const fees = (globalX128: bigint) =>
    calculateCLFees({
      liquidity: W,
      globalX128,
      lowerOutsideX128: 0n,
      upperOutsideX128: 0n,
      lastInsideX128: 0n,
      tokensOwed: 2n,
      tick: 0,
      tickLower: -60,
      tickUpper: 60,
      staked: false,
    });
  return {
    coordinate: base.coordinate,
    timestamp: 1000n,
    account: base.account,
    providerId: "synthetic-cl",
    key,
    factory,
    implementation,
    manager,
    factoryRegistry,
    factoryApproved: true,
    pool: base.pool,
    gauge: null,
    sqrtPriceX96: 1n << 96n,
    tick: 0,
    unlocked: true,
    liquidity: W,
    stakedLiquidity: 0n,
    maxLiquidityPerTick: (1n << 128n) - 1n,
    fee: 3000n,
    unstakedFee: 100000n,
    globalFee0X128,
    globalFee1X128,
    token0: {
      ...base.token0,
      account: base.account,
      spender: manager.address,
      balance: 100n * W,
      allowance: 100n * W,
      target: { contractId: factory.contractId, targetRole: "cl-token-0", address: key.token0 },
    },
    token1: {
      ...base.token1,
      account: base.account,
      spender: manager.address,
      balance: 100n * W,
      allowance: 100n * W,
      target: { contractId: factory.contractId, targetRole: "cl-token-1", address: key.token1 },
    },
    poolBalance0: 10n * W,
    poolBalance1: 10n * W,
    nativeBalance: W,
    managerNativeBalance: 0n,
    nftSupply: 1n,
    ownedCount: 1n,
    writeCompatible: true,
    ticks: [-60, 60].map((tick) => ({
      tick,
      liquidityGross: W,
      liquidityNet: tick < 0 ? W : -W,
      stakedLiquidityNet: 0n,
      feeGrowthOutside0X128: 0n,
      feeGrowthOutside1X128: 0n,
      initialized: true,
    })),
    positions: [
      {
        tokenId: 1n,
        owner: base.account,
        approved: `0x${"0".repeat(40)}`,
        callerApproved: true,
        staked: false,
        beneficialDepositor: base.account,
        tickLower: -60,
        tickUpper: 60,
        liquidity: W,
        lastInside0X128: 0n,
        lastInside1X128: 0n,
        tokensOwed0: 2n,
        tokensOwed1: 2n,
        fees0: fees(globalFee0X128),
        fees1: fees(globalFee1X128),
        principal: calculateCLAmounts({
          sqrtPriceX96: 1n << 96n,
          sqrtLowerX96: getCLTickSqrtRatio(-60),
          sqrtUpperX96: getCLTickSqrtRatio(60),
          liquidity: W,
          rounding: "down",
        }),
        gaugeReward: null,
      },
    ],
  };
}
export function clBoundsFixture(): {
  minAmount0: bigint;
  minAmount1: bigint;
  minLiquidity: bigint;
  sqrtPriceMinX96: bigint;
  sqrtPriceMaxX96: bigint;
  deadline: bigint;
  maxDeadlineSeconds: bigint;
  maxBlockAge: bigint;
} {
  return {
    minAmount0: 1n,
    minAmount1: 1n,
    minLiquidity: 1n,
    sqrtPriceMinX96: getCLTickSqrtRatio(-10),
    sqrtPriceMaxX96: getCLTickSqrtRatio(10),
    deadline: 1100n,
    maxDeadlineSeconds: 120n,
    maxBlockAge: 2n,
  };
}
