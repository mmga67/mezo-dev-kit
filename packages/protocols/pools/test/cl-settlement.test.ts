import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { getTokenInterface, resolveEvent } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import { keccak256, toRpcQuantity } from "@mezo-dev-kit/evm";
import type { CLPoolSnapshot } from "../src/index.ts";
import { verifyCLPositionSettlement } from "../src/cl-settlement.ts";
import { clFixture, Q128, W } from "./cl-fixture.ts";
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
    assert(typeof p.type === "string" && /^(address|u?int(24|128|256))$/.test(p.type));
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
function collection(empty = false) {
  let before = clFixture();
  if (empty)
    before = {
      ...before,
      positions: before.positions.map((p) => ({
        ...p,
        tokensOwed0: 0n,
        tokensOwed1: 0n,
        lastInside0X128: 3n * Q128,
        lastInside1X128: 2n * Q128,
        fees0: { ...p.fees0, accrued: 0n, tokensOwed: 0n },
        fees1: { ...p.fees1, accrued: 0n, tokensOwed: 0n },
      })),
    };
  const actual0 = empty ? 0n : 10n,
    actual1 = empty ? 0n : 12n,
    gasFee = 17n;
  const after: CLPoolSnapshot = {
    ...before,
    coordinate: { ...before.coordinate, blockNumber: before.coordinate.blockNumber + 1n },
    timestamp: before.timestamp + 1n,
    token0: { ...before.token0, balance: before.token0.balance + actual0 },
    token1: { ...before.token1, balance: before.token1.balance + actual1 },
    poolBalance0: before.poolBalance0 - actual0,
    poolBalance1: before.poolBalance1 - actual1,
    nativeBalance: before.nativeBalance - gasFee,
    positions: before.positions.map((p) => ({
      ...p,
      tokensOwed0: empty ? 0n : 3n * W + 2n - 11n,
      tokensOwed1: empty ? 0n : 2n * W + 2n - 13n,
      lastInside0X128: 3n * Q128,
      lastInside1X128: 2n * Q128,
    })),
  };
  const receipt: ExecutionReceipt = {
    blockNumber: after.coordinate.blockNumber,
    blockHash: after.coordinate.blockHash,
    transactionHash: `0x${"cd".repeat(32)}`,
    logs: [],
  };
  const logs: unknown[] = [];
  const event = (
    contract: typeof before.manager,
    name: string,
    address: `0x${string}`,
    args: readonly (bigint | `0x${string}`)[],
  ) => {
    logs.push(
      log(
        resolveEvent({ ...before.coordinate, contractId: contract.contractId, eventName: name }),
        address,
        args,
        receipt,
        logs.length,
      ),
    );
  };
  event(before.manager, "Collect", before.manager.address, [
    1n,
    before.account,
    empty ? 0n : 11n,
    empty ? 0n : 13n,
  ]);
  event(before.implementation, "Burn", before.pool, [
    before.manager.address,
    -60n,
    60n,
    0n,
    0n,
    0n,
  ]);
  event(before.implementation, "Collect", before.pool, [
    before.manager.address,
    before.account,
    -60n,
    60n,
    actual0,
    actual1,
  ]);
  const transfer = getTokenInterface().find((e) => e.type === "event" && e.name === "Transfer");
  assert(transfer);
  if (!empty)
    for (const [address, amount] of [
      [before.key.token0, actual0],
      [before.key.token1, actual1],
    ] as const)
      logs.push(
        log(transfer, address, [before.pool, before.account, amount], receipt, logs.length),
      );
  return {
    before,
    after,
    receipt: { ...receipt, logs },
    gasFee,
    tokenId: 1n,
    action: { kind: "collect", tokenId: 1n, amount0Max: 11n, amount1Max: 13n } as const,
  };
}
test("CL collection deducts manager accounting caps but proves the lower actual wallet payment", () => {
  const result = verifyCLPositionSettlement(collection());
  expect(result).toMatchObject({
    amount0: 10n,
    amount1: 12n,
    walletDelta0: 10n,
    walletDelta1: 12n,
    forecast: { amount0: 11n, amount1: 13n, tokensOwedAfter0: 3n * W - 9n },
  });
});
test("CL zero collection keeps its accounting events without invented token transfers", () => {
  expect(verifyCLPositionSettlement(collection(true))).toMatchObject({
    amount0: 0n,
    amount1: 0n,
    walletDelta0: 0n,
    walletDelta1: 0n,
  });
});
test.for([
  "wallet",
  "custody",
  "gas",
  "owed",
  "tick",
  "price",
  "owner",
  "missing-payment",
  "duplicate-event",
] as const)("CL %s corruption cannot reconcile", (kind) => {
  const fixture = collection(),
    a = fixture.after;
  let after = a,
    receipt = fixture.receipt;
  if (kind === "wallet") after = { ...a, token0: { ...a.token0, balance: a.token0.balance + 1n } };
  if (kind === "custody") after = { ...a, poolBalance1: a.poolBalance1 + 1n };
  if (kind === "gas") after = { ...a, nativeBalance: a.nativeBalance + 1n };
  if (kind === "owed")
    after = {
      ...a,
      positions: a.positions.map((p) => ({ ...p, tokensOwed0: p.tokensOwed0 + 1n })),
    };
  if (kind === "tick")
    after = { ...a, ticks: a.ticks.map((p) => ({ ...p, liquidityGross: p.liquidityGross + 1n })) };
  if (kind === "price") after = { ...a, sqrtPriceX96: a.sqrtPriceX96 + 1n };
  if (kind === "owner")
    after = { ...a, positions: a.positions.map((p) => ({ ...p, owner: a.manager.address })) };
  if (kind === "missing-payment") receipt = { ...receipt, logs: receipt.logs.slice(0, -1) };
  if (kind === "duplicate-event") {
    const first = receipt.logs[0];
    assert(first && typeof first === "object" && !Array.isArray(first));
    receipt = {
      ...receipt,
      logs: [...receipt.logs, { ...first, logIndex: toRpcQuantity(BigInt(receipt.logs.length)) }],
    };
  }
  expect(() => verifyCLPositionSettlement({ ...fixture, after, receipt })).toThrow(
    expect.objectContaining({ code: "ReconciliationMismatch" }),
  );
});
