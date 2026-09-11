import { resolveEvent } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { createAbiCodec, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { poolRequire } from "./errors.ts";
import { clPosition, modelCLPosition } from "./cl-actions.ts";
import type { CLPositionAction, CLPositionForecast } from "./cl-actions.ts";
import type { CLPoolSnapshot } from "./cl-types.ts";
const codec = createAbiCodec(),
  zero = `0x${"0".repeat(40)}` as const;
function events(
  snapshot: CLPoolSnapshot,
  receipt: ExecutionReceipt,
  contract: ResolvedContract,
  address: `0x${string}`,
  name: string,
) {
  const abi = resolveEvent({
    ...snapshot.coordinate,
    contractId: contract.contractId,
    eventName: name,
  });
  return getReceiptLogs(receipt, address)
    .map((log) => codec.decodeEvent(abi, log))
    .filter((row) => row !== null);
}
const match = (actual: readonly AbiValue[] | undefined, expected: readonly AbiValue[]) =>
  actual?.length === expected.length && actual.every((value, i) => value === expected[i]);
export function clReceiptTokenId(input: {
  readonly snapshot: CLPoolSnapshot;
  readonly action: CLPositionAction;
  readonly receipt: ExecutionReceipt;
}): bigint {
  if (input.action.kind !== "mint") return parseUint(input.action.tokenId);
  const rows = events(
    input.snapshot,
    input.receipt,
    input.snapshot.manager,
    input.snapshot.manager.address,
    "IncreaseLiquidity",
  );
  poolRequire(rows.length === 1, "ReconciliationMismatch", "CL mint event missing or ambiguous");
  const tokenId = parseUint(rows[0]?.[0]);
  poolRequire(tokenId > 0n, "ReconciliationMismatch", "CL minted tokenId is zero");
  return tokenId;
}
export function verifyCLPositionSettlement(input: {
  readonly before: CLPoolSnapshot;
  readonly after: CLPoolSnapshot;
  readonly action: CLPositionAction;
  readonly tokenId: bigint;
  readonly receipt: ExecutionReceipt;
  readonly gasFee: bigint;
}): Readonly<{
  forecast: Readonly<CLPositionForecast>;
  amount0: bigint;
  amount1: bigint;
  walletDelta0: bigint;
  walletDelta1: bigint;
}> {
  const { before, after, action, tokenId, receipt, gasFee } = input;
  const requireMatch = (value: boolean, message: string) => {
    poolRequire(value, "ReconciliationMismatch", message);
  };
  requireMatch(
    after.coordinate.blockHash === receipt.blockHash &&
      after.coordinate.blockNumber === receipt.blockNumber &&
      before.coordinate.blockNumber + 1n === receipt.blockNumber &&
      before.coordinate.chainId === after.coordinate.chainId &&
      before.coordinate.networkId === after.coordinate.networkId &&
      after.timestamp >= before.timestamp &&
      before.account === after.account &&
      before.manager.address === after.manager.address &&
      before.manager.contractId === after.manager.contractId &&
      before.factory.address === after.factory.address &&
      before.implementation.address === after.implementation.address &&
      before.pool === after.pool &&
      before.key.token0 === after.key.token0 &&
      before.key.token1 === after.key.token1 &&
      before.key.tickSpacing === after.key.tickSpacing &&
      before.writeCompatible &&
      after.writeCompatible,
    "CL settlement identity differs",
  );
  const forecast = modelCLPosition(before, action),
    adding = action.kind === "mint" || action.kind === "increase",
    collecting = action.kind === "collect",
    burning = action.kind === "burn";
  requireMatch(
    before.sqrtPriceX96 === after.sqrtPriceX96 &&
      before.tick === after.tick &&
      before.globalFee0X128 === after.globalFee0X128 &&
      before.globalFee1X128 === after.globalFee1X128 &&
      before.fee === after.fee &&
      before.unstakedFee === after.unstakedFee &&
      before.factoryApproved === after.factoryApproved &&
      before.maxLiquidityPerTick === after.maxLiquidityPerTick &&
      before.managerNativeBalance === after.managerNativeBalance &&
      before.gauge?.address === after.gauge?.address &&
      before.gauge?.alive === after.gauge?.alive &&
      before.gauge?.stakeCount === after.gauge?.stakeCount &&
      after.unlocked,
    "CL unrelated pool, price or gauge state changed",
  );
  const managerEvents = (name: string) =>
      events(after, receipt, after.manager, after.manager.address, name),
    poolEvents = (name: string) => events(after, receipt, after.implementation, after.pool, name);
  const increased = managerEvents("IncreaseLiquidity"),
    decreased = managerEvents("DecreaseLiquidity"),
    collected = managerEvents("Collect"),
    transfers = managerEvents("Transfer");
  requireMatch(
    adding
      ? increased.length === 1 &&
          match(increased[0], [
            tokenId,
            forecast.liquidityDelta,
            forecast.amount0,
            forecast.amount1,
          ])
      : increased.length === 0,
    "CL manager increase event differs",
  );
  requireMatch(
    action.kind === "decrease"
      ? decreased.length === 1 &&
          match(decreased[0], [
            tokenId,
            -forecast.liquidityDelta,
            forecast.amount0,
            forecast.amount1,
          ])
      : decreased.length === 0,
    "CL manager decrease event differs",
  );
  requireMatch(
    collecting
      ? collected.length === 1 &&
          match(collected[0], [tokenId, after.account, forecast.amount0, forecast.amount1])
      : collected.length === 0,
    "CL manager collect accounting event differs",
  );
  requireMatch(
    action.kind === "mint"
      ? transfers.length === 1 && match(transfers[0], [zero, after.account, tokenId])
      : burning
        ? transfers.length === 1 && match(transfers[0], [before.account, zero, tokenId])
        : transfers.length === 0,
    "CL NFT owner transfer differs",
  );
  const previous = action.kind === "mint" ? null : clPosition(before, action.tokenId);
  const countDelta = action.kind === "mint" ? 1n : burning ? -1n : 0n;
  requireMatch(
    after.ownedCount === before.ownedCount + countDelta &&
      after.nftSupply === before.nftSupply + countDelta,
    "CL NFT counts differ",
  );
  if (burning)
    requireMatch(
      !after.positions.some((row) => row.tokenId === tokenId),
      "burned CL NFT remains in post-state",
    );
  else {
    const position = clPosition(after, tokenId);
    requireMatch(
      position.owner === after.account &&
        !position.staked &&
        position.approved === (previous?.approved ?? zero) &&
        position.tickLower === forecast.tickLower &&
        position.tickUpper === forecast.tickUpper &&
        position.liquidity === forecast.liquidityAfter &&
        position.tokensOwed0 === forecast.tokensOwedAfter0 &&
        position.tokensOwed1 === forecast.tokensOwedAfter1 &&
        position.lastInside0X128 === forecast.lastInsideAfter0X128 &&
        position.lastInside1X128 === forecast.lastInsideAfter1X128,
      "CL NFT liquidity or fee accounting differs",
    );
  }
  const activeDelta =
    before.tick >= forecast.tickLower && before.tick < forecast.tickUpper
      ? forecast.liquidityDelta
      : 0n;
  requireMatch(
    after.liquidity === before.liquidity + activeDelta &&
      after.stakedLiquidity === before.stakedLiquidity,
    "CL active or staked liquidity differs",
  );
  for (const [tick, sign] of [
    [forecast.tickLower, 1n],
    [forecast.tickUpper, -1n],
  ] as const) {
    const old = before.ticks.find((row) => row.tick === tick),
      current = after.ticks.find((row) => row.tick === tick);
    requireMatch(old !== undefined && current !== undefined, "CL settlement tick missing");
    if (!old || !current) throw new Error("unreachable missing CL tick");
    const gross = old.liquidityGross + forecast.liquidityDelta,
      updated = forecast.liquidityDelta !== 0n,
      initialized = updated ? gross > 0n : old.initialized;
    const outside = (global: bigint, value: bigint) =>
      !updated
        ? value
        : gross === 0n
          ? 0n
          : old.initialized
            ? value
            : tick <= before.tick
              ? global
              : 0n;
    requireMatch(
      current.liquidityGross === gross &&
        current.liquidityNet === old.liquidityNet + sign * forecast.liquidityDelta &&
        current.stakedLiquidityNet === old.stakedLiquidityNet &&
        current.initialized === initialized &&
        current.feeGrowthOutside0X128 ===
          outside(before.globalFee0X128, old.feeGrowthOutside0X128) &&
        current.feeGrowthOutside1X128 === outside(before.globalFee1X128, old.feeGrowthOutside1X128),
      "CL tick liquidity or fee boundary differs",
    );
  }
  const poolMint = poolEvents("Mint"),
    poolBurn = poolEvents("Burn"),
    poolCollect = poolEvents("Collect");
  requireMatch(
    adding
      ? poolMint.length === 1 &&
          match(poolMint[0], [
            before.manager.address,
            before.manager.address,
            BigInt(forecast.tickLower),
            BigInt(forecast.tickUpper),
            forecast.liquidityDelta,
            forecast.amount0,
            forecast.amount1,
          ])
      : poolMint.length === 0,
    "CL pool mint event differs",
  );
  const expectsBurn =
    action.kind === "decrease" || (collecting && previous !== null && previous.liquidity > 0n);
  requireMatch(
    expectsBurn
      ? poolBurn.length === 1 &&
          match(poolBurn[0], [
            before.manager.address,
            BigInt(forecast.tickLower),
            BigInt(forecast.tickUpper),
            action.kind === "decrease" ? -forecast.liquidityDelta : 0n,
            action.kind === "decrease" ? forecast.amount0 : 0n,
            action.kind === "decrease" ? forecast.amount1 : 0n,
          ])
      : poolBurn.length === 0,
    "CL pool burn event differs",
  );
  let amount0 = forecast.amount0,
    amount1 = forecast.amount1;
  if (collecting) {
    requireMatch(poolCollect.length === 1, "CL actual pool collection event missing");
    const row = poolCollect[0];
    amount0 = parseUint(row?.[4], 128);
    amount1 = parseUint(row?.[5], 128);
    requireMatch(
      match(row, [
        before.manager.address,
        before.account,
        BigInt(forecast.tickLower),
        BigInt(forecast.tickUpper),
        amount0,
        amount1,
      ]) &&
        amount0 <= forecast.amount0 &&
        amount1 <= forecast.amount1,
      "CL actual collection exceeds accounting request",
    );
  } else requireMatch(poolCollect.length === 0, "unexpected CL pool collection");
  const walletDelta0 = adding ? -amount0 : collecting ? amount0 : 0n,
    walletDelta1 = adding ? -amount1 : collecting ? amount1 : 0n;
  for (const [token, amount] of [
    [before.key.token0, adding || collecting ? amount0 : 0n],
    [before.key.token1, adding || collecting ? amount1 : 0n],
  ] as const) {
    const touched = [before.account, before.pool, before.manager.address],
      logs = decodeTokenTransfers(receipt, token).filter(
        (row) => touched.includes(row.from) || touched.includes(row.to),
      );
    requireMatch(
      amount === 0n
        ? logs.length === 0
        : logs.length === 1 &&
            logs[0]?.from === (adding ? before.account : before.pool) &&
            logs[0].to === (adding ? before.pool : before.account) &&
            logs[0].amount === amount,
      "CL token transfer amount or recipient differs",
    );
  }
  requireMatch(
    after.token0.balance === before.token0.balance + walletDelta0 &&
      after.token1.balance === before.token1.balance + walletDelta1 &&
      after.poolBalance0 === before.poolBalance0 - walletDelta0 &&
      after.poolBalance1 === before.poolBalance1 - walletDelta1 &&
      after.nativeBalance === before.nativeBalance - gasFee,
    "CL wallet, custody or native gas accounting differs",
  );
  return Object.freeze({ forecast, amount0, amount1, walletDelta0, walletDelta1 });
}
