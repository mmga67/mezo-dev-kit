import { resolveEvent } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt, RpcTransport } from "@mezo-dev-kit/core";
import { createAbiCodec, parseUint, parseHash32 } from "@mezo-dev-kit/evm";
import type { CLPoolSnapshot } from "@mezo-dev-kit/pools";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { swapRequire } from "./reader.ts";
import type { CLSwapQuote } from "./cl-types.ts";
const codec = createAbiCodec();
export async function verifyCLSwapSettlement(input: {
  readonly quote: CLSwapQuote;
  readonly after: readonly CLPoolSnapshot[];
  readonly receipt: ExecutionReceipt;
  readonly gasFee: bigint;
  readonly routerNativeBalance: bigint;
  readonly transport: RpcTransport;
}): Promise<void> {
  const { quote, after, receipt, gasFee, transport } = input;
  const requireMatch = (condition: boolean, message: string) => {
    swapRequire(condition, "ReconciliationMismatch", message);
  };
  requireMatch(
    quote.coordinate.blockNumber + 1n === receipt.blockNumber &&
      quote.pools.length === after.length &&
      quote.routerNativeBalance === 0n &&
      input.routerNativeBalance === 0n,
    "CL swap receipt baseline or router custody differs",
  );
  const expectedTransfers = new Map<
    `0x${string}`,
    { from: `0x${string}`; to: `0x${string}`; amount: bigint }[]
  >();
  const addTransfer = (
    token: `0x${string}`,
    from: `0x${string}`,
    to: `0x${string}`,
    amount: bigint,
  ) => {
    const rows = expectedTransfers.get(token) ?? [];
    rows.push({ from, to, amount });
    expectedTransfers.set(token, rows);
  };
  for (const [i, row] of quote.pools.entries()) {
    const before = row.snapshot,
      current = after[i],
      hop = quote.route[i];
    requireMatch(current !== undefined && hop !== undefined, "CL swap pool result missing");
    if (!current || !hop) throw new Error("unreachable CL route");
    const zeroForOne = hop.tokenIn === before.key.token0,
      delta0 = zeroForOne ? row.amountIn : -row.amountOut,
      delta1 = zeroForOne ? -row.amountOut : row.amountIn;
    requireMatch(
      current.coordinate.blockNumber === receipt.blockNumber &&
        current.coordinate.blockHash === receipt.blockHash &&
        current.coordinate.chainId === quote.coordinate.chainId &&
        current.coordinate.networkId === quote.coordinate.networkId &&
        current.account === quote.account &&
        current.pool === before.pool &&
        current.factory.address === before.factory.address &&
        current.implementation.address === before.implementation.address &&
        current.manager.address === before.manager.address &&
        current.key.token0 === before.key.token0 &&
        current.key.token1 === before.key.token1 &&
        current.key.tickSpacing === before.key.tickSpacing &&
        current.writeCompatible,
      "CL swap post-state identity differs",
    );
    const recipient = i === quote.pools.length - 1 ? quote.account : quote.router.address,
      payer = i === 0 ? quote.account : quote.router.address,
      abi = resolveEvent({
        ...current.coordinate,
        contractId: current.implementation.contractId,
        eventName: "Swap",
      });
    const swaps = getReceiptLogs(receipt, current.pool)
        .map((log) => codec.decodeEvent(abi, log))
        .filter((row) => row !== null),
      expected = [
        quote.router.address,
        recipient,
        delta0,
        delta1,
        row.sqrtPriceX96,
        row.liquidity,
        BigInt(row.tick),
      ];
    requireMatch(
      swaps.length === 1 &&
        swaps[0]?.length === expected.length &&
        swaps[0].every((value, j) => value === expected[j]),
      "CL Swap event differs from receipt predecessor quote",
    );
    requireMatch(
      current.sqrtPriceX96 === row.sqrtPriceX96 &&
        current.tick === row.tick &&
        current.liquidity === row.liquidity &&
        current.stakedLiquidity === row.stakedLiquidity &&
        current.globalFee0X128 === row.globalFee0X128 &&
        current.globalFee1X128 === row.globalFee1X128 &&
        current.poolBalance0 === before.poolBalance0 + delta0 &&
        current.poolBalance1 === before.poolBalance1 + delta1 &&
        current.fee === before.fee &&
        current.unstakedFee === before.unstakedFee &&
        current.gauge?.address === before.gauge?.address &&
        current.gauge?.alive === before.gauge?.alive &&
        current.gauge?.stakeCount === before.gauge?.stakeCount &&
        current.ownedCount === before.ownedCount &&
        current.nftSupply === before.nftSupply &&
        current.unlocked,
      "CL pool price, liquidity, fees or custody differs",
    );
    const feeAbi = current.implementation.readAbi.find(
      (row) => row.type === "function" && row.name === "gaugeFees",
    );
    requireMatch(feeAbi !== undefined, "CL gauge fee getter missing");
    const fees = codec.decodeFunction(
      feeAbi,
      await transport.read({
        ...current.coordinate,
        contractId: current.implementation.contractId,
        address: current.pool,
        data: codec.encodeFunction(feeAbi, []),
      }),
    );
    requireMatch(
      parseUint(fees[0], 128) === row.gaugeFeeAfter0 &&
        parseUint(fees[1], 128) === row.gaugeFeeAfter1,
      "CL gauge fee custody accounting differs",
    );
    for (const crossed of row.crossings) {
      const tick = current.ticks.find((t) => t.tick === crossed.tick);
      requireMatch(
        tick !== undefined &&
          tick.initialized &&
          tick.liquidityGross === crossed.liquidityGross &&
          tick.liquidityNet === crossed.liquidityNet &&
          tick.stakedLiquidityNet === crossed.stakedLiquidityNet &&
          tick.feeGrowthOutside0X128 === crossed.feeOutsideAfter0X128 &&
          tick.feeGrowthOutside1X128 === crossed.feeOutsideAfter1X128,
        "CL crossed tick accounting differs",
      );
    }
    for (const [beforeToken, afterToken] of [
      [before.token0, current.token0],
      [before.token1, current.token1],
    ]) {
      if (!beforeToken || !afterToken) throw new Error("unreachable CL asset");
      const address = beforeToken.target.address,
        delta =
          address === quote.inputToken.target.address
            ? -quote.amountIn
            : address === quote.outputToken.target.address
              ? quote.estimatedAmountOut
              : 0n;
      requireMatch(
        afterToken.target.address === address && afterToken.balance === beforeToken.balance + delta,
        "CL wallet asset delta differs",
      );
    }
    requireMatch(
      current.nativeBalance === before.nativeBalance - gasFee,
      "CL native gas accounting differs",
    );
    addTransfer(hop.tokenIn, payer, before.pool, row.amountIn);
    addTransfer(hop.tokenOut, before.pool, recipient, row.amountOut);
  }
  const touched = [
    quote.account,
    quote.router.address,
    ...quote.pools.map((row) => row.snapshot.pool),
  ];
  for (const [token, expected] of expectedTransfers) {
    const transfers = decodeTokenTransfers(receipt, token).filter(
      (row) => touched.includes(row.from) || touched.includes(row.to),
    );
    requireMatch(transfers.length === expected.length, "CL swap token transfer count differs");
    for (const e of expected)
      requireMatch(
        transfers.filter((row) => row.from === e.from && row.to === e.to && row.amount === e.amount)
          .length === 1,
        "CL swap token payer, recipient or amount differs",
      );
  }
  const final = await transport.getBlock(receipt.blockNumber);
  requireMatch(
    final !== undefined &&
      final !== null &&
      parseHash32(final.hash) === receipt.blockHash &&
      parseUint(await transport.getChainId()) === quote.coordinate.chainId,
    "CL swap settlement coordinate changed",
  );
}
