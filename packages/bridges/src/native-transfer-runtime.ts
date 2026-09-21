import { createHash } from "node:crypto";
import { getNetwork } from "@mezo-dev-kit/chains";
import { getNativeTokenProfile, resolveContract } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ContractId } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue, Address } from "@mezo-dev-kit/evm";
import { NATIVE_CLIENT } from "./model.generated.ts";
import type { NATIVE_ROUTES } from "./model.generated.ts";
import type { NativeTransferErrorCode, NativeTransferTransport } from "./native-transfer-types.ts";

/** Native source workflow failure; underlying Core/EVM errors retain their own typed boundaries. */
export class NativeTransferError extends Error {
  override readonly name = "NativeTransferError";
  readonly code: NativeTransferErrorCode;
  constructor(code: NativeTransferErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
export function transferRequire(
  value: unknown,
  code: NativeTransferErrorCode,
  message: string,
): asserts value {
  if (!value) throw new NativeTransferError(code, message);
}
export type TransferEndpoint = (typeof NATIVE_ROUTES)[number]["source" | "destination"];
export const transferCodec = createAbiCodec();
export const zeroAddress = parseAddress(`0x${"0".repeat(40)}`);
export function transferAddress(value: unknown): Address {
  const address = parseAddress(value);
  transferRequire(
    address !== zeroAddress,
    "InvalidInput",
    "Native account and recipient must be nonzero",
  );
  return address;
}
export async function checkNativeClient(read: () => Promise<unknown>): Promise<void> {
  const version = await read();
  transferRequire(
    typeof version === "string" && version.startsWith(NATIVE_CLIENT.reportedVersionPrefix),
    "RuntimeMismatch",
    "Mezo reported client version is outside Native qualification",
  );
}
export async function transferAnchor(
  transport: NativeTransferTransport,
  coordinate: ReadCoordinate,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  transferRequire(
    parseUint(await transport.getChainId()) === coordinate.chainId,
    "ChainMismatch",
    "Native transport changed chain",
  );
  const block = await transport.getBlock(coordinate.blockNumber);
  transferRequire(
    block &&
      parseUint(block.number) === coordinate.blockNumber &&
      parseHash32(block.hash) === coordinate.blockHash,
    "ReorgDetected",
    "Native coordinate changed",
  );
  signal?.throwIfAborted();
}
export async function transferCoordinate(
  endpoint: TransferEndpoint,
  transport: NativeTransferTransport,
  number: bigint | undefined,
  maxAge: bigint,
  signal?: AbortSignal,
): Promise<Readonly<ReadCoordinate>> {
  signal?.throwIfAborted();
  const network = getNetwork(endpoint.networkId);
  transferRequire(
    parseUint(await transport.getChainId()) === network.evmChainId,
    "ChainMismatch",
    "Native transport chain differs",
  );
  const head = parseUint(await transport.getBlockNumber());
  const blockNumber = number === undefined ? head : parseUint(number);
  transferRequire(
    blockNumber <= head && head - blockNumber <= maxAge,
    "StaleQuote",
    "Native read is outside its block age bound",
  );
  const block = await transport.getBlock(blockNumber);
  transferRequire(
    block && parseUint(block.number) === blockNumber,
    "ReorgDetected",
    "Native block unavailable",
  );
  signal?.throwIfAborted();
  return Object.freeze({
    networkId: network.id,
    chainId: network.evmChainId,
    blockNumber,
    blockHash: parseHash32(block.hash),
  });
}
export async function transferRead(
  transport: NativeTransferTransport,
  coordinate: ReadCoordinate,
  contractId: ContractId,
  address: Address,
  abi: readonly ContractAbiEntry[],
  name: string,
  args: readonly AbiValue[] = [],
  signal?: AbortSignal,
): Promise<readonly AbiValue[]> {
  signal?.throwIfAborted();
  const entries = abi.filter((e) => e.type === "function" && e.name === name);
  const entry = entries[0];
  transferRequire(
    entries.length === 1 && entry,
    "InvalidConfiguration",
    "Native read interface unavailable or ambiguous",
  );
  try {
    const raw = await transport.read({
      ...coordinate,
      contractId,
      address,
      data: transferCodec.encodeFunction(entry, args),
    });
    signal?.throwIfAborted();
    return transferCodec.decodeFunction(entry, raw);
  } catch (cause) {
    signal?.throwIfAborted();
    throw new NativeTransferError("TransportFailure", `Native ${name} read failed`, { cause });
  }
}
export async function transferTokenRuntime(
  endpoint: TransferEndpoint,
  transport: Pick<NativeTransferTransport, "getCode" | "getStorage">,
  coordinate: ReadCoordinate,
): Promise<void> {
  const profile = getNativeTokenProfile({
    networkId: endpoint.networkId,
    tokenAddress: parseAddress(endpoint.token),
  });
  const hash = (code: unknown) =>
    createHash("sha256")
      .update(Buffer.from(parseHexData(code).slice(2), "hex"))
      .digest("hex");
  transferRequire(
    hash(await transport.getCode(profile.tokenAddress, coordinate)) === profile.addressCodeSha256,
    "RuntimeMismatch",
    "Native token runtime differs",
  );
  if (profile.implementationAddress !== null && profile.implementationSlot !== null) {
    transferRequire(
      parseHash32(
        await transport.getStorage(profile.tokenAddress, profile.implementationSlot, coordinate),
      ) === `0x${"0".repeat(24)}${profile.implementationAddress.slice(2)}`,
      "RuntimeMismatch",
      "Native token proxy implementation changed",
    );
    transferRequire(
      hash(await transport.getCode(profile.implementationAddress, coordinate)) ===
        profile.implementationCodeSha256,
      "RuntimeMismatch",
      "Native token implementation runtime differs",
    );
  }
}
export async function transferEndpoint(
  endpoint: TransferEndpoint,
  transport: NativeTransferTransport,
  coordinate: ReadCoordinate,
): Promise<ReturnType<typeof resolveContract>> {
  const contract = resolveContract({
    contractId: endpoint.contractId,
    networkId: endpoint.networkId,
    blockNumber: coordinate.blockNumber,
  });
  await verifyContractRuntime({ contract, transport, coordinate });
  await transferTokenRuntime(endpoint, transport, coordinate);
  return contract;
}
