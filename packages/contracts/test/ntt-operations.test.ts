import { expect, test } from "vitest";
import { resolveOperation, resolveRuntimeIdentity } from "../src/index.ts";

test.for(["mezo-mainnet", "ethereum-mainnet", "base-mainnet"] as const)(
  "projects ordinary NTT calls and runtime on %s",
  (networkId) => {
    const input = {
      contractId: "bridge.musd-ntt-manager" as const,
      networkId,
      blockNumber: 99_999_990n,
    };
    const transfer = resolveOperation({ ...input, functionName: "transfer" });
    expect(transfer.functionAbi.inputs).toHaveLength(6);
    expect(resolveRuntimeIdentity(input).implementationSlot).not.toBeNull();
    for (const functionName of [
      "completeOutboundQueuedTransfer",
      "cancelOutboundQueuedTransfer",
      "completeInboundQueuedTransfer",
      "executeMsg",
    ])
      expect(resolveOperation({ ...input, functionName }).functionAbi.name).toBe(functionName);
    expect(
      resolveOperation({
        ...input,
        contractId: "bridge.musd-wormhole-transceiver",
        functionName: "receiveMessage",
      }).functionAbi.stateMutability,
    ).toBe("nonpayable");
    for (const functionName of ["setPeer", "setThreshold", "upgrade", "attestationReceived"])
      expect(() => resolveOperation({ ...input, functionName })).toThrow(
        expect.objectContaining({ code: "AbiUnavailable" }),
      );
    expect(() =>
      resolveOperation({
        ...input,
        functionName: "transfer",
        inputTypes: ["uint256", "uint16", "bytes32"],
      }),
    ).toThrow(expect.objectContaining({ code: "AbiUnavailable" }));
    expect(() =>
      resolveOperation({
        ...input,
        contractId: "bridge.musd-wormhole-transceiver",
        functionName: "receiveWormholeMessages",
      }),
    ).toThrow(expect.objectContaining({ code: "AbiUnavailable" }));
  },
);
