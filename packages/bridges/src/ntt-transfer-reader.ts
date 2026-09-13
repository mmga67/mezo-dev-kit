import { createHash } from "node:crypto";
import { getNetwork } from "@mezo-dev-kit/chains";
import { getTokenInterface, resolveContract } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ContractId } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ExecutionTargetResolver, ReadCoordinate } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue, Address, Hash32 } from "@mezo-dev-kit/evm";
import { NTT_ROUTES } from "./model.generated.ts";
import type {
  NttEndpointSnapshot,
  NttTransferErrorCode,
  NttTransferReader,
  NttTransferReaderConfig,
  NttTransferTransport,
} from "./ntt-transfer-types.ts";

export class NttTransferError extends Error {
  override readonly name = "NttTransferError";
  readonly code: NttTransferErrorCode;
  constructor(code: NttTransferErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}
export function nttRequire(
  condition: unknown,
  code: NttTransferErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new NttTransferError(code, message);
}
export function nttAddress(value: unknown): Address {
  const result = parseAddress(value);
  nttRequire(
    result !== `0x${"0".repeat(40)}`,
    "InvalidInput",
    "zero address is not an NTT recipient or account",
  );
  return result;
}
export function wormholeAddress(address: Address): Hash32 {
  return parseHash32(`0x${"0".repeat(24)}${address.slice(2)}`);
}
function array(value: unknown, length?: number): readonly unknown[] {
  nttRequire(
    Array.isArray(value) && (length === undefined || value.length === length),
    "InvalidConfiguration",
    "unexpected NTT array shape",
  );
  return value;
}
function bool(value: unknown): boolean {
  nttRequire(typeof value === "boolean", "InvalidConfiguration", "expected NTT boolean");
  return value;
}
export function nttTrimAmount(
  amount: bigint,
  sourceDecimals: number,
  destinationDecimals: number,
): Readonly<{
  trimmedAmount: bigint;
  trimmedDecimals: number;
  packedAmount: bigint;
  destinationAmount: bigint;
}> {
  parseUint(amount);
  nttRequire(
    Number.isInteger(sourceDecimals) &&
      Number.isInteger(destinationDecimals) &&
      sourceDecimals >= 0 &&
      sourceDecimals <= 77 &&
      destinationDecimals >= 0 &&
      destinationDecimals <= 77 &&
      amount > 0n,
    "InvalidInput",
    "positive amount and bounded decimal precisions required",
  );
  const decimals = Math.min(8, sourceDecimals, destinationDecimals);
  const divisor = 10n ** BigInt(sourceDecimals - decimals);
  nttRequire(amount % divisor === 0n, "AmountHasDust", "NTT rejects amounts with trimming dust");
  const trimmed = parseUint(amount / divisor, 64);
  const destinationAmount = parseUint(trimmed * 10n ** BigInt(destinationDecimals - decimals));
  return Object.freeze({
    trimmedAmount: trimmed,
    trimmedDecimals: decimals,
    packedAmount: (trimmed << 8n) | BigInt(decimals),
    destinationAmount,
  });
}
const codec = createAbiCodec();
/** Verify only the source token role required by Core's separate approval transaction. */
export function createNttTokenTargetResolver(
  config: Pick<NttTransferReaderConfig, "routeId" | "sourceTransport">,
): ExecutionTargetResolver {
  const route = NTT_ROUTES.find((r) => r.id === config.routeId);
  nttRequire(route, "UnknownRoute", "unknown NTT token approval route");
  const endpoint = route.source,
    transport = config.sourceTransport;
  return async ({ contractId, role, coordinate }) => {
    nttRequire(
      contractId === endpoint.managerId &&
        role === "ntt-source-token" &&
        coordinate.networkId === endpoint.networkId,
      "InvalidInput",
      "NTT source token role or network differs",
    );
    const contract = resolveContract({
      contractId,
      networkId: endpoint.networkId,
      blockNumber: coordinate.blockNumber,
    });
    await verifyContractRuntime({ contract, transport, coordinate });
    const token = parseAddress(
      (
        await nttRead(
          transport,
          coordinate,
          contractId,
          parseAddress(contract.address),
          contract.readAbi,
          "token",
        )
      )[0],
    );
    nttRequire(
      token === parseAddress(endpoint.token),
      "InvalidConfiguration",
      "NTT approval token differs from representation",
    );
    const code = parseHexData(await transport.getCode(token, coordinate));
    nttRequire(
      createHash("sha256")
        .update(Buffer.from(code.slice(2), "hex"))
        .digest("hex") === endpoint.tokenCodeSha256,
      "RuntimeMismatch",
      "NTT approval token runtime differs",
    );
    await nttCheckAnchor(transport, coordinate);
    return token;
  };
}
export async function nttRead(
  transport: NttTransferTransport,
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
  nttRequire(
    entries.length === 1 && entries[0],
    "InvalidConfiguration",
    "NTT read interface is missing or ambiguous",
  );
  try {
    const raw = await transport.read({
      ...coordinate,
      contractId,
      address,
      data: codec.encodeFunction(entries[0], args),
    });
    signal?.throwIfAborted();
    return codec.decodeFunction(entries[0], raw);
  } catch (cause) {
    signal?.throwIfAborted();
    throw new NttTransferError("TransportFailure", `NTT ${name} read failed`, { cause });
  }
}
type Endpoint = (typeof NTT_ROUTES)[number]["source" | "destination"];
export async function nttCoordinate(
  endpoint: Endpoint,
  transport: NttTransferTransport,
  number: bigint | undefined,
  maxAge: bigint,
  signal?: AbortSignal,
): Promise<Readonly<ReadCoordinate>> {
  signal?.throwIfAborted();
  const network = getNetwork(endpoint.networkId);
  nttRequire(
    parseUint(await transport.getChainId()) === network.evmChainId,
    "ChainMismatch",
    "NTT transport network differs",
  );
  signal?.throwIfAborted();
  const head = parseUint(await transport.getBlockNumber());
  const blockNumber = number === undefined ? head : parseUint(number);
  nttRequire(
    head >= blockNumber && head - blockNumber <= maxAge,
    "StaleQuote",
    "NTT read block is outside the age bound",
  );
  signal?.throwIfAborted();
  const block = await transport.getBlock(blockNumber);
  nttRequire(
    block && parseUint(block.number) === blockNumber,
    "ReorgDetected",
    "NTT read block unavailable",
  );
  return Object.freeze({
    networkId: network.id,
    chainId: network.evmChainId,
    blockNumber,
    blockHash: parseHash32(block.hash),
  });
}
export async function nttCheckAnchor(
  transport: NttTransferTransport,
  coordinate: ReadCoordinate,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  nttRequire(
    parseUint(await transport.getChainId()) === coordinate.chainId,
    "ChainMismatch",
    "NTT transport changed network",
  );
  signal?.throwIfAborted();
  const block = await transport.getBlock(coordinate.blockNumber);
  nttRequire(
    block &&
      parseUint(block.number) === coordinate.blockNumber &&
      parseHash32(block.hash) === coordinate.blockHash,
    "ReorgDetected",
    "NTT read block changed",
  );
}
export async function nttTokenRuntime(
  transport: NttTransferTransport,
  coordinate: ReadCoordinate,
  endpoint: (typeof NTT_ROUTES)[number]["source"],
): Promise<void> {
  const code = parseHexData(await transport.getCode(parseAddress(endpoint.token), coordinate));
  nttRequire(
    createHash("sha256")
      .update(Buffer.from(code.slice(2), "hex"))
      .digest("hex") === endpoint.tokenCodeSha256,
    "RuntimeMismatch",
    "NTT token runtime differs",
  );
}
export async function nttEndpoint(
  endpoint: Endpoint,
  peer: Endpoint,
  transport: NttTransferTransport,
  coordinate: ReadCoordinate,
  signal?: AbortSignal,
): Promise<Readonly<NttEndpointSnapshot>> {
  signal?.throwIfAborted();
  const manager = resolveContract({
    contractId: endpoint.managerId,
    networkId: endpoint.networkId,
    blockNumber: coordinate.blockNumber,
  });
  const transceiver = resolveContract({
    contractId: endpoint.transceiverId,
    networkId: endpoint.networkId,
    blockNumber: coordinate.blockNumber,
  });
  // Both remote identities must resolve at that remote chain's own coordinate (checked by the caller).
  const token = parseAddress(endpoint.token);
  for (const contract of [manager, transceiver]) {
    signal?.throwIfAborted();
    try {
      await verifyContractRuntime({ transport, contract, coordinate });
    } catch (cause) {
      signal?.throwIfAborted();
      throw new NttTransferError("RuntimeMismatch", "NTT registered runtime differs", { cause });
    }
  }
  signal?.throwIfAborted();
  const tokenCode = parseHexData(await transport.getCode(token, coordinate));
  nttRequire(
    createHash("sha256")
      .update(Buffer.from(tokenCode.slice(2), "hex"))
      .digest("hex") === endpoint.tokenCodeSha256,
    "RuntimeMismatch",
    "NTT token runtime differs from the captured representation",
  );
  const m = async (name: string, args: readonly AbiValue[] = []) =>
    nttRead(
      transport,
      coordinate,
      endpoint.managerId,
      parseAddress(manager.address),
      manager.readAbi,
      name,
      args,
      signal,
    );
  const t = async (name: string, args: readonly AbiValue[] = []) =>
    nttRead(
      transport,
      coordinate,
      endpoint.transceiverId,
      parseAddress(transceiver.address),
      transceiver.readAbi,
      name,
      args,
      signal,
    );
  nttRequire(
    parseAddress((await m("token"))[0]) === token &&
      parseUint((await m("mode"))[0], 8) === BigInt(endpoint.mode) &&
      parseUint((await m("chainId"))[0], 16) === BigInt(endpoint.wormholeChainId),
    "InvalidConfiguration",
    "NTT token, mode or Wormhole chain differs",
  );
  nttRequire(
    parseUint((await m("tokenDecimals"))[0], 8) === BigInt(endpoint.decimals) &&
      parseUint(
        (
          await nttRead(
            transport,
            coordinate,
            endpoint.managerId,
            token,
            getTokenInterface(),
            "decimals",
            [],
            signal,
          )
        )[0],
        8,
      ) === BigInt(endpoint.decimals),
    "InvalidConfiguration",
    "NTT token decimals differ",
  );
  nttRequire(
    parseUint((await m("getThreshold"))[0], 8) === 1n,
    "InvalidConfiguration",
    "NTT profile requires exactly one attesting transceiver",
  );
  const enabled = array((await m("getTransceivers"))[0], 1);
  const info = array(array((await m("getTransceiverInfo"))[0], 1)[0], 3);
  nttRequire(
    parseAddress(enabled[0]) === transceiver.address && bool(info[0]) && bool(info[1]),
    "InvalidConfiguration",
    "NTT enabled transceiver differs",
  );
  const transceiverIndex = parseUint(info[2], 8);
  nttRequire(
    parseAddress((await t("nttManager"))[0]) === manager.address &&
      parseAddress((await t("getNttManagerToken"))[0]) === token,
    "InvalidConfiguration",
    "NTT transceiver manager/token binding differs",
  );
  const remote = array((await m("getPeer", [BigInt(peer.wormholeChainId)]))[0], 2);
  nttRequire(
    parseUint(remote[1], 8) === BigInt(peer.decimals),
    "InvalidConfiguration",
    "NTT peer decimals differ",
  );
  const snapshot = Object.freeze({
    coordinate,
    timestamp: parseUint(await transport.getBlockTimestamp(coordinate)),
    manager: parseAddress(manager.address),
    transceiver: parseAddress(transceiver.address),
    token,
    decimals: endpoint.decimals,
    mode: endpoint.mode === 0 ? ("locking" as const) : ("burning" as const),
    managerPaused: bool((await m("isPaused"))[0]),
    transceiverPaused: bool((await t("isPaused"))[0]),
    transceiverIndex,
    outboundCapacity: parseUint((await m("getCurrentOutboundCapacity"))[0]),
    inboundCapacity: parseUint(
      (await m("getCurrentInboundCapacity", [BigInt(peer.wormholeChainId)]))[0],
    ),
    rateLimitDuration: parseUint((await m("rateLimitDuration"))[0], 64),
    nextSequence: parseUint((await m("nextMessageSequence"))[0], 64),
    standardRelayingEnabled: bool(
      (await t("isWormholeRelayingEnabled", [BigInt(peer.wormholeChainId)]))[0],
    ),
    specialRelayingEnabled: bool(
      (await t("isSpecialRelayingEnabled", [BigInt(peer.wormholeChainId)]))[0],
    ),
    wormholeEvmChain: bool((await t("isWormholeEvmChain", [BigInt(peer.wormholeChainId)]))[0]),
  });
  return snapshot;
}
export function createNttTransferReader(
  config: NttTransferReaderConfig,
): Readonly<NttTransferReader> {
  const route = NTT_ROUTES.find((r) => r.id === config.routeId);
  nttRequire(route, "UnknownRoute", "unknown MUSD NTT route");
  const { sourceTransport, destinationTransport } = config;
  return Object.freeze<NttTransferReader>({
    async quote(input) {
      const account = nttAddress(input.account),
        recipient = nttAddress(input.recipient),
        refundRecipient = nttAddress(input.refundRecipient);
      const amount = parseUint(input.amount),
        maxNativeFee = parseUint(input.maxNativeFee),
        maxSourceAgeBlocks = parseUint(input.maxSourceAgeBlocks),
        maxDestinationAgeBlocks = parseUint(input.maxDestinationAgeBlocks),
        shouldQueue = input.shouldQueue;
      nttRequire(
        typeof shouldQueue === "boolean",
        "InvalidInput",
        "explicit outbound queue consent required",
      );
      const trimmed = nttTrimAmount(amount, route.source.decimals, route.destination.decimals);
      const sourceNumber =
          input.sourceBlockNumber === undefined ? undefined : parseUint(input.sourceBlockNumber),
        destinationNumber =
          input.destinationBlockNumber === undefined
            ? undefined
            : parseUint(input.destinationBlockNumber),
        signal = input.signal;
      const sourceCoordinate = await nttCoordinate(
        route.source,
        sourceTransport,
        sourceNumber,
        maxSourceAgeBlocks,
        signal,
      );
      const destinationCoordinate = await nttCoordinate(
        route.destination,
        destinationTransport,
        destinationNumber,
        maxDestinationAgeBlocks,
        signal,
      );
      const source = await nttEndpoint(
        route.source,
        route.destination,
        sourceTransport,
        sourceCoordinate,
        signal,
      );
      const destination = await nttEndpoint(
        route.destination,
        route.source,
        destinationTransport,
        destinationCoordinate,
        signal,
      );
      for (const [endpoint, remote, transport, side, other] of [
        [route.source, route.destination, sourceTransport, source, destination],
        [route.destination, route.source, destinationTransport, destination, source],
      ] as const) {
        const manager = resolveContract({
          contractId: endpoint.managerId,
          networkId: endpoint.networkId,
          blockNumber: side.coordinate.blockNumber,
        });
        const transceiver = resolveContract({
          contractId: endpoint.transceiverId,
          networkId: endpoint.networkId,
          blockNumber: side.coordinate.blockNumber,
        });
        const peer = array(
          (
            await nttRead(
              transport,
              side.coordinate,
              endpoint.managerId,
              side.manager,
              manager.readAbi,
              "getPeer",
              [BigInt(remote.wormholeChainId)],
              signal,
            )
          )[0],
          2,
        );
        const peerTransceiver = (
          await nttRead(
            transport,
            side.coordinate,
            endpoint.transceiverId,
            side.transceiver,
            transceiver.readAbi,
            "getWormholePeer",
            [BigInt(remote.wormholeChainId)],
            signal,
          )
        )[0];
        nttRequire(
          parseHash32(peer[0]) === wormholeAddress(other.manager) &&
            parseHash32(peerTransceiver) === wormholeAddress(other.transceiver),
          "InvalidConfiguration",
          "NTT peer manager/transceiver differs",
        );
      }
      nttRequire(
        ![source.manager, source.transceiver, source.token].includes(account) &&
          ![destination.manager, destination.transceiver, destination.token].includes(recipient),
        "InvalidInput",
        "NTT account or recipient conflicts with route custody",
      );
      const instructions = parseHexData(
        `0x01${source.transceiverIndex.toString(16).padStart(2, "0")}0101`,
      );
      const transceiver = resolveContract({
        contractId: route.source.transceiverId,
        networkId: route.source.networkId,
        blockNumber: sourceCoordinate.blockNumber,
      });
      // The view manager quote uses the enabled count; _prepareForTransfer uses registered count.
      // Reproduce the latter's sole enabled transceiver quote with explicit manual instruction.
      const nativeFee = parseUint(
        (
          await nttRead(
            sourceTransport,
            sourceCoordinate,
            route.source.transceiverId,
            source.transceiver,
            transceiver.readAbi,
            "quoteDeliveryPrice",
            [BigInt(route.destination.wormholeChainId), [source.transceiverIndex, "0x01"]],
            signal,
          )
        )[0],
      );
      const tokenBalance = parseUint(
        (
          await nttRead(
            sourceTransport,
            sourceCoordinate,
            route.source.managerId,
            source.token,
            getTokenInterface(),
            "balanceOf",
            [account],
            signal,
          )
        )[0],
      );
      const allowance = parseUint(
        (
          await nttRead(
            sourceTransport,
            sourceCoordinate,
            route.source.managerId,
            source.token,
            getTokenInterface(),
            "allowance",
            [account, source.manager],
            signal,
          )
        )[0],
      );
      signal?.throwIfAborted();
      const nativeBalance = parseUint(await sourceTransport.getBalance(account, sourceCoordinate));
      await nttCoordinate(
        route.source,
        sourceTransport,
        sourceCoordinate.blockNumber,
        maxSourceAgeBlocks,
        signal,
      );
      await nttCoordinate(
        route.destination,
        destinationTransport,
        destinationCoordinate.blockNumber,
        maxDestinationAgeBlocks,
        signal,
      );
      await nttCheckAnchor(sourceTransport, sourceCoordinate, signal);
      await nttCheckAnchor(destinationTransport, destinationCoordinate, signal);
      return Object.freeze({
        routeId: route.id,
        account,
        recipient,
        refundRecipient,
        amount,
        ...trimmed,
        shouldQueue,
        source,
        destination,
        relayMode: "manual" as const,
        instructions,
        nativeFee,
        maxNativeFee,
        nativeBalance,
        tokenBalance,
        allowance,
        sourceWouldQueue: amount > source.outboundCapacity,
        destinationWouldQueue: trimmed.destinationAmount > destination.inboundCapacity,
        maxSourceAgeBlocks,
        maxDestinationAgeBlocks,
      });
    },
  });
}
