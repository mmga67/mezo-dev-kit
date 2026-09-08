import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createRedemptionReader } from "../src/index.ts";
const account = `0x${"11".repeat(20)}` as const;
function fixture() {
  let calls = 0;
  const reader = createRedemptionReader({
    networkId: "mezo-mainnet",
    registry: createContractRegistry(),
    transport: createRpcTransport({
      id: "no-io",
      request: async () => {
        calls++;
        throw new Error("unexpected RPC");
      },
    }),
  });
  return { reader, calls: () => calls };
}
test("zero/unbounded iterations and excessive hint/tail budgets reject before RPC", async () => {
  const { reader, calls } = fixture(),
    input = {
      account,
      requestedAmount: 100n,
      maxIterations: 1n,
      maxTailScan: 32,
      trials: 10n,
      seed: 0n,
    };
  for (const change of [
    { maxIterations: 0n },
    { maxIterations: 65n },
    { maxTailScan: 65 },
    { maxTailScan: NaN },
    { trials: 1001n },
    { requestedAmount: 0n },
  ])
    await expect(reader.quote({ ...input, ...change })).rejects.toMatchObject({
      code: "InvalidInput",
    });
  expect(calls()).toBe(0);
});
test("duplicate, zero or oversized borrower inventory rejects before RPC", async () => {
  const { reader, calls } = fixture();
  await expect(reader.read({ account, borrowers: [account, account] })).rejects.toMatchObject({
    code: "InvalidInput",
  });
  await expect(reader.read({ account, borrowers: [`0x${"00".repeat(20)}`] })).rejects.toMatchObject(
    { code: "InvalidInput" },
  );
  await expect(
    reader.read({ account, borrowers: Array.from({ length: 65 }, () => account) }),
  ).rejects.toMatchObject({ code: "LimitExceeded" });
  expect(calls()).toBe(0);
});
