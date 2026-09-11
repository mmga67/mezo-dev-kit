import assert from "node:assert/strict";
import { createContractRegistry, getTokenInterface, resolveEvent } from "@mezo-dev-kit/contracts";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import type { CLGaugeState } from "../src/index.ts";
import { lockFixture, zero } from "./lock-fixture.ts";
import { fixtureLog } from "./voting-fixture.ts";
export function clGaugeFixture(staked = true): CLGaugeState {
  const base = lockFixture(),
    registry = createContractRegistry(),
    coordinate = base.coordinate;
  const factory = registry.resolve({ ...coordinate, contractId: "mezo-earn.cl-factory" }),
    implementation = registry.resolve({
      ...coordinate,
      contractId: "mezo-earn.cl-pool-implementation",
    }),
    manager = registry.resolve({ ...coordinate, contractId: "mezo-earn.cl-position-manager" }),
    contract = registry.resolve({
      ...coordinate,
      contractId: "incentives.cl-gauge-implementation",
    });
  const token0 = `0x${"22".repeat(20)}` as const,
    token1 = `0x${"33".repeat(20)}` as const,
    rewardToken = `0x${"44".repeat(20)}` as const,
    gauge = `0x${"55".repeat(20)}` as const,
    pool = `0x${"66".repeat(20)}` as const;
  const position = {
    tokenId: 1n,
    owner: staked ? gauge : base.account,
    approved: zero,
    staked,
    beneficialDepositor: base.account,
    tickLower: -60,
    tickUpper: 60,
    liquidity: 64n,
    lastInside0X128: 0n,
    lastInside1X128: 0n,
    tokensOwed0: 2n,
    tokensOwed1: 3n,
    fees0: { insideX128: 0n, tokensOwed: 2n, overflowed: false },
    fees1: { insideX128: 0n, tokensOwed: 3n, overflowed: false },
  };
  return {
    contract,
    gauge,
    position,
    staked,
    gaugeApproved: false,
    operatorApproved: false,
    earned: 25n,
    rewardCustody: 1000n,
    reward: {
      ...base.token,
      target: {
        contractId: contract.contractId,
        address: rewardToken,
        targetRole: "cl-gauge-reward",
      },
      spender: gauge,
      balance: 100n,
    },
    rewards: {
      rewardRate: 10n,
      periodFinish: 2000n,
      globalX128: 0n,
      reserve: 1000n,
      rollover: 0n,
      lastUpdated: 1000n,
      lowerOutsideX128: 0n,
      upperOutsideX128: 0n,
      positionInsideX128: 0n,
      positionLastUpdate: 999n,
      stored: 7n,
    },
    pool: {
      coordinate,
      timestamp: 1005n,
      account: base.account,
      key: { token0, token1, tickSpacing: 60 },
      factory,
      implementation,
      manager,
      pool,
      gauge: {
        address: gauge,
        factory: registry.resolve({ ...coordinate, contractId: "incentives.cl-gauge-factory" })
          .address,
        implementation: contract.address,
        voter: registry.resolve({ ...coordinate, contractId: "incentives.pools-voter" }).address,
        rewardToken,
        alive: true,
        stakeCount: staked ? 1n : 0n,
      },
      sqrtPriceX96: 1n << 96n,
      tick: 0,
      unlocked: true,
      liquidity: 256n,
      stakedLiquidity: 128n,
      globalFee0X128: 0n,
      globalFee1X128: 0n,
      token0: {
        ...base.token,
        target: { contractId: factory.contractId, address: token0, targetRole: "cl-token-0" },
        spender: manager.address,
      },
      token1: {
        ...base.token,
        target: { contractId: factory.contractId, address: token1, targetRole: "cl-token-1" },
        spender: manager.address,
      },
      poolBalance0: 1000n,
      poolBalance1: 1000n,
      nativeBalance: 1000n,
      nftSupply: 4n,
      ownedCount: staked ? 0n : 1n,
      writeCompatible: true,
      ticks: [-60, 60].map((tick) => ({
        tick,
        liquidityGross: 256n,
        liquidityNet: tick < 0 ? 256n : -256n,
        stakedLiquidityNet: tick < 0 ? 128n : -128n,
        feeGrowthOutside0X128: 0n,
        feeGrowthOutside1X128: 0n,
        initialized: true,
      })),
      positions: [position],
    },
  };
}
export function clGaugeClaimSettlement(): {
  before: CLGaugeState;
  after: CLGaugeState;
  gasFee: bigint;
  action: "claim-reward";
  receipt: ExecutionReceipt;
} {
  const before = clGaugeFixture(),
    growth = 50n * (1n << 121n),
    gasFee = 17n;
  const after: CLGaugeState = {
    ...before,
    earned: 0n,
    reward: { ...before.reward, balance: 132n },
    rewardCustody: 968n,
    rewards: {
      ...before.rewards,
      globalX128: growth,
      reserve: 950n,
      lastUpdated: 1005n,
      positionInsideX128: growth,
      positionLastUpdate: 1005n,
      stored: 0n,
    },
    pool: {
      ...before.pool,
      coordinate: {
        ...before.pool.coordinate,
        blockNumber: before.pool.coordinate.blockNumber + 1n,
      },
      nativeBalance: 983n,
    },
  };
  const receipt: ExecutionReceipt = {
    blockNumber: after.pool.coordinate.blockNumber,
    blockHash: after.pool.coordinate.blockHash,
    transactionHash: `0x${"ef".repeat(32)}`,
    logs: [],
  };
  const transfer = getTokenInterface().find(
    (row) => row.type === "event" && row.name === "Transfer",
  );
  assert(transfer);
  const logs = [
    fixtureLog(
      resolveEvent({
        ...after.pool.coordinate,
        contractId: before.contract.contractId,
        eventName: "ClaimRewards",
      }),
      before.gauge,
      [before.pool.account, 32n],
      receipt,
      0,
    ),
    fixtureLog(
      transfer,
      before.reward.target.address,
      [before.gauge, before.pool.account, 32n],
      receipt,
      1,
    ),
  ];
  return { before, after, gasFee, action: "claim-reward" as const, receipt: { ...receipt, logs } };
}
