import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createCLPoolReader, sortCLPoolKey } from "../src/index.ts";
const account = `0x${"11".repeat(20)}` as const,
  tokenA = `0x${"22".repeat(20)}` as const,
  tokenB = `0x${"33".repeat(20)}` as const;
test("CL input budgets and key alignment reject before any provider access", async () => {
  let requests = 0;
  const transport = createRpcTransport({
      id: "unreachable",
      request: async () => {
        requests++;
        throw new Error("unexpected RPC");
      },
    }),
    reader = createCLPoolReader({
      networkId: "mezo-mainnet",
      registry: createContractRegistry(),
      transport,
    }),
    key = sortCLPoolKey({ tokenA, tokenB, tickSpacing: 200 });
  for (const input of [
    { account, key: { ...key, token0: tokenB, token1: tokenA } },
    { account, key, tokenIds: [1n, 1n] },
    { account, key, tokenIds: [0n] },
    { account, key, tokenIds: Array.from({ length: 17 }, (_, i) => BigInt(i + 1)) },
    { account, key, ticks: Array.from({ length: 33 }, (_, i) => i) },
    { account, key, ticks: [0, 0] },
    { account, key, ticks: [887273] },
  ])
    await expect(reader.read(input)).rejects.toMatchObject({ code: "InvalidInput" });
  expect(requests).toBe(0);
});
test("wrong CL chain fails before registry or contract reads", async () => {
  const methods: string[] = [];
  const transport = createRpcTransport({
      id: "wrong-chain",
      request: async (input) => {
        methods.push(input.method);
        return "0x1";
      },
    }),
    reader = createCLPoolReader({
      networkId: "mezo-mainnet",
      registry: createContractRegistry(),
      transport,
    });
  await expect(
    reader.read({ account, key: sortCLPoolKey({ tokenA, tokenB, tickSpacing: 1 }) }),
  ).rejects.toMatchObject({ code: "IdentityMismatch" });
  expect(methods).toEqual(["eth_chainId"]);
});
