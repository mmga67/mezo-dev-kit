import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { getTokenInterface, resolveEvent } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { keccak256, toRpcQuantity } from "@mezo-dev-kit/evm";
import { verifyCLSwapSettlement } from "../src/cl-settlement.ts";
import { clQuoteFixture } from "./cl-fixture.ts";
/** Fixture-only static event words, including sign extension for int24 boundaries. */
function log(
  abi: ContractAbiEntry,
  address: `0x${string}`,
  args: readonly (bigint | `0x${string}`)[],
  receipt: ExecutionReceipt,
  index: number,
) {
  assert(Array.isArray(abi.inputs) && typeof abi.name === "string");
  const inputs = abi.inputs.map((value: unknown) => {
    assert(value && typeof value === "object" && !Array.isArray(value));
    const p = value as Record<string, unknown>;
    assert(typeof p.type === "string" && /^(address|u?int(24|128|160|256))$/.test(p.type));
    return { type: p.type, indexed: p.indexed === true };
  });
  assert.equal(inputs.length, args.length);
  const topics: string[] = [
    keccak256(
      `0x${Buffer.from(`${abi.name}(${inputs.map((p) => p.type).join(",")})`).toString("hex")}`,
    ),
  ];
  let data = "0x";
  inputs.forEach((p, i) => {
    const value = args[i];
    assert(value !== undefined);
    const word = (
      typeof value === "bigint" ? BigInt.asUintN(256, value).toString(16) : value.slice(2)
    ).padStart(64, "0");
    if (p.indexed) topics.push(`0x${word}`);
    else data += word;
  });
  return {
    address,
    topics,
    data,
    removed: false,
    blockNumber: toRpcQuantity(receipt.blockNumber),
    blockHash: receipt.blockHash,
    transactionHash: receipt.transactionHash,
    logIndex: toRpcQuantity(BigInt(index)),
  };
}
function fixture() {
  const quote = clQuoteFixture(),
    row = quote.pools[0]!,
    before = row.snapshot,
    gasFee = 17n;
  const after = {
    ...before,
    coordinate: { ...before.coordinate, blockNumber: before.coordinate.blockNumber + 1n },
    timestamp: before.timestamp + 1n,
    sqrtPriceX96: row.sqrtPriceX96,
    tick: row.tick,
    liquidity: row.liquidity,
    stakedLiquidity: row.stakedLiquidity,
    globalFee0X128: row.globalFee0X128,
    globalFee1X128: row.globalFee1X128,
    poolBalance0: before.poolBalance0 + quote.amountIn,
    poolBalance1: before.poolBalance1 - quote.estimatedAmountOut,
    token0: { ...before.token0, balance: before.token0.balance - quote.amountIn },
    token1: { ...before.token1, balance: before.token1.balance + quote.estimatedAmountOut },
    nativeBalance: before.nativeBalance - gasFee,
  };
  const receipt: ExecutionReceipt = {
    blockNumber: after.coordinate.blockNumber,
    blockHash: after.coordinate.blockHash,
    transactionHash: `0x${"ef".repeat(32)}`,
    logs: [],
  };
  const transfer = getTokenInterface().find(
    (row) => row.type === "event" && row.name === "Transfer",
  );
  assert(transfer);
  const logs = [
    log(
      transfer,
      before.key.token1,
      [before.pool, quote.account, quote.estimatedAmountOut],
      receipt,
      0,
    ),
    log(transfer, before.key.token0, [quote.account, before.pool, quote.amountIn], receipt, 1),
    log(
      resolveEvent({
        ...after.coordinate,
        contractId: before.implementation.contractId,
        eventName: "Swap",
      }),
      before.pool,
      [
        quote.router.address,
        quote.account,
        quote.amountIn,
        -quote.estimatedAmountOut,
        row.sqrtPriceX96,
        row.liquidity,
        BigInt(row.tick),
      ],
      receipt,
      2,
    ),
  ];
  const transport = createRpcTransport({
    id: "synthetic-cl-settlement",
    request: async (input) => {
      if (input.method === "eth_getBlockByNumber")
        return {
          number: toRpcQuantity(after.coordinate.blockNumber),
          hash: after.coordinate.blockHash,
          timestamp: toRpcQuantity(after.timestamp),
        };
      if (input.method === "eth_chainId") return toRpcQuantity(after.coordinate.chainId);
      if (input.method === "eth_call")
        return `0x${[row.gaugeFeeAfter0, row.gaugeFeeAfter1].map((value) => value.toString(16).padStart(64, "0")).join("")}`;
      throw new Error(`unexpected ${input.method}`);
    },
  });
  return {
    quote,
    after: [after],
    receipt: { ...receipt, logs },
    gasFee,
    routerNativeBalance: 0n,
    transport,
  };
}
test("CL settlement proves exact pool output, fee allocation, wallet and nonzero gas", async () => {
  await expect(verifyCLSwapSettlement(fixture())).resolves.toBeUndefined();
});
test.for([
  "wallet",
  "custody",
  "gas",
  "fee",
  "price",
  "stake",
  "refund",
  "missing-payment",
] as const)("CL %s corruption cannot reconcile", async (kind) => {
  const f = fixture(),
    a = f.after[0]!;
  let after = a,
    receipt = f.receipt,
    routerNativeBalance = 0n;
  if (kind === "wallet") after = { ...a, token1: { ...a.token1, balance: a.token1.balance + 1n } };
  if (kind === "custody") after = { ...a, poolBalance0: a.poolBalance0 + 1n };
  if (kind === "gas") after = { ...a, nativeBalance: a.nativeBalance + 1n };
  if (kind === "fee") after = { ...a, globalFee0X128: a.globalFee0X128 + 1n };
  if (kind === "price") after = { ...a, sqrtPriceX96: a.sqrtPriceX96 + 1n };
  if (kind === "stake") after = { ...a, stakedLiquidity: a.stakedLiquidity + 1n };
  if (kind === "refund") routerNativeBalance = 1n;
  if (kind === "missing-payment") receipt = { ...receipt, logs: receipt.logs.slice(1) };
  await expect(
    verifyCLSwapSettlement({ ...f, after: [after], receipt, routerNativeBalance }),
  ).rejects.toMatchObject({ code: "ReconciliationMismatch" });
});
