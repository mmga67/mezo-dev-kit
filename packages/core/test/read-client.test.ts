import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { describe, expect, test } from "vitest";

import { CoreReadError, createCoreReadClient } from "../src/index.ts";
import type { CoreReadTransport, CoreTransportReadRequest } from "../src/index.ts";

const BLOCK_NUMBER = 12_000_000n;
const BLOCK_HASH = `0x${"ab".repeat(32)}` as const;

describe("Core read client", () => {
  test("injects the transport and registry while pinning every call to one coordinate", async () => {
    const requests: CoreTransportReadRequest[] = [];
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: transport({ requests }),
    });

    const result = await client.readCoherent({
      calls: [
        { id: "rate", contractId: "musd.savings-rate", data: "0x1234" },
        { id: "token", contractId: "musd.token", data: "0xabcd" },
      ],
    });

    expect(result.coordinate).toEqual({
      networkId: "mezo-mainnet",
      chainId: 31_612n,
      blockNumber: BLOCK_NUMBER,
      blockHash: BLOCK_HASH,
    });
    expect(requests).toHaveLength(2);
    expect(requests.every(({ blockNumber }) => blockNumber === BLOCK_NUMBER)).toBe(true);
    expect(requests.every(({ blockHash }) => blockHash === BLOCK_HASH)).toBe(true);
    expect(requests.map(({ contractId }) => contractId)).toEqual([
      "musd.savings-rate",
      "musd.token",
    ]);
    expect(result.reads.rate?.status).toBe("available");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reads)).toBe(true);
  });

  test("fails before contract resolution or reads when the transport chain differs", async () => {
    let readCount = 0;
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: transport({
        chainId: 1n,
        onRead: () => {
          readCount += 1;
          return "0x";
        },
      }),
    });

    await expect(
      client.resolveContract({ contractId: "musd.token", blockNumber: BLOCK_NUMBER }),
    ).rejects.toMatchObject({
      code: "ChainMismatch",
      context: { expectedChainId: "31612", transportChainId: "1" },
    });
    expect(readCount).toBe(0);
  });

  test("rejects the whole logical result when a required read fails", async () => {
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: transport({ onRead: () => Promise.reject(new Error("RPC unavailable")) }),
    });

    await expect(
      client.readCoherent({
        calls: [{ id: "required", contractId: "musd.token", data: "0x" }],
      }),
    ).rejects.toMatchObject({
      code: "PartialReadFailure",
      retryable: true,
      context: { callId: "required", blockNumber: BLOCK_NUMBER.toString() },
    });
  });

  test("preserves an optional transport failure as typed unavailable state", async () => {
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: transport({ onRead: () => Promise.reject(new Error("offline")) }),
    });

    const result = await client.readCoherent({
      calls: [{ id: "optional", contractId: "musd.token", data: "0x", required: false }],
      blockNumber: BLOCK_NUMBER,
    });

    const optional = result.reads.optional;
    expect(optional?.status).toBe("unavailable");
    if (optional?.status !== "unavailable") throw new Error("unavailable read missing");
    expect(optional.error.code).toBe("ProviderFailure");
    expect(optional.error.retryable).toBe(true);
    expect(optional.error.context.callId).toBe("optional");
  });

  test.for([
    { label: "empty calls", calls: [] },
    {
      label: "duplicate call IDs",
      calls: [
        { id: "same", contractId: "musd.token", data: "0x" },
        { id: "same", contractId: "musd.token", data: "0x" },
      ],
    },
    { label: "odd calldata", calls: [{ id: "bad", contractId: "musd.token", data: "0x1" }] },
  ])("rejects $label before transport reads", async ({ calls }) => {
    let readCount = 0;
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: transport({
        onRead: () => {
          readCount += 1;
          return "0x";
        },
      }),
    });

    await expect(
      client.readCoherent({ calls: calls as Parameters<typeof client.readCoherent>[0]["calls"] }),
    ).rejects.toBeInstanceOf(CoreReadError);
    expect(readCount).toBe(0);
  });

  test("rejects malformed block identity from the transport", async () => {
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: transport({ blockHash: "not-a-hash" }),
    });

    await expect(client.resolveContract({ contractId: "musd.token" })).rejects.toMatchObject({
      code: "InvalidTransportResult",
      stage: "coordinate",
    });
  });

  test("rejects an unknown contract ID before calling the transport", async () => {
    let chainCalls = 0;
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: {
        ...transport(),
        getChainId: () => {
          chainCalls += 1;
          return 31_612n;
        },
      },
    });

    await expect(
      client.resolveContract({
        contractId: "unknown.contract" as Parameters<
          typeof client.resolveContract
        >[0]["contractId"],
      }),
    ).rejects.toMatchObject({ code: "InvalidReadInput", stage: "validation" });
    expect(chainCalls).toBe(0);
  });

  test("rejects an invalid explicit block before calling the transport", async () => {
    let chainCalls = 0;
    const client = createCoreReadClient({
      network: getNetwork("mezo-mainnet"),
      registry: createContractRegistry(),
      transport: {
        ...transport(),
        getChainId: () => {
          chainCalls += 1;
          return 31_612n;
        },
      },
    });

    await expect(
      client.resolveContract({ contractId: "musd.token", blockNumber: -1n }),
    ).rejects.toMatchObject({ code: "InvalidReadInput", stage: "validation" });
    expect(chainCalls).toBe(0);
  });
});

function transport({
  chainId = 31_612n,
  blockHash = BLOCK_HASH,
  requests = [],
  onRead = () => "0x01",
}: {
  readonly chainId?: unknown;
  readonly blockHash?: unknown;
  readonly requests?: CoreTransportReadRequest[];
  readonly onRead?: (request: Readonly<CoreTransportReadRequest>) => unknown;
} = {}): CoreReadTransport {
  return {
    id: "fake",
    getChainId: () => chainId,
    getBlockNumber: () => BLOCK_NUMBER,
    getBlock: (number) => ({ number, hash: blockHash }),
    read: (request) => {
      requests.push(request);
      return onRead(request);
    },
  };
}
