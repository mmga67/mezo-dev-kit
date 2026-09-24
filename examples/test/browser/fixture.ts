import { createAbiCodec, parseUint, parseUnitsExact, sha256 } from "@mezo-dev-kit/evm";
import { createContractRegistry, getTokenInterface } from "@mezo-dev-kit/contracts";
import {
  createEventScanner,
  createRpcTransport,
  ExecutionError,
  verifyContractRuntime,
} from "@mezo-dev-kit/core";
import { calculateSavingsYield } from "@mezo-dev-kit/musd-savings";

/** Offline browser integration: deterministic requests, no network or wallet. */
export async function runBrowserVerification(): Promise<
  Readonly<{
    noNodeGlobals: boolean;
    byteDigest: string;
    utf8Digest: string;
    amount: string;
    chain: string;
    abiRoundTrip: string;
    savings: string;
    queryId: string;
    resumedThrough: string | undefined;
    scanStatus: string;
    wrongRuntimeRejected: boolean;
  }>
> {
  const registry = createContractRegistry();
  // Same retained coordinate and old checkpoint identity as Core's regression fixture.
  const base = 11703359n;
  const blockHash = (number: bigint) => `0x${number.toString(16).padStart(64, "0")}`;
  const request = async (input: {
    readonly method: string;
    readonly params: readonly unknown[];
  }) => {
    if (input.method === "eth_chainId") return "0x7b7c";
    if (input.method === "eth_blockNumber") return `0x${(base + 10n).toString(16)}`;
    if (input.method === "eth_getLogs") return [];
    if (input.method === "eth_getBlockByNumber") {
      const number = input.params[0];
      if (typeof number !== "string") throw new Error("Fixture expected a block quantity");
      return {
        number,
        hash: blockHash(BigInt(number)),
        parentHash: blockHash(BigInt(number) - 1n),
        timestamp: "0x3e8",
      };
    }
    throw new Error(`Unexpected fixture request: ${input.method}`);
  };
  const transport = createRpcTransport({ id: "browser-fixture", request });
  const scanner = createEventScanner({
    networkId: "mezo-mainnet",
    registry,
    request,
    providerId: "browser-fixture",
    capabilityEvidenceId: "synthetic",
    policy: {
      blocksPerPage: 2,
      maxPages: 3,
      maxLogsPerPage: 10,
      maxLogDataBytes: 256,
      overlapBlocks: 2,
      confirmations: 1n,
      requestTimeoutMs: 1000,
    },
  });
  const scanned = await scanner.scan({
    contractId: "musd.token",
    fromBlock: base,
    toBlock: base + 3n,
    topics: [`0x${"9".padStart(64, "0")}`],
    observedAt: 1000n,
    maxHeadAgeSeconds: 5n,
    checkpoint: {
      schemaVersion: 1,
      queryId: "01a2c8f9da8f59fdf7c310e7faf4f67a855c65f580412f0f6d809a5347eb614b",
      fromBlock: base.toString(),
      throughBlock: (base + 1n).toString(),
      anchors: [base, base + 1n].map((number) => ({
        blockNumber: number.toString(),
        blockHash: blockHash(number),
      })),
    },
  });
  const contract = registry.resolve({
    networkId: "mezo-mainnet",
    contractId: "musd.token",
    blockNumber: base,
  });
  let wrongRuntimeRejected = false;
  try {
    await verifyContractRuntime({
      contract,
      coordinate: {
        networkId: "mezo-mainnet",
        chainId: 31612n,
        blockNumber: base,
        blockHash: `0x${"11".repeat(32)}`,
      },
      transport: {
        getChainId: async () => 31612n,
        getCode: async () => "0x00",
        getStorage: async () => {
          throw new Error("Wrong code must fail before storage");
        },
      },
    });
  } catch (error) {
    if (!(error instanceof ExecutionError) || error.code !== "InvalidTransaction") throw error;
    wrongRuntimeRejected = true;
  }
  const codec = createAbiCodec();
  const approve = getTokenInterface().find(
    (entry) => entry.type === "function" && entry.name === "approve",
  );
  const encoded = codec.encodeFunction(approve, [`0x${"11".repeat(20)}`, 7n]);
  const decoded = codec.decodeCalldata(approve, encoded);
  const savings = calculateSavingsYield({
    balance: 0n,
    yieldIndex: 0n,
    supplyYieldIndex: 0n,
    storedClaimableYield: 7n,
  });
  return {
    noNodeGlobals: !["Buffer", "process", "require"].some((name) => Reflect.has(globalThis, name)),
    byteDigest: sha256("0x616263"),
    utf8Digest: sha256(new TextEncoder().encode("abc")),
    amount: parseUnitsExact("1.25", 6).toString(),
    chain: parseUint(await transport.getChainId()).toString(),
    abiRoundTrip: String(decoded[1]),
    savings: savings.claimable.baseUnits.toString(),
    queryId: scanned.queryId,
    resumedThrough: scanned.resumedThrough?.toString(),
    scanStatus: scanned.status,
    wrongRuntimeRejected,
  };
}
