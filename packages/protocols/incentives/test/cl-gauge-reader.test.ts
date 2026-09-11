import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createCLGaugeReader, createCLGaugeTargetResolver } from "../src/index.ts";
import { clGaugeFixture } from "./cl-gauge-fixture.ts";
test("CL gauge input validation precedes the injected position reader and RPC", async () => {
  let reads = 0;
  const reader = createCLGaugeReader({
    positions: {
      read: async () => {
        reads++;
        throw new Error("unexpected position read");
      },
    },
    registry: createContractRegistry(),
    transport: createRpcTransport({
      id: "unreachable",
      request: async () => {
        throw new Error("unexpected RPC");
      },
    }),
  });
  await expect(
    reader.read({ account: clGaugeFixture().pool.account, tokenId: 0n }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(reads).toBe(0);
});
test.for(["account", "coordinate", "coverage", "missing-gauge"] as const)(
  "CL position port %s mismatch is rejected before gauge RPC",
  async (kind) => {
    const s = clGaugeFixture(),
      pool = s.pool;
    const reader = createCLGaugeReader({
      positions: {
        read: async () =>
          kind === "account"
            ? { ...pool, account: s.gauge }
            : kind === "coordinate"
              ? {
                  ...pool,
                  coordinate: { ...pool.coordinate, blockNumber: pool.coordinate.blockNumber + 1n },
                }
              : kind === "coverage"
                ? { ...pool, positions: [] }
                : { ...pool, gauge: null },
      },
      registry: createContractRegistry(),
      transport: createRpcTransport({
        id: "unreachable",
        request: async () => {
          throw new Error("unexpected RPC");
        },
      }),
    });
    await expect(
      reader.read({ account: pool.account, tokenId: 1n, blockNumber: pool.coordinate.blockNumber }),
    ).rejects.toMatchObject({
      code: kind === "missing-gauge" ? "UnavailableState" : "IdentityMismatch",
    });
  },
);
test("CL gauge target resolution requires the exact template, role and block", async () => {
  const s = clGaugeFixture(),
    resolver = createCLGaugeTargetResolver({
      reader: { read: async () => s },
      account: s.pool.account,
      tokenId: 1n,
    }),
    input = { coordinate: s.pool.coordinate, contractId: s.contract.contractId, role: "cl-gauge" };
  expect(await resolver(input)).toBe(s.gauge);
  await expect(resolver({ ...input, role: "savings-gauge" })).rejects.toMatchObject({
    code: "IdentityMismatch",
  });
  await expect(
    resolver({ ...input, coordinate: { ...input.coordinate, blockHash: `0x${"00".repeat(32)}` } }),
  ).rejects.toMatchObject({ code: "IdentityMismatch" });
});
