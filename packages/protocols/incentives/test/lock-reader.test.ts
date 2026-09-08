import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createLockReader } from "../src/index.ts";
import { account } from "./lock-fixture.ts";
test("escrow inventory and ownership page budgets reject before provider I/O", async () => {
  let calls = 0;
  const reader = createLockReader({
    networkId: "mezo-mainnet",
    role: "vebtc-current",
    registry: createContractRegistry(),
    transport: createRpcTransport({
      id: "unreachable",
      request: async () => {
        calls++;
        throw new Error("unexpected read");
      },
    }),
  });
  for (const tokenIds of [
    [0n],
    [1n, 1n],
    Array.from({ length: 33 }, (_, index) => BigInt(index + 1)),
  ])
    await expect(reader.read({ account, tokenIds })).rejects.toThrow();
  for (const limit of [0, 33, NaN])
    await expect(reader.listOwned({ account, offset: 0n, limit })).rejects.toThrow();
  expect(calls).toBe(0);
});
