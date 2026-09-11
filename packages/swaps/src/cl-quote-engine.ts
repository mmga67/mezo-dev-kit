import { createAbiCodec, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import type { RpcTransport } from "@mezo-dev-kit/core";
import {
  calculateCLSwapStep,
  calculateCLSwapFeeSplit,
  getCLBitmapLocation,
  findCLBitmapTick,
  getCLTickSqrtRatio,
  getCLTickAtSqrtRatio,
  getCLUsableTicks,
} from "@mezo-dev-kit/pools";
import type { CLPoolSnapshot } from "@mezo-dev-kit/pools";
import { swapRequire } from "./reader.ts";
import type { CLSwapBudget, CLSwapCrossing, CLSwapPoolQuote } from "./cl-types.ts";
export function clSwapBudget(budget: CLSwapBudget): void {
  for (const [value, max] of [
    [budget.maxSteps, 256],
    [budget.maxBitmapWords, 32],
    [budget.maxCrossedTicks, 32],
  ])
    swapRequire(
      typeof value === "number" &&
        typeof max === "number" &&
        Number.isInteger(value) &&
        value > 0 &&
        value <= max,
      "InvalidInput",
      "CL quote budget outside finite limits",
    );
}
export async function quoteCLPool(input: {
  readonly snapshot: CLPoolSnapshot;
  readonly amountIn: bigint;
  readonly zeroForOne: boolean;
  readonly budget: CLSwapBudget;
  readonly transport: RpcTransport;
}): Promise<Readonly<CLSwapPoolQuote>> {
  const { snapshot: s, budget, transport, zeroForOne } = input,
    codec = createAbiCodec(),
    amountIn = parseUint(input.amountIn),
    range = getCLUsableTicks(1),
    limit =
      getCLTickSqrtRatio(zeroForOne ? range.tickLower : range.tickUpper) + (zeroForOne ? 1n : -1n);
  clSwapBudget(budget);
  swapRequire(
    amountIn > 0n && amountIn < 1n << 255n && s.liquidity > 0n && s.unlocked,
    "UnavailableRoute",
    "CL swap requires input and active unlocked liquidity",
  );
  async function call(name: string, args: readonly AbiValue[] = []) {
    const abi = s.implementation.readAbi.find(
      (row) => row.type === "function" && row.name === name,
    );
    swapRequire(abi !== undefined, "UnavailableRoute", `CL getter missing: ${name}`);
    return codec.decodeFunction(
      abi,
      await transport.read({
        ...s.coordinate,
        contractId: s.implementation.contractId,
        address: s.pool,
        data: codec.encodeFunction(abi, args),
      }),
    );
  }
  const fees = await call("gaugeFees"),
    gaugeFeeBefore0 = parseUint(fees[0], 128),
    gaugeFeeBefore1 = parseUint(fees[1], 128),
    words = new Map<number, bigint>(),
    crossings: CLSwapCrossing[] = [];
  let remaining = amountIn,
    amountOut = 0n,
    feeAmount = 0n,
    sqrtPriceX96 = s.sqrtPriceX96,
    tick = s.tick,
    liquidity = s.liquidity,
    stakedLiquidity = s.stakedLiquidity,
    globalFee0X128 = s.globalFee0X128,
    globalFee1X128 = s.globalFee1X128,
    gaugeFeeAfter0 = gaugeFeeBefore0,
    gaugeFeeAfter1 = gaugeFeeBefore1,
    steps = 0;
  while (remaining > 0n && sqrtPriceX96 !== limit) {
    swapRequire(++steps <= budget.maxSteps, "BoundExceeded", "CL quote step budget exceeded");
    const location = getCLBitmapLocation({ tick, tickSpacing: s.key.tickSpacing, zeroForOne });
    let bitmap = words.get(location.word);
    if (bitmap === undefined) {
      swapRequire(
        words.size < budget.maxBitmapWords,
        "BoundExceeded",
        "CL bitmap read budget exceeded",
      );
      bitmap = parseUint((await call("tickBitmap", [BigInt(location.word)]))[0]);
      words.set(location.word, bitmap);
    }
    const candidate = findCLBitmapTick({
        tick,
        tickSpacing: s.key.tickSpacing,
        zeroForOne,
        bitmap,
      }),
      nextTick = Math.max(range.tickLower, Math.min(range.tickUpper, candidate.tick)),
      nextPrice = getCLTickSqrtRatio(nextTick),
      startPrice = sqrtPriceX96;
    const step = calculateCLSwapStep({
      sqrtPriceX96,
      sqrtTargetX96: zeroForOne
        ? nextPrice < limit
          ? limit
          : nextPrice
        : nextPrice > limit
          ? limit
          : nextPrice,
      liquidity,
      amountRemaining: remaining,
      fee: s.fee,
    });
    sqrtPriceX96 = step.sqrtPriceX96;
    remaining -= step.amountIn + step.feeAmount;
    amountOut = parseUint(amountOut + step.amountOut);
    feeAmount = parseUint(feeAmount + step.feeAmount);
    if (liquidity > 0n) {
      const split = calculateCLSwapFeeSplit({
        feeAmount: step.feeAmount,
        liquidity,
        stakedLiquidity,
        unstakedFee: s.unstakedFee,
      });
      swapRequire(!split.overflowed, "InconsistentQuote", "CL step gauge fee overflows storage");
      if (zeroForOne) {
        globalFee0X128 = BigInt.asUintN(256, globalFee0X128 + split.growthX128);
        gaugeFeeAfter0 = parseUint(gaugeFeeAfter0 + split.gaugeFeeAmount, 128);
      } else {
        globalFee1X128 = BigInt.asUintN(256, globalFee1X128 + split.growthX128);
        gaugeFeeAfter1 = parseUint(gaugeFeeAfter1 + split.gaugeFeeAmount, 128);
      }
    }
    if (sqrtPriceX96 === nextPrice) {
      if (candidate.initialized) {
        swapRequire(
          crossings.length < budget.maxCrossedTicks,
          "BoundExceeded",
          "CL crossed tick read budget exceeded",
        );
        const row = await call("ticks", [BigInt(nextTick)]),
          net = row[1],
          stakedNet = row[2];
        swapRequire(
          row.length === 10 &&
            row[9] === true &&
            typeof net === "bigint" &&
            typeof stakedNet === "bigint" &&
            net > -(1n << 127n) &&
            net < 1n << 127n &&
            stakedNet > -(1n << 127n) &&
            stakedNet < 1n << 127n,
          "InconsistentQuote",
          "CL initialized tick state differs",
        );
        const gross = parseUint(row[0], 128);
        swapRequire(
          gross > 0n &&
            (net < 0n ? -net : net) <= gross &&
            (stakedNet < 0n ? -stakedNet : stakedNet) <= gross,
          "InconsistentQuote",
          "CL tick net exceeds gross liquidity",
        );
        const liquidityNet = net,
          stakedLiquidityNet = stakedNet;
        crossings.push(
          Object.freeze({
            tick: nextTick,
            liquidityGross: gross,
            liquidityNet,
            stakedLiquidityNet,
            feeOutsideAfter0X128: BigInt.asUintN(256, globalFee0X128 - parseUint(row[3])),
            feeOutsideAfter1X128: BigInt.asUintN(256, globalFee1X128 - parseUint(row[4])),
          }),
        );
        liquidity = parseUint(liquidity + (zeroForOne ? -liquidityNet : liquidityNet), 128);
        stakedLiquidity = parseUint(
          stakedLiquidity + (zeroForOne ? -stakedLiquidityNet : stakedLiquidityNet),
          128,
        );
        swapRequire(
          stakedLiquidity <= liquidity,
          "InconsistentQuote",
          "CL crossed staked liquidity exceeds active liquidity",
        );
      }
      tick = zeroForOne ? nextTick - 1 : nextTick;
    } else if (sqrtPriceX96 !== startPrice) tick = getCLTickAtSqrtRatio(sqrtPriceX96);
  }
  swapRequire(
    remaining === 0n && amountOut < 1n << 255n,
    "UnavailableRoute",
    "CL price limit produced a partial swap or signed output overflow",
  );
  return Object.freeze({
    snapshot: s,
    amountIn,
    amountOut,
    feeAmount,
    sqrtPriceX96,
    tick,
    liquidity,
    stakedLiquidity,
    globalFee0X128,
    globalFee1X128,
    gaugeFeeBefore0,
    gaugeFeeBefore1,
    gaugeFeeAfter0,
    gaugeFeeAfter1,
    steps,
    bitmapWords: words.size,
    crossings: Object.freeze(crossings),
  });
}
