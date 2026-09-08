import { expect, test } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport, verifyContractRuntime } from "../src/index.ts";
const blockNumber = 11703359n,
  blockHash = `0x${"ab".repeat(32)}` as const;
const coordinate = { networkId: "mezo-mainnet" as const, chainId: 31612n, blockNumber, blockHash };
const contract = createContractRegistry().resolve({
  contractId: "musd.savings-rate",
  networkId: coordinate.networkId,
  blockNumber,
});
test("a forged resolved address cannot borrow another deployment's runtime identity", async () => {
  const transport = createRpcTransport({
    id: "unreachable",
    request: async () => {
      throw new Error("must reject before RPC");
    },
  });
  await expect(
    verifyContractRuntime({
      contract: { ...contract, address: `0x${"11".repeat(20)}` },
      transport,
      coordinate,
    }),
  ).rejects.toMatchObject({ code: "InvalidExecutionInput" });
});
test("runtime checks reject a provider chain change before fetching code", async () => {
  const methods: string[] = [];
  const transport = createRpcTransport({
    id: "wrong-chain",
    request: async ({ method }) => {
      methods.push(method);
      if (method === "eth_chainId") return "0x1";
      throw new Error("unexpected read");
    },
  });
  await expect(verifyContractRuntime({ contract, transport, coordinate })).rejects.toMatchObject({
    code: "InvalidExecutionInput",
  });
  expect(methods).toEqual(["eth_chainId"]);
});
