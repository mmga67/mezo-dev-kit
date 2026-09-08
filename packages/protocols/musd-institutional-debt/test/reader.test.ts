import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { createInstitutionalReader } from "../src/index.ts";
const hash = `0x${"ab".repeat(32)}` as const,
  account = `0x${"11".repeat(20)}` as const;
function fixture() {
  let requests = 0;
  const transport = createRpcTransport({
    id: "wrong-chain-fixture",
    request: ({ method }) => {
      requests++;
      if (method === "eth_chainId") return Promise.resolve("0x1");
      throw new Error("unexpected RPC");
    },
  });
  return {
    reader: createInstitutionalReader({
      networkId: "mezo-mainnet",
      registry: createContractRegistry(),
      transport,
    }),
    requests: () => requests,
  };
}
test("bounded distinct requests reject before any provider work", async () => {
  const { reader, requests } = fixture();
  await expect(
    reader.read({ positionIds: Array.from({ length: 17 }, () => hash) }),
  ).rejects.toThrow("at most 16");
  await expect(reader.read({ positionIds: [hash, hash] })).rejects.toThrow("duplicate");
  await expect(
    reader.readEnclave({
      generation: "original",
      account,
      targets: [{ address: account, selector: "0x01" }],
    }),
  ).rejects.toThrow("bytes4");
  await expect(
    reader.readEnclave({ generation: "second", account, targets: [], maxUtxos: 257 }),
  ).rejects.toThrow("one to 256");
  await expect(
    reader.readEnclave({
      generation: "second",
      account,
      targets: [
        { address: account, selector: "0x12345678" },
        { address: account, selector: "0x12345678" },
      ],
    }),
  ).rejects.toThrow("duplicate");
  expect(requests()).toBe(0);
});
test("both reader paths reject the wrong chain before resolving runtime or authority", async () => {
  const { reader, requests } = fixture();
  await expect(reader.read({ positionIds: [] })).rejects.toThrow("chain differs");
  await expect(
    reader.readEnclave({ generation: "original", account, targets: [] }),
  ).rejects.toThrow("chain differs");
  expect(requests()).toBe(2);
});
