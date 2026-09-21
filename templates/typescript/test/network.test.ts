import { expect, test } from "vitest";
import { getNetwork } from "@mezo-dev-kit/chains";
import { checkNetwork } from "../src/network.ts";

test("checks provider identity and rejects a mismatched chain before reads", async () => {
  const network = getNetwork("mezo-testnet");
  const unused = (): never => {
    throw new Error("Unexpected read");
  };
  const transport = {
    id: "synthetic-test",
    getChainId: () => network.evmChainId,
    getBlockNumber: unused,
    getBlock: unused,
    read: unused,
  };
  await expect(checkNetwork(network.id, transport)).resolves.toEqual({
    networkId: network.id,
    expectedChainId: network.evmChainId,
    transportChainId: network.evmChainId,
  });
  await expect(
    checkNetwork(network.id, { ...transport, getChainId: () => network.evmChainId + 1n }),
  ).rejects.toMatchObject({ code: "ChainMismatch" });
});
