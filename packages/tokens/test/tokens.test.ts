import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExecutionClient } from "@mezo-dev-kit/core";
import { createApprovalWriter, createTokenReader, planApproval } from "../src/index.ts";

const account = "0x0000000000000000000000000000000000000001";
const spender = "0x0000000000000000000000000000000000000002";
const coordinate = {
  networkId: "mezo-mainnet" as const,
  chainId: 31612n,
  blockNumber: 11703359n,
  blockHash: `0x${"a".repeat(64)}` as const,
};
const target = createContractRegistry().resolve({
  contractId: "musd.token",
  networkId: coordinate.networkId,
  blockNumber: coordinate.blockNumber,
});
test("token coordinates cannot mislabel a chain as another network", async () => {
  const transport = createRpcTransport({
    id: "unreachable",
    request: async () => {
      throw new Error("must validate before RPC");
    },
  });
  await expect(
    createTokenReader({ transport }).read({
      target: { contractId: target.contractId, address: target.address },
      coordinate: { ...coordinate, chainId: 1n },
      account,
      spender,
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
});
test.for([
  { allowance: 10n, requiredAmount: 9n, expected: { kind: "sufficient" } },
  { allowance: 0n, requiredAmount: 12n, expected: { kind: "approve", amount: 12n } },
  {
    allowance: 3n,
    requiredAmount: 12n,
    expected: { kind: "reset", amount: 0n, requiredAmount: 12n },
  },
])(
  "allowance $allowance for $requiredAmount gives an explicit bounded step",
  ({ allowance, requiredAmount, expected }) => {
    expect(planApproval({ allowance, requiredAmount })).toEqual(expected);
  },
);
test("approval preparation rejects stale or nonzero allowance and freezes the exact intent", async () => {
  let allowance = 0n;
  const transport = createRpcTransport({
    id: "token-fixture",
    request: ({ method, params }) => {
      if (method === "eth_chainId") return Promise.resolve("0x7b7c");
      if (method === "eth_getBlockByNumber")
        return Promise.resolve({ number: params[0], hash: coordinate.blockHash, timestamp: "0x1" });
      if (method === "eth_call") {
        const call = params[0];
        if (!call || typeof call !== "object" || !("data" in call) || typeof call.data !== "string")
          throw new Error("missing call");
        const value = call.data.startsWith("0xdd62ed3e")
          ? allowance
          : call.data.startsWith("0x313ce567")
            ? 18n
            : 100n;
        return Promise.resolve(`0x${value.toString(16).padStart(64, "0")}`);
      }
      throw new Error("unexpected RPC method");
    },
  });
  const unreachable = () => {
    throw new Error("preparation must not execute");
  };
  const execution: ExecutionClient = {
    simulate: unreachable,
    submit: unreachable,
    observe: unreachable,
    inspectHash: unreachable,
    reconcile: unreachable,
  };
  const writer = createApprovalWriter({
    reader: createTokenReader({ transport }),
    transport,
    execution,
  });
  const input = {
    target: { contractId: target.contractId, address: target.address },
    coordinate,
    account,
    spender,
    operationId: "approval",
    expectedAllowance: 0n,
    amount: 12n,
  } satisfies Parameters<typeof writer.prepare>[0];
  const prepared = await writer.prepare(input);
  expect(prepared.transaction.to).toBe(target.address);
  expect(prepared.transaction.data.startsWith("0x095ea7b3")).toBe(true);
  expect(Object.isFrozen(prepared.before.target)).toBe(true);
  allowance = 3n;
  await expect(writer.prepare(input)).rejects.toMatchObject({ code: "StaleAllowance" });
  await expect(writer.prepare({ ...input, expectedAllowance: 3n })).rejects.toMatchObject({
    code: "ResetRequired",
  });
  await expect(
    writer.prepare({ ...input, expectedAllowance: 3n, amount: 0n }),
  ).resolves.toMatchObject({ amount: 0n });
});
