import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createAbiCodec, toRpcQuantity } from "@mezo-dev-kit/evm";
import { validateCLSwapRoute, encodeCLSwapPath } from "../src/index.ts";
import { quoteCLPool } from "../src/cl-quote-engine.ts";
import { clFixture, clQuoteFixture } from "./cl-fixture.ts";
test("CL packed paths retain int24 spacing and explicit intermediate permission", () => {
  const s = clFixture(),
    a = s.key.token0,
    b = s.key.token1,
    c = `0x${"44".repeat(20)}` as const,
    route = [
      { tokenIn: a, tokenOut: b, tickSpacing: 60 },
      { tokenIn: b, tokenOut: c, tickSpacing: 200 },
    ];
  expect(validateCLSwapRoute(route, [b])).toHaveLength(2);
  expect(encodeCLSwapPath(route)).toBe(`0x${a.slice(2)}00003c${b.slice(2)}0000c8${c.slice(2)}`);
  expect(() => validateCLSwapRoute(route, [])).toThrow(
    expect.objectContaining({ code: "InvalidInput" }),
  );
  expect(() =>
    validateCLSwapRoute([route[0]!, { tokenIn: b, tokenOut: a, tickSpacing: 1 }], [b]),
  ).toThrow(expect.objectContaining({ code: "InvalidInput" }));
  expect(() => validateCLSwapRoute([{ tokenIn: a, tokenOut: b, tickSpacing: 0 }], [])).toThrow();
  expect(() => validateCLSwapRoute([], [])).toThrow();
});
function harness(initialized = false) {
  const snapshot = clFixture(),
    codec = createAbiCodec();
  let calls = 0;
  const selectors = new Map(
    ["gaugeFees", "tickBitmap", "ticks"].map((name) => {
      const abi = snapshot.implementation.readAbi.find(
        (row) => row.type === "function" && row.name === name,
      );
      assert(abi);
      return [codec.encodeFunction(abi, name === "gaugeFees" ? [] : [0n]).slice(0, 10), name];
    }),
  );
  const transport = createRpcTransport({
    id: "synthetic-cl-engine",
    request: async (input) => {
      if (input.method === "eth_getBlockByNumber")
        return {
          number: toRpcQuantity(snapshot.coordinate.blockNumber),
          hash: snapshot.coordinate.blockHash,
          timestamp: toRpcQuantity(snapshot.timestamp),
        };
      if (input.method === "eth_call") {
        calls++;
        const call = input.params[0];
        assert(call && typeof call === "object" && "data" in call && typeof call.data === "string");
        const name = selectors.get(call.data.slice(0, 10));
        let values: readonly bigint[];
        if (name === "gaugeFees") values = [0n, 0n];
        else if (name === "tickBitmap")
          values = [
            initialized
              ? BigInt.asIntN(256, BigInt(`0x${call.data.slice(-64)}`)) === 0n
                ? 1n
                : 1n << 255n
              : 0n,
          ];
        else {
          assert.equal(name, "ticks");
          values = [snapshot.liquidity, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n];
        }
        return `0x${values.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
      }
      throw new Error(`unexpected ${input.method}`);
    },
  });
  return {
    snapshot,
    transport,
    get calls() {
      return calls;
    },
  };
}
test("CL quote crosses an empty word boundary and matches its exact input step", async () => {
  const h = harness(),
    q = await quoteCLPool({
      ...h,
      snapshot: h.snapshot,
      amountIn: 10n ** 15n,
      zeroForOne: true,
      budget: { maxSteps: 8, maxBitmapWords: 4, maxCrossedTicks: 4 },
    });
  expect(q.amountOut).toBe(clQuoteFixture().estimatedAmountOut);
  expect(q.steps).toBe(2);
  expect(q.bitmapWords).toBe(2);
  expect(q.crossings).toHaveLength(0);
});
test.for(["steps", "words", "crossings"] as const)(
  "CL %s budget stops before the next unapproved read",
  async (kind) => {
    const h = harness(kind === "crossings"),
      budget = {
        maxSteps: kind === "steps" ? 1 : 8,
        maxBitmapWords: kind === "words" ? 1 : 4,
        maxCrossedTicks: 1,
      };
    await expect(
      quoteCLPool({ ...h, snapshot: h.snapshot, amountIn: 10n ** 18n, zeroForOne: true, budget }),
    ).rejects.toMatchObject({ code: "BoundExceeded" });
    expect(h.calls).toBe(kind === "crossings" ? 4 : 2);
  },
);
test("CL zero-liquidity pool rejects before any bitmap read", async () => {
  const h = harness();
  await expect(
    quoteCLPool({
      ...h,
      snapshot: { ...h.snapshot, liquidity: 0n },
      amountIn: 1n,
      zeroForOne: true,
      budget: { maxSteps: 8, maxBitmapWords: 4, maxCrossedTicks: 4 },
    }),
  ).rejects.toMatchObject({ code: "UnavailableRoute" });
  expect(h.calls).toBe(0);
});
