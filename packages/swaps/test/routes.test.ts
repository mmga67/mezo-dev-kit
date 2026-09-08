import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { sortBasicPoolKey } from "@mezo-dev-kit/pools";
import type { BasicPoolKey, BasicPoolReader, BasicPoolSnapshot } from "@mezo-dev-kit/pools";
import type { TokenSnapshot } from "@mezo-dev-kit/tokens";
import {
  createBasicSwapReader,
  rankBasicSwapQuotes,
  validateBasicSwapRoute,
} from "../src/index.ts";
const address = (digit: string): `0x${string}` => `0x${digit.repeat(40)}`;
const a = address("1"),
  b = address("2"),
  c = address("3"),
  d = address("4"),
  account = address("9");
const hop = (tokenIn = a, tokenOut = b) => ({ tokenIn, tokenOut, stable: true });
test("one to three contiguous, acyclic hops retain explicit intermediate permission", () => {
  expect(validateBasicSwapRoute([hop()], [])).toEqual([hop()]);
  expect(validateBasicSwapRoute([hop(), hop(b, c), hop(c, d)], [b, c])).toHaveLength(3);
  expect(() => validateBasicSwapRoute([hop(), hop(b, c)], [])).toThrow("not allowed");
  expect(() => validateBasicSwapRoute([hop(), hop(c, d)], [b, c])).toThrow("discontinuous");
  expect(() => validateBasicSwapRoute([hop(), hop(b, a)], [b])).toThrow("cyclic");
  expect(() => validateBasicSwapRoute([], [])).toThrow();
  expect(() =>
    validateBasicSwapRoute([hop(), hop(b, c), hop(c, d), hop(d, address("5"))], [b, c, d]),
  ).toThrow();
});
const coordinate = {
  networkId: "mezo-mainnet",
  chainId: 31612n,
  blockNumber: 11703359n,
  blockHash: `0x${"ab".repeat(32)}`,
} as const;
const registry = createContractRegistry(),
  router = registry.resolve({
    contractId: "mezo-earn.router",
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  }).address;
const word = (number: bigint) => number.toString(16).padStart(64, "0");
const result = (amountIn: bigint, amountOut: bigint) =>
  `0x${[32n, 2n, amountIn, amountOut].map(word).join("")}`;
function fixture() {
  const state = {
    output: 1500n,
    returnedInput: 1000n,
    fees: {
      balance: 0n,
      index0: 0n,
      index1: 0n,
      supplyIndex0: 0n,
      supplyIndex1: 0n,
      claimable0: 0n,
      claimable1: 0n,
      pending0: 0n,
      pending1: 0n,
    },
    paused: false,
    chain: 31612n,
    donation: false,
  };
  const token = (asset: `0x${string}`): TokenSnapshot => ({
    target: { contractId: "mezo-earn.pool-factory", address: asset, targetRole: "basic-token-0" },
    coordinate,
    account,
    spender: router,
    balance: 10000n,
    allowance: 10000n,
    decimals: 18n,
  });
  function snapshot(key: BasicPoolKey): BasicPoolSnapshot {
    return {
      coordinate,
      timestamp: 1000n,
      providerId: "fixture",
      key,
      account,
      router,
      factory: address("5"),
      factoryRegistry: address("6"),
      implementation: address("7"),
      pool: address("8"),
      poolFees: address("a"),
      fees: state.fees,
      paused: state.paused,
      feeBps: 30n,
      reserve0: 10000n,
      reserve1: 20000n,
      reserveTimestamp: 999n,
      poolBalance0: state.donation ? 10001n : 10000n,
      poolBalance1: 20000n,
      totalSupply: 1000n,
      poolLpBalance: 0n,
      writeCompatible: true,
      token0: token(key.token0),
      token1: token(key.token1),
      lp: token(address("8")),
    };
  }
  const pools: BasicPoolReader = { read: (input) => Promise.resolve(snapshot(input.key)) };
  const transport = createRpcTransport({
    id: "fixture",
    request: async ({ method }) => {
      if (method === "eth_blockNumber") return "0xb2943f";
      if (method === "eth_getBlockByNumber")
        return { number: "0xb2943f", hash: coordinate.blockHash, timestamp: "0x3e8" };
      if (method === "eth_chainId") return `0x${state.chain.toString(16)}`;
      if (method === "eth_call") return result(state.returnedInput, state.output);
      throw new Error("unexpected RPC");
    },
  });
  return {
    state,
    reader: createBasicSwapReader({ networkId: "mezo-mainnet", registry, transport, pools }),
  };
}
const quoteInput = {
  route: [hop()],
  intermediateAssets: [],
  account,
  amountIn: 1000n,
  maxAgeBlocks: 2n,
} as const;
test("amount-specific quote preserves the pool coordinate, units and approval target", async () => {
  const { reader } = fixture();
  const quote = await reader.quote(quoteInput);
  expect(quote).toMatchObject({
    sourceClass: "dex-execution-quote",
    amountIn: 1000n,
    amounts: [1000n, 1500n],
    estimatedAmountOut: 1500n,
    coordinate,
    writeCompatible: true,
  });
  expect(quote.pools[0]?.key).toEqual(sortBasicPoolKey({ tokenA: a, tokenB: b, stable: true }));
  expect(quote.inputToken.target.address).toBe(a);
  expect(quote.outputToken.target.address).toBe(b);
});
test("zero, partial, paused, donated and wrong-chain quotes cannot become executable candidates", async () => {
  const { reader, state } = fixture();
  state.output = 0n;
  await expect(reader.quote(quoteInput)).rejects.toThrow("zero, partial");
  state.output = 1500n;
  state.returnedInput = 999n;
  await expect(reader.quote(quoteInput)).rejects.toThrow("different input");
  state.returnedInput = 1000n;
  state.paused = true;
  await expect(reader.quote(quoteInput)).rejects.toThrow("paused");
  state.paused = false;
  state.donation = true;
  await expect(reader.quote(quoteInput)).rejects.toThrow("unaccounted");
  state.donation = false;
  state.chain = 1n;
  await expect(reader.quote(quoteInput)).rejects.toThrow("coordinate changed");
});
test("ranking keeps incompatible quote requests separate", async () => {
  const { reader, state } = fixture();
  const first = await reader.quote(quoteInput);
  state.output = 1600n;
  const second = await reader.quote(quoteInput);
  expect(rankBasicSwapQuotes([first, second])).toEqual([second, first]);
  expect(() => rankBasicSwapQuotes([first, { ...second, amountIn: 2000n }])).toThrow(
    "different assets",
  );
  expect(() => rankBasicSwapQuotes([first, { ...second, maxAgeBlocks: 3n }])).toThrow("policy");
  expect(() => rankBasicSwapQuotes([])).toThrow();
  expect(() => rankBasicSwapQuotes([{ ...first, writeCompatible: false }])).toThrow(
    "writer-compatible",
  );
  expect(() => rankBasicSwapQuotes([{ ...first, amounts: [first.amountIn, 0n] }])).toThrow();
  expect(() =>
    rankBasicSwapQuotes([{ ...first, pools: [{ ...first.pools[0]!, paused: true }] }]),
  ).toThrow("liquidity differs");
});
