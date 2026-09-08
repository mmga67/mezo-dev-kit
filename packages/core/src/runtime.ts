import { createHash } from "node:crypto";
import { getNetwork } from "@mezo-dev-kit/chains";
import { resolveContract, resolveRuntimeIdentity } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { parseAddress, parseHash32, parseHexData, parseUint } from "@mezo-dev-kit/evm";
import type { RpcTransport } from "./rpc.ts";
import type { ReadCoordinate } from "./read-client.ts";
import { ExecutionError } from "./execution.ts";

/** Verify canonical address and implementation code at an explicit read coordinate. */
export async function verifyContractRuntime(input: {
  readonly contract: ResolvedContract;
  readonly transport: RpcTransport;
  readonly coordinate: ReadCoordinate;
}): Promise<void> {
  const { contract, transport, coordinate } = input;
  if (
    contract.networkId !== coordinate.networkId ||
    contract.blockNumber !== coordinate.blockNumber
  )
    throw new ExecutionError("InvalidExecutionInput", "runtime coordinate differs from resolution");
  const canonical = resolveContract({
    contractId: contract.contractId,
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  });
  if (
    contract.address !== canonical.address ||
    contract.implementationAddress !== canonical.implementationAddress ||
    parseUint(coordinate.chainId) !== getNetwork(coordinate.networkId).evmChainId ||
    parseUint(await transport.getChainId()) !== coordinate.chainId
  )
    throw new ExecutionError(
      "InvalidExecutionInput",
      "runtime destination or chain differs from registry",
    );
  const identity = resolveRuntimeIdentity({
    contractId: contract.contractId,
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  });
  const hash = (value: unknown) =>
    createHash("sha256")
      .update(Buffer.from(parseHexData(value).slice(2), "hex"))
      .digest("hex");
  if (hash(await transport.getCode(contract.address, coordinate)) !== identity.addressCodeSha256)
    throw new ExecutionError(
      "InvalidTransaction",
      "contract runtime differs from canonical generation",
    );
  if (identity.implementationSlot !== null) {
    const slot = parseHash32(
      await transport.getStorage(contract.address, identity.implementationSlot, coordinate),
    );
    if (
      !slot.startsWith(`0x${"0".repeat(24)}`) ||
      contract.implementationAddress === null ||
      parseAddress(`0x${slot.slice(-40)}`) !== contract.implementationAddress ||
      hash(await transport.getCode(contract.implementationAddress, coordinate)) !==
        identity.implementationCodeSha256
    )
      throw new ExecutionError(
        "InvalidTransaction",
        "proxy implementation differs from canonical generation",
      );
  }
}
