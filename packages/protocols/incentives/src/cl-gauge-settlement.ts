import { resolveEvent } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { createAbiCodec, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { forecastCLGauge } from "./cl-gauge-math.ts";
import type { CLGaugeAction, CLGaugeState, CLGaugeForecast } from "./cl-gauge-types.ts";
const codec = createAbiCodec(),
  zero = `0x${"0".repeat(40)}` as const;
export function verifyCLGaugeSettlement(input: {
  readonly before: CLGaugeState;
  readonly after: CLGaugeState;
  readonly action: CLGaugeAction;
  readonly receipt: ExecutionReceipt;
  readonly gasFee: bigint;
}): Readonly<{ forecast: Readonly<CLGaugeForecast>; fee0: bigint; fee1: bigint; reward: bigint }> {
  const { before: b, after: a, action, receipt, gasFee } = input,
    before = b.pool,
    after = a.pool,
    p = b.position,
    q = a.position;
  const requireMatch = (condition: boolean, message: string) => {
    incentiveRequire(condition, "ReconciliationMismatch", message);
  };
  requireMatch(
    after.coordinate.blockNumber === receipt.blockNumber &&
      after.coordinate.blockHash === receipt.blockHash &&
      before.coordinate.blockNumber + 1n === receipt.blockNumber &&
      before.coordinate.chainId === after.coordinate.chainId &&
      before.coordinate.networkId === after.coordinate.networkId &&
      before.account === after.account &&
      before.pool === after.pool &&
      before.manager.address === after.manager.address &&
      before.implementation.address === after.implementation.address &&
      before.factory.address === after.factory.address &&
      b.contract.address === a.contract.address &&
      b.gauge === a.gauge &&
      b.reward.target.address === a.reward.target.address &&
      before.key.token0 === after.key.token0 &&
      before.key.token1 === after.key.token1 &&
      before.key.tickSpacing === after.key.tickSpacing &&
      p.tokenId === q.tokenId &&
      after.writeCompatible &&
      after.timestamp >= before.timestamp,
    "CL gauge settlement identity differs",
  );
  const forecast = forecastCLGauge({ snapshot: b, action, atTimestamp: after.timestamp }),
    collecting = action === "stake" || action === "unstake",
    staking = action === "stake",
    unstaking = action === "unstake",
    moving = staking || unstaking;
  requireMatch(
    before.sqrtPriceX96 === after.sqrtPriceX96 &&
      before.tick === after.tick &&
      before.liquidity === after.liquidity &&
      after.stakedLiquidity === before.stakedLiquidity + forecast.activeStakeDelta &&
      before.globalFee0X128 === after.globalFee0X128 &&
      before.globalFee1X128 === after.globalFee1X128 &&
      before.nftSupply === after.nftSupply &&
      after.ownedCount === before.ownedCount + (staking ? -1n : unstaking ? 1n : 0n) &&
      after.gauge?.alive === before.gauge?.alive &&
      after.gauge?.stakeCount ===
        (before.gauge?.stakeCount ?? 0n) + (staking ? 1n : unstaking ? -1n : 0n) &&
      after.unlocked,
    "CL gauge pool or NFT totals differ",
  );
  requireMatch(
    q.tickLower === p.tickLower &&
      q.tickUpper === p.tickUpper &&
      q.liquidity === p.liquidity &&
      q.owner === (staking ? b.gauge : unstaking ? before.account : p.owner) &&
      q.approved === (action === "approve" ? b.gauge : moving ? zero : p.approved) &&
      a.staked === (staking ? true : unstaking ? false : b.staked) &&
      q.staked === a.staked &&
      q.beneficialDepositor === before.account &&
      a.operatorApproved === b.operatorApproved &&
      a.gaugeApproved === (q.approved === a.gauge || a.operatorApproved),
    "CL gauge ownership or approval differs",
  );
  // An ERC721 per-token approval is cleared on either ownership transfer.
  // gaugeApproved may remain true if an independent operator approval exists;
  // exact getApproved is checked above, while the reader owns that OR expression.
  requireMatch(
    q.tokensOwed0 === (collecting ? 0n : p.tokensOwed0) &&
      q.tokensOwed1 === (collecting ? 0n : p.tokensOwed1) &&
      q.lastInside0X128 ===
        (collecting && p.liquidity > 0n ? p.fees0.insideX128 : p.lastInside0X128) &&
      q.lastInside1X128 ===
        (collecting && p.liquidity > 0n ? p.fees1.insideX128 : p.lastInside1X128),
    "CL gauge NFT fee accounting differs",
  );
  for (const [tick, sign] of [
    [p.tickLower, 1n],
    [p.tickUpper, -1n],
  ] as const) {
    const old = before.ticks.find((row) => row.tick === tick),
      current = after.ticks.find((row) => row.tick === tick);
    requireMatch(old !== undefined && current !== undefined, "CL gauge tick missing");
    if (!old || !current) throw new Error("unreachable tick");
    requireMatch(
      current.initialized === old.initialized &&
        current.liquidityGross === old.liquidityGross &&
        current.liquidityNet === old.liquidityNet &&
        current.stakedLiquidityNet ===
          old.stakedLiquidityNet + (old.initialized ? sign * forecast.stakeDelta : 0n) &&
        current.feeGrowthOutside0X128 === old.feeGrowthOutside0X128 &&
        current.feeGrowthOutside1X128 === old.feeGrowthOutside1X128,
      "CL gauge tick ownership differs",
    );
  }
  for (const key of Object.keys(forecast.rewardsAfter) as (keyof typeof forecast.rewardsAfter)[])
    requireMatch(a.rewards[key] === forecast.rewardsAfter[key], `CL reward state differs: ${key}`);
  function events(contract: ResolvedContract, address: `0x${string}`, name: string) {
    const abi = resolveEvent({
      ...after.coordinate,
      contractId: contract.contractId,
      eventName: name,
    });
    return getReceiptLogs(receipt, address)
      .map((log) => codec.decodeEvent(abi, log))
      .filter((row) => row !== null);
  }
  const exact = (
    rows: readonly (readonly AbiValue[])[],
    expected: readonly AbiValue[] | null,
    label: string,
  ) => {
    requireMatch(
      expected === null
        ? rows.length === 0
        : rows.length === 1 &&
            rows[0]?.length === expected.length &&
            rows[0].every((value, i) => value === expected[i]),
      label,
    );
  };
  const me = (name: string) => events(before.manager, before.manager.address, name),
    ge = (name: string) => events(b.contract, b.gauge, name),
    pe = (name: string) => events(before.implementation, before.pool, name);
  exact(
    ge("Deposit"),
    staking ? [before.account, p.tokenId, p.liquidity] : null,
    "CL gauge deposit event differs",
  );
  exact(
    ge("Withdraw"),
    unstaking ? [before.account, p.tokenId, p.liquidity] : null,
    "CL gauge withdraw event differs",
  );
  exact(
    ge("ClaimRewards"),
    forecast.reward > 0n ? [before.account, forecast.reward] : null,
    "CL gauge reward event differs",
  );
  exact(
    me("Transfer"),
    moving
      ? [staking ? before.account : b.gauge, staking ? b.gauge : before.account, p.tokenId]
      : null,
    "CL gauge NFT transfer differs",
  );
  exact(
    me("Approval"),
    action === "approve"
      ? [before.account, b.gauge, p.tokenId]
      : moving
        ? [p.owner, zero, p.tokenId]
        : null,
    "CL gauge NFT approval event differs",
  );
  exact(me("IncreaseLiquidity"), null, "unexpected CL increase");
  exact(me("DecreaseLiquidity"), null, "unexpected CL decrease");
  exact(pe("Mint"), null, "unexpected CL pool mint");
  exact(
    me("Collect"),
    collecting ? [p.tokenId, before.account, forecast.feeCap0, forecast.feeCap1] : null,
    "CL gauge fee accounting event differs",
  );
  const poolOwner = b.staked ? b.gauge : before.manager.address;
  exact(
    pe("Burn"),
    collecting && p.liquidity > 0n
      ? [poolOwner, BigInt(p.tickLower), BigInt(p.tickUpper), 0n, 0n, 0n]
      : null,
    "CL gauge zero burn differs",
  );
  const collected = pe("Collect");
  let fee0 = 0n,
    fee1 = 0n;
  if (collecting) {
    requireMatch(collected.length === 1, "CL gauge collection missing");
    fee0 = parseUint(collected[0]?.[4], 128);
    fee1 = parseUint(collected[0]?.[5], 128);
    exact(
      collected,
      [poolOwner, before.account, BigInt(p.tickLower), BigInt(p.tickUpper), fee0, fee1],
      "CL gauge collection recipient differs",
    );
    requireMatch(
      fee0 <= forecast.feeCap0 && fee1 <= forecast.feeCap1,
      "CL gauge collection exceeds accounting",
    );
  } else exact(collected, null, "unexpected CL gauge collection");
  for (const [token, from, amount] of [
    [before.key.token0, before.pool, fee0],
    [before.key.token1, before.pool, fee1],
    [b.reward.target.address, b.gauge, forecast.reward],
  ] as const) {
    const touched = [before.account, b.gauge, before.pool, before.manager.address],
      transfers = decodeTokenTransfers(receipt, token).filter(
        (row) => touched.includes(row.from) || touched.includes(row.to),
      );
    requireMatch(
      amount === 0n
        ? transfers.length === 0
        : transfers.length === 1 &&
            transfers[0]?.from === from &&
            transfers[0].to === before.account &&
            transfers[0].amount === amount,
      "CL gauge token transfer differs",
    );
  }
  requireMatch(
    after.token0.balance === before.token0.balance + fee0 &&
      after.token1.balance === before.token1.balance + fee1 &&
      after.poolBalance0 === before.poolBalance0 - fee0 &&
      after.poolBalance1 === before.poolBalance1 - fee1 &&
      a.reward.balance === b.reward.balance + forecast.reward &&
      a.rewardCustody === b.rewardCustody - forecast.reward &&
      after.nativeBalance === before.nativeBalance - gasFee,
    "CL gauge wallet, custody or native gas differs",
  );
  return Object.freeze({ forecast, fee0, fee1, reward: forecast.reward });
}
