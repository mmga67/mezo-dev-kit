import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { getNetwork } from "@mezo-dev-kit/chains";
import {
  createContractRegistry,
  getTokenInterface,
  resolveContract,
  resolveOperation,
} from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcTransport,
} from "@mezo-dev-kit/core";
import type { ExactTransaction, RpcRequest } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createNttTransferReader, createNttTransferWriter } from "../src/index.ts";
import type { NttRouteId, NttTransferQuoteInput } from "../src/index.ts";
import { NTT_ROUTES } from "../src/model.generated.ts";
import { loadKnowledgeReference } from "../../../scripts/lib/knowledge-reference.ts";
import { object, objects, values } from "../../../scripts/lib/json.ts";

const codec = createAbiCodec();
export function nttReturn(entry: ContractAbiEntry, results: readonly AbiValue[]): `0x${string}` {
  return parseHexData(
    `0x${codec.encodeFunction({ type: "function", name: "result", inputs: entry.outputs, outputs: [], stateMutability: "view" }, results).slice(10)}`,
  );
}
async function buildNttTransferFixture(routeId: NttRouteId = "wormhole-ntt-musd-mezo-to-ethereum") {
  const capture = object(
    (
      await loadKnowledgeReference(fileURLToPath(new URL("../../../", import.meta.url)), {
        moduleId: "workflows/bridges",
        resourceId: "ntt-current-2026-09-13",
      })
    ).document,
    "capture",
  );
  const route = NTT_ROUTES.find((r) => r.id === routeId);
  assert(route);
  const calls: { networkId: string; method: string; params: readonly unknown[] }[] = [];
  const sent: ExactTransaction[] = [];
  const account = parseAddress(`0x${"a".repeat(40)}`);
  const recipient = parseAddress(`0x${"b".repeat(40)}`);
  const receiptHash = parseHash32(`0x${"7".repeat(64)}`);
  const input: NttTransferQuoteInput = {
    account,
    recipient,
    refundRecipient: account,
    amount: 10n ** 18n,
    shouldQueue: false,
    maxNativeFee: 100n,
    maxSourceAgeBlocks: 2n,
    maxDestinationAgeBlocks: 2n,
  };
  function side(endpoint: (typeof NTT_ROUTES)[number]["source" | "destination"]) {
    const record = objects(capture.records, "records").find(
      (r) => r.networkId === endpoint.networkId,
    );
    assert(record);
    const blockNumber = BigInt(String(record.blockNumber));
    const blockHash = parseHash32(record.blockHash);
    const probes = objects(capture.requests, "requests").filter(
      (p) => p.networkId === endpoint.networkId,
    );
    const manager = resolveContract({
      contractId: endpoint.managerId,
      networkId: endpoint.networkId,
      blockNumber,
    });
    const transfer = resolveOperation({
      contractId: endpoint.managerId,
      networkId: endpoint.networkId,
      blockNumber,
      functionName: "transfer",
    }).functionAbi;
    const request: RpcRequest = async (input) => {
      calls.push({ networkId: endpoint.networkId, ...input });
      if (input.method === "eth_blockNumber") return toRpcQuantity(blockNumber);
      if (input.method === "eth_getBalance") return toRpcQuantity(10n ** 18n);
      if (input.method === "eth_getTransactionCount") return "0x0";
      if (input.method === "eth_getCode" && input.params[0] === account) return "0x";
      if (input.method === "eth_call") {
        const call = object(input.params[0], "call");
        if (
          call.from === account &&
          call.to === manager.address &&
          typeof call.data === "string" &&
          call.data.startsWith(
            codec
              .encodeFunction(transfer, [
                inputAmount(),
                BigInt(route!.destination.wormholeChainId),
                parseHash32(`0x${"0".repeat(24)}${recipient.slice(2)}`),
                parseHash32(`0x${"0".repeat(24)}${account.slice(2)}`),
                false,
                "0x01010101",
              ])
              .slice(0, 10),
          )
        )
          return nttReturn(transfer, [42n]);
        for (const name of ["balanceOf", "allowance"]) {
          const entry = getTokenInterface().find((e) => e.name === name);
          assert(entry);
          const args = name === "balanceOf" ? [account] : [account, manager.address];
          if (call.to === endpoint.token && call.data === codec.encodeFunction(entry, args))
            return nttReturn(entry, [10n ** 24n]);
        }
      }
      const probe = probes.find((p) => {
        if (p.method !== input.method) return false;
        const params = values(p.params, "params");
        if (input.method === "eth_getBlockByNumber")
          return parseRpcQuantity(params[0]) === blockNumber;
        if (input.method === "eth_call") {
          const expected = object(params[0], "call"),
            actual = object(input.params[0], "call");
          return expected.to === actual.to && expected.data === actual.data;
        }
        return JSON.stringify(params) === JSON.stringify(input.params);
      });
      assert(probe, `uncaptured ${endpoint.networkId} ${input.method}`);
      const response = object(probe.response, "response");
      assert.equal(response.error, undefined, "captured manager quote must not be used");
      return structuredClone(response.result);
    };
    const base = createRpcTransport({ id: endpoint.networkId, request });
    const transport = {
      ...base,
      read: vi.fn(base.read),
      getCode: vi.fn(base.getCode),
      getBlock: vi.fn(base.getBlock),
      getBlockNumber: vi.fn(base.getBlockNumber),
      getChainId: vi.fn(base.getChainId),
      getReceipt: vi.fn(base.getReceipt),
      simulate: vi.fn(base.simulate),
    };
    return { transport, blockNumber, blockHash, manager, transfer };
  }
  function inputAmount() {
    return input.amount;
  }
  const source = side(route.source),
    destination = side(route.destination);
  const config = {
    routeId,
    sourceTransport: source.transport,
    destinationTransport: destination.transport,
  };
  const reader = createNttTransferReader(config);
  function createExecution(sourceSide = true) {
    const endpoint = sourceSide ? route!.source : route!.destination;
    return createExecutionClient({
      network: getNetwork(endpoint.networkId),
      registry: createContractRegistry(),
      transport: sourceSide ? source.transport : destination.transport,
      signer: {
        getChainId: async () => getNetwork(endpoint.networkId).evmChainId,
        getAddress: async () => account,
        sendTransaction: async (call) => {
          sent.push(call);
          return receiptHash;
        },
      },
      store: createMemorySubmissionStore(),
      maxBlockAge: 2n,
      confirmations: 1n,
    });
  }
  const execution = createExecution(),
    destinationExecution = createExecution(false);
  return {
    route,
    config,
    input,
    calls,
    sent,
    source,
    destination,
    reader,
    execution,
    destinationExecution,
    writer: createNttTransferWriter({ reader, execution, sourceTransport: source.transport }),
  };
}
export function nttTransferFixture(
  routeId?: NttRouteId,
): ReturnType<typeof buildNttTransferFixture> {
  return buildNttTransferFixture(routeId);
}
