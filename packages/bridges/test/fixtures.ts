import assert from "node:assert/strict";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { NetworkId } from "@mezo-dev-kit/chains";
import { resolveContract, resolveEvent } from "@mezo-dev-kit/contracts";
import { createNttDeliveryObserver } from "@mezo-dev-kit/bridges";
import type {
  NttDeliveryObserver,
  NttObservationTransport,
  NttObserveInput,
  NttObserverConfig,
  NttReceiptAnchor,
  NttRouteId,
} from "@mezo-dev-kit/bridges";
import {
  createAbiCodec,
  keccak256,
  parseHash32,
  parseHexData,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { AbiValue, Hash32, HexData } from "@mezo-dev-kit/evm";
import { vi } from "vitest";
import type { Mock } from "vitest";
import { NTT_ROUTES } from "../src/model.generated.ts";

interface TestLog {
  address: string;
  topics: Hash32[];
  data: string;
  transactionHash: Hash32;
  blockHash: Hash32;
  blockNumber: string;
  logIndex: string;
  removed: boolean;
}
interface TestReceipt {
  transactionHash: Hash32;
  blockHash: Hash32;
  blockNumber: string;
  status: string;
  logs: unknown[];
}
interface TestTransport {
  receipts: Map<Hash32, unknown>;
  port: {
    getChainId: Mock<() => Promise<bigint>>;
    getBlockNumber: Mock<() => Promise<bigint>>;
    getBlock: Mock<(number: bigint) => Promise<{ number: bigint; hash: Hash32 }>>;
    getReceipt: Mock<(hash: Hash32) => Promise<unknown>>;
  };
}
interface BridgeFixture {
  route: (typeof NTT_ROUTES)[number];
  source: TestTransport;
  destination: TestTransport;
  digest: Hash32;
  send: TestLog;
  redeem: TestLog;
  sendValues: (payload?: HexData) => readonly AbiValue[];
  config: NttObserverConfig;
  input: NttObserveInput;
  observer: NttDeliveryObserver;
  anchor: (hash: Hash32) => NttReceiptAnchor;
}

export const hash = (digit: string): Hash32 => parseHash32(`0x${digit.repeat(64)}`);
export const sourceHash = hash("1"),
  destinationHash = hash("2"),
  otherHash = hash("3");
const codec = createAbiCodec();
export const blockNumber = 99_999_990n;
export const envelope = parseHexData(
  `0x${"0".repeat(63)}1${"0".repeat(24)}${"4".repeat(40)}0001ff`,
);
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function parameterType(value: unknown): string {
  const p = object(value);
  assert.equal(typeof p.type, "string");
  if (p.type !== "tuple") return String(p.type);
  assert(Array.isArray(p.components));
  return `(${p.components.map(parameterType).join(",")})`;
}
export function event(
  networkId: NetworkId,
  name: string,
  values: readonly AbiValue[],
  tx: Hash32,
  index = 0,
): TestLog {
  const contractId =
    name === "SendTransceiverMessage"
      ? "bridge.musd-wormhole-transceiver"
      : "bridge.musd-ntt-manager";
  const resolved = resolveContract({ contractId, networkId, blockNumber });
  const abi = resolveEvent({ contractId, networkId, blockNumber, eventName: name });
  assert(Array.isArray(abi.inputs));
  const inputs = abi.inputs.map(object);
  const topics = [
    keccak256(
      `0x${Buffer.from(`${name}(${inputs.map(parameterType).join(",")})`).toString("hex")}`,
    ),
  ];
  const nonIndexed: Record<string, unknown>[] = [],
    data: AbiValue[] = [];
  for (const [i, input] of inputs.entries()) {
    const value = values[i];
    assert.notEqual(value, undefined);
    if (value === undefined) throw new Error("missing test value");
    if (input.indexed) {
      const encoded = codec.encodeFunction(
        {
          type: "function",
          name: "fixture",
          stateMutability: "pure",
          inputs: [input],
          outputs: [],
        },
        [value],
      );
      topics.push(parseHash32(`0x${encoded.slice(10)}`));
    } else {
      nonIndexed.push(input);
      data.push(value);
    }
  }
  const encoded = codec.encodeFunction(
    { type: "function", name: "fixture", stateMutability: "pure", inputs: nonIndexed, outputs: [] },
    data,
  );
  return {
    address: resolved.address,
    topics,
    data: `0x${encoded.slice(10)}`,
    transactionHash: tx,
    blockHash: hash("a"),
    blockNumber: toRpcQuantity(blockNumber),
    logIndex: toRpcQuantity(BigInt(index)),
    removed: false,
  };
}
export function receipt(tx: Hash32, logs: readonly unknown[] = [], status = "0x1"): TestReceipt {
  return {
    transactionHash: tx,
    blockHash: hash("a"),
    blockNumber: toRpcQuantity(blockNumber),
    status,
    logs: [...logs],
  };
}
export function transport(networkId: NetworkId): TestTransport {
  const receipts = new Map<Hash32, unknown>();
  const port = {
    getChainId: vi.fn(async () => getNetwork(networkId).evmChainId),
    getBlockNumber: vi.fn(async () => blockNumber + 10n),
    getBlock: vi.fn(async (number: bigint) => ({ number, hash: hash("a") })),
    getReceipt: vi.fn(async (tx: Hash32): Promise<unknown> => receipts.get(tx) ?? null),
  } satisfies NttObservationTransport;
  return { port, receipts };
}
export function fixture(routeId: NttRouteId = "wormhole-ntt-musd-mezo-to-ethereum"): BridgeFixture {
  const route = NTT_ROUTES.find((r) => r.id === routeId);
  assert(route);
  const source = transport(route.source.networkId),
    destination = transport(route.destination.networkId);
  const manager = (networkId: NetworkId) =>
    parseHash32(
      `0x${resolveContract({ contractId: "bridge.musd-ntt-manager", networkId, blockNumber }).address.slice(2).padStart(64, "0")}`,
    );
  const digest = keccak256(
    `0x${route.source.wormholeChainId.toString(16).padStart(4, "0")}${envelope.slice(2)}`,
  );
  const sendValues = (payload: HexData = envelope): readonly AbiValue[] => [
    BigInt(route.destination.wormholeChainId),
    [manager(route.source.networkId), manager(route.destination.networkId), payload, "0x"],
  ];
  const send = event(route.source.networkId, "SendTransceiverMessage", sendValues(), sourceHash);
  const redeem = event(route.destination.networkId, "TransferRedeemed", [digest], destinationHash);
  source.receipts.set(sourceHash, receipt(sourceHash, [send]));
  destination.receipts.set(destinationHash, receipt(destinationHash, [redeem]));
  const config = {
    routeId,
    sourceTransport: source.port,
    destinationTransport: destination.port,
    sourceConfirmations: 2n,
    destinationConfirmations: 2n,
  };
  const input = {
    sourceTransactionHash: sourceHash,
    destinationTransactionHashes: [destinationHash],
  };
  const observer = createNttDeliveryObserver(config);
  const anchor = (transactionHash: Hash32): NttReceiptAnchor => ({
    transactionHash,
    blockHash: hash("a"),
    blockNumber,
  });
  return {
    route,
    source,
    destination,
    digest,
    send,
    redeem,
    sendValues,
    config,
    input,
    observer,
    anchor,
  };
}
