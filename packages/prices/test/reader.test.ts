import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { parseHexData, toRpcQuantity } from "@mezo-dev-kit/evm";
import { createSkipPriceReader } from "../src/index.ts";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid fixture");
  return value as Record<string, unknown>;
}
const capture = object(
  JSON.parse(
    await readFile(
      new URL(
        "../../../knowledge/contracts/artifacts/read-runtime/lending-mainnet.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
if (!Array.isArray(capture.records)) throw new Error("missing runtime records");
const nativeCode = parseHexData(
  object(
    capture.records.find((entry: unknown) => object(entry).contractId === "oracle.skip-btc-usd"),
  ).code,
);
const registry = createContractRegistry(),
  number = 11703359n,
  hash = `0x${"ab".repeat(32)}` as const;
const words = (...values: bigint[]) =>
  `0x${values.map((value) => BigInt.asUintN(256, value).toString(16).padStart(64, "0")).join("")}`;
const input = {
  blockNumber: number,
  asOf: 1000n,
  observedAt: 1000n,
  maxAgeSeconds: 5n,
  targetDecimals: 8,
  rounding: "floor",
  allowPrecisionLoss: false,
} as const;
function fixture() {
  const state = {
    chain: 31612n,
    code: nativeCode,
    decimals: 18n,
    answer: 60000n * 10n ** 18n,
    updatedAt: 995n,
    changeHash: false,
    readCalls: 0,
  };
  const transport = createRpcTransport({
    id: "captured-interface-fixture",
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return toRpcQuantity(state.chain);
      if (method === "eth_getBlockByNumber")
        return {
          number: toRpcQuantity(number),
          hash: state.changeHash && state.readCalls === 2 ? `0x${"cd".repeat(32)}` : hash,
          timestamp: "0x3e8",
        };
      if (method === "eth_getCode") return state.code;
      if (method === "eth_call") {
        state.readCalls++;
        const call = object(params[0]);
        return call.data === "0x313ce567"
          ? words(state.decimals)
          : words(0n, state.answer, 0n, state.updatedAt, 0n);
      }
      throw new Error("unexpected method");
    },
  });
  return {
    state,
    reader: createSkipPriceReader({ networkId: "mezo-mainnet", registry, transport }),
    transport,
  };
}
test("direct Skip retains source, coordinate, round and policy at inclusive freshness boundary", async () => {
  const { reader } = fixture();
  expect(await reader.read(input)).toMatchObject({
    status: "valid",
    sourceClass: "pushed-feed-observation",
    confidence: null,
    sourceId: "source.skip-price-oracle-v1",
    sourceDecimals: 18n,
    coordinate: { blockNumber: number, blockHash: hash },
    normalization: { status: "valid", value: 6000000000000n },
    freshness: { status: "valid", ageSeconds: 5n },
    round: { roundId: 0n, answeredInRound: 0n },
    rounding: "floor",
    allowPrecisionLoss: false,
  });
});
test("negative, stale and absent publication remain invalid observations", async () => {
  const { reader, state } = fixture();
  state.answer = -1n;
  expect(await reader.read(input)).toMatchObject({
    status: "invalid",
    normalization: { status: "negative" },
  });
  state.answer = 1n * 10n ** 18n;
  state.updatedAt = 994n;
  expect(await reader.read(input)).toMatchObject({
    status: "invalid",
    freshness: { status: "stale" },
  });
  state.updatedAt = 0n;
  expect(await reader.read(input)).toMatchObject({
    status: "invalid",
    freshness: { status: "missing-time", ageSeconds: null },
  });
});
test("changed chain, runtime, source scale and future source times reject", async () => {
  const { reader, state, transport } = fixture();
  state.chain = 1n;
  await expect(reader.read(input)).rejects.toThrow("chain mismatch");
  state.chain = 31612n;
  state.code = parseHexData("0x00");
  await expect(reader.read(input)).rejects.toThrow("runtime differs");
  state.code = nativeCode;
  state.decimals = 8n;
  await expect(reader.read(input)).rejects.toThrow("scale differs");
  state.decimals = 18n;
  state.updatedAt = 1001n;
  await expect(reader.read(input)).rejects.toThrow("times are inconsistent");
  expect(() => createSkipPriceReader({ networkId: "mezo-testnet", registry, transport })).toThrow(
    "mainnet only",
  );
});
test("reorg during the native observation cannot produce a valid datum", async () => {
  const { reader, state } = fixture();
  state.changeHash = true;
  await expect(reader.read(input)).rejects.toThrow(/changed|canonical/);
});
