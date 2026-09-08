/** Opt-in, read-only public-entrypoint probe. Not part of offline test defaults. */
import assert from "node:assert/strict";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createEventScanner, createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { createSkipPriceReader } from "@mezo-dev-kit/prices";
const [endpoint] = process.argv.slice(2);
if (!endpoint) throw new Error("usage: node test/live.ts <read-only-mainnet-rpc>");
const url = new URL(endpoint);
if (!["http:", "https:"].includes(url.protocol)) throw new Error("expected HTTP RPC");
function output(value: string): void {
  process.stdout.write(`${value}\n`);
}
let nextId = 0;
const request: RpcRequest = async (input) => {
  if (
    ![
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_call",
      "eth_getLogs",
    ].includes(input.method)
  )
    throw new Error("read-only method boundary");
  const id = ++nextId;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, ...input }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || !response.body) throw new Error(`RPC HTTP ${response.status}`);
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const bytes: unknown = chunk.value;
      if (!(bytes instanceof Uint8Array)) throw new Error("invalid RPC response chunk");
      length += bytes.length;
      if (length > 1024 * 1024) {
        await reader.cancel();
        throw new Error("RPC response too large");
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock();
  }
  const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    !raw ||
    typeof raw !== "object" ||
    !("jsonrpc" in raw) ||
    raw.jsonrpc !== "2.0" ||
    !("id" in raw) ||
    raw.id !== id ||
    "error" in raw ||
    !("result" in raw)
  )
    throw new Error("invalid RPC envelope");
  return raw.result;
};
const registry = createContractRegistry(),
  transport = createRpcTransport({ id: url.hostname, request });
const observedAt = BigInt(Math.floor(Date.now() / 1000));
const price = await createSkipPriceReader({ networkId: "mezo-mainnet", registry, transport }).read({
  observedAt,
  asOf: observedAt,
  maxAgeSeconds: 600n,
  targetDecimals: 18,
  rounding: "floor",
  allowPrecisionLoss: false,
});
assert.equal(price.status, "valid");
output(
  JSON.stringify(
    {
      kind: "direct-skip-observation",
      providerId: price.providerId,
      coordinate: price.coordinate,
      round: price.round,
      freshness: price.freshness,
      sourceClass: price.sourceClass,
      confidence: price.confidence,
    },
    (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
  ),
);
const scanner = createEventScanner({
  networkId: "mezo-mainnet",
  registry,
  request,
  providerId: url.hostname,
  capabilityEvidenceId: "opt-in-four-block-log-probe",
  policy: {
    blocksPerPage: 2,
    maxPages: 2,
    overlapBlocks: 2,
    maxLogsPerPage: 1000,
    maxLogDataBytes: 4096,
    confirmations: 1n,
    requestTimeoutMs: 10000,
  },
});
const scanInput = {
  contractId: "musd.token",
  fromBlock: price.coordinate.blockNumber - 3n,
  toBlock: price.coordinate.blockNumber,
  topics: [],
  observedAt: BigInt(Math.floor(Date.now() / 1000)),
  maxHeadAgeSeconds: 600n,
} as const;
const scan = await scanner.scan(scanInput);
assert.equal(scan.status, "complete");
assert(scan.checkpoint);
const resume = await scanner.scan({
  ...scanInput,
  checkpoint: JSON.parse(JSON.stringify(scan.checkpoint)),
});
assert.equal(resume.status, "complete");
assert.equal(resume.checkpoint?.throughBlock, scan.checkpoint.throughBlock);
output(
  JSON.stringify(
    {
      kind: "bounded-event-scan-and-resume",
      providerId: scan.providerId,
      requested: scan.requested,
      status: scan.status,
      count: scan.events.length,
      checkpoint: scan.checkpoint,
      resumedThrough: resume.resumedThrough,
    },
    (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
  ),
);
