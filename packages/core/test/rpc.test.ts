import { expect, test } from "vitest";
import { createRpcTransport } from "../src/index.ts";
const coordinate = {
  networkId: "mezo-mainnet",
  chainId: 31612n,
  blockNumber: 10n,
  blockHash: `0x${"ab".repeat(32)}`,
} as const;
const account = `0x${"11".repeat(20)}` as const;
test("native balance uses the pinned block and rejects malformed quantities or reorgs", async () => {
  let balance: unknown = "0xff",
    reorg = false,
    read = false;
  const transport = createRpcTransport({
    id: "balance",
    request: async ({ method, params }) => {
      if (method === "eth_getBlockByNumber")
        return {
          number: "0xa",
          timestamp: "0x1",
          hash: reorg && read ? `0x${"cd".repeat(32)}` : coordinate.blockHash,
        };
      if (method === "eth_getBalance") {
        expect(params).toEqual([account, "0xa"]);
        read = true;
        return balance;
      }
      throw new Error("unexpected RPC");
    },
  });
  expect(await transport.getBalance(account, coordinate)).toBe(255n);
  balance = "0x00";
  await expect(transport.getBalance(account, coordinate)).rejects.toThrow();
  balance = "0xff";
  reorg = true;
  read = false;
  await expect(transport.getBalance(account, coordinate)).rejects.toThrow("changed during");
});
