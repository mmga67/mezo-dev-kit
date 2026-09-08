import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCoreReadClient } from "@mezo-dev-kit/core";
import { describe, expect, test } from "vitest";

import { createHttpReadTransport } from "../src/http-transport.js";

const network = getNetwork("mezo-mainnet");
const blockNumber = 12_000_000n;
const blockHash: `0x${string}` = `0x${"42".repeat(32)}`;

function fixture(reply: (request: Record<string, unknown>) => unknown) {
  const calls: Record<string, unknown>[] = [];
  const fetch: typeof globalThis.fetch = (_url, options) => {
    if (typeof options?.body !== "string") throw new Error("Expected a serialized RPC body");
    const request = JSON.parse(options.body) as Record<string, unknown>;
    calls.push(request);
    return Promise.resolve(Response.json(reply(request)));
  };
  return { calls, transport: createHttpReadTransport({ url: "https://rpc.invalid", fetch }) };
}

describe("the example HTTP read boundary", () => {
  test("normalizes provider hash casing for coordinate comparisons", async () => {
    const { transport } = fixture(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: { number: "0x1", hash: `0x${"AB".repeat(32)}` },
    }));
    await expect(transport.getBlock(1n)).resolves.toEqual({
      number: 1n,
      hash: `0x${"ab".repeat(32)}`,
    });
  });

  test("classifies malformed JSON separately from transport failure", async () => {
    const fetch: typeof globalThis.fetch = () => Promise.resolve(new Response("{"));
    const transport = createHttpReadTransport({ url: "https://rpc.invalid", fetch });
    await expect(transport.getChainId()).rejects.toMatchObject({
      code: "InvalidResponse",
      method: "eth_chainId",
    });
  });

  test("composes public packages and sends the pinned hash to eth_call", async () => {
    const { calls, transport } = fixture(({ id, method }) => ({
      jsonrpc: "2.0",
      id,
      result:
        method === "eth_chainId"
          ? `0x${network.evmChainId.toString(16)}`
          : method === "eth_blockNumber"
            ? `0x${blockNumber.toString(16)}`
            : method === "eth_getBlockByNumber"
              ? { number: `0x${blockNumber.toString(16)}`, hash: blockHash }
              : "0x1234",
    }));
    const registry = createContractRegistry();
    const client = createCoreReadClient({ network, registry, transport });
    const result = await client.readCoherent({
      calls: [{ id: "token", contractId: "musd.token", data: "0x12345678" }],
    });
    expect(result.reads.token).toMatchObject({ status: "available", value: "0x1234" });
    expect(calls.map((call) => call.method)).toEqual([
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBlockByNumber",
      "eth_call",
    ]);
    expect(calls.at(-1)?.params).toEqual([
      {
        to: registry.resolve({ contractId: "musd.token", networkId: network.id, blockNumber })
          .address,
        data: "0x12345678",
      },
      { blockHash, requireCanonical: true },
    ]);
  });

  test("chain mismatch prevents contract calls", async () => {
    const { calls, transport } = fixture(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: `0x${(network.evmChainId + 1n).toString(16)}`,
    }));
    const client = createCoreReadClient({ network, registry: createContractRegistry(), transport });
    await expect(
      client.readCoherent({
        calls: [{ id: "token", contractId: "musd.token", data: "0x12345678" }],
      }),
    ).rejects.toMatchObject({ code: "ChainMismatch" });
    expect(calls.map((call) => call.method)).toEqual(["eth_chainId"]);
  });

  test.for([
    { label: "wrong response id", response: { jsonrpc: "2.0", id: 90, result: "0x1" } },
    { label: "missing result", response: { jsonrpc: "2.0", id: 1 } },
    { label: "noncanonical quantity", response: { jsonrpc: "2.0", id: 1, result: "0x00" } },
    { label: "quantity with newline", response: { jsonrpc: "2.0", id: 1, result: "0x1\n" } },
    {
      label: "both result and error",
      response: { jsonrpc: "2.0", id: 1, result: "0x1", error: { code: -1, message: "failed" } },
    },
  ])("rejects $label", async ({ response }) => {
    const { transport, calls } = fixture(() => response);
    await expect(transport.getChainId()).rejects.toMatchObject({ code: "InvalidResponse" });
    expect(calls).toHaveLength(1);
  });

  test("preserves RPC failure code without retrying or exposing provider messages", async () => {
    const { transport, calls } = fixture(({ id }) => ({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "secret endpoint credential" },
    }));
    await expect(transport.getChainId()).rejects.toMatchObject({
      code: "RpcFailure",
      rpcCode: -32602,
      message: "RpcFailure during eth_chainId (-32602)",
    });
    expect(calls).toHaveLength(1);
  });

  test("rejects odd-length call data returned by a provider", async () => {
    const { transport } = fixture(({ id }) => ({ jsonrpc: "2.0", id, result: "0x1" }));
    const contract = createContractRegistry().resolve({
      contractId: "musd.token",
      networkId: network.id,
      blockNumber,
    });
    await expect(
      transport.read({
        networkId: network.id,
        chainId: network.evmChainId,
        blockNumber,
        blockHash,
        contractId: contract.contractId,
        address: contract.address,
        data: "0x12345678",
      }),
    ).rejects.toMatchObject({ code: "InvalidResponse" });
  });

  test("bounds response size", async () => {
    const { transport } = fixture(({ id }) => ({
      jsonrpc: "2.0",
      id,
      result: "0".repeat(1_048_576),
    }));
    await expect(transport.getChainId()).rejects.toMatchObject({ code: "InvalidResponse" });
  });
});
