import type { CLSwapQuote } from "../src/index.ts";
import { encodeCLSwapPath } from "../src/index.ts";
import {
  calculateCLSwapStep,
  calculateCLSwapFeeSplit,
  getCLTickAtSqrtRatio,
} from "@mezo-dev-kit/pools";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { CLPoolSnapshot } from "@mezo-dev-kit/pools";
import { calculateCLAmounts, calculateCLFees, getCLTickSqrtRatio } from "@mezo-dev-kit/pools";

export const Q128 = 1n << 128n,
  W = 10n ** 18n;
function basicSnapshot() {
  const coordinate = {
    networkId: "mezo-mainnet",
    chainId: 31612n,
    blockNumber: 11703359n,
    blockHash: `0x${"ab".repeat(32)}`,
  } as const;
  const account = `0x${"11".repeat(20)}` as const,
    pool = `0x${"66".repeat(20)}` as const;
  const key = { token0: `0x${"22".repeat(20)}` as const, token1: `0x${"33".repeat(20)}` as const };
  const token = (address: `0x${string}`) => ({
    coordinate,
    account,
    spender: pool,
    target: { contractId: "mezo-earn.cl-factory" as const, address },
    balance: 100n * 10n ** 18n,
    allowance: 100n * 10n ** 18n,
    decimals: 18n,
  });
  return { coordinate, account, pool, key, token0: token(key.token0), token1: token(key.token1) };
}
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

export function clQuoteFixture(): CLSwapQuote {
  const s = clFixture(),
    router = createContractRegistry().resolve({
      ...s.coordinate,
      contractId: "mezo-earn.cl-swap-router",
    }),
    amountIn = 10n ** 15n;
  const step = calculateCLSwapStep({
    sqrtPriceX96: s.sqrtPriceX96,
    sqrtTargetX96: getCLTickSqrtRatio(-60),
    liquidity: s.liquidity,
    amountRemaining: amountIn,
    fee: s.fee,
  });
  const split = calculateCLSwapFeeSplit({
    feeAmount: step.feeAmount,
    liquidity: s.liquidity,
    stakedLiquidity: s.stakedLiquidity,
    unstakedFee: s.unstakedFee,
  });
  const route = [{ tokenIn: s.key.token0, tokenOut: s.key.token1, tickSpacing: 60 }];
  return {
    sourceClass: "dex-execution-quote",
    providerId: "synthetic-cl",
    coordinate: s.coordinate,
    timestamp: s.timestamp,
    account: s.account,
    router,
    routerNativeBalance: 0n,
    route,
    intermediateAssets: [],
    path: encodeCLSwapPath(route),
    amountIn,
    estimatedAmountOut: step.amountOut,
    amounts: [amountIn, step.amountOut],
    inputToken: { ...s.token0, spender: router.address, allowance: amountIn },
    outputToken: { ...s.token1, spender: router.address },
    maxAgeBlocks: 2n,
    budget: { maxSteps: 8, maxBitmapWords: 4, maxCrossedTicks: 4 },
    writeCompatible: true,
    pools: [
      {
        snapshot: s,
        amountIn,
        amountOut: step.amountOut,
        feeAmount: step.feeAmount,
        sqrtPriceX96: step.sqrtPriceX96,
        tick: getCLTickAtSqrtRatio(step.sqrtPriceX96),
        liquidity: s.liquidity,
        stakedLiquidity: s.stakedLiquidity,
        globalFee0X128: s.globalFee0X128 + split.growthX128,
        globalFee1X128: s.globalFee1X128,
        gaugeFeeBefore0: 0n,
        gaugeFeeBefore1: 0n,
        gaugeFeeAfter0: split.gaugeFeeAmount,
        gaugeFeeAfter1: 0n,
        steps: 1,
        bitmapWords: 1,
        crossings: [],
      },
    ],
  };
}
