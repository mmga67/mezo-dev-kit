/** Opt-in, read-only public-entrypoint probe. Not part of offline test defaults. */
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { createInstitutionalReader } from "@mezo-dev-kit/musd-institutional-debt";
import { parseHash32 } from "@mezo-dev-kit/evm";
import { readFileSync } from "node:fs";
const [endpoint] = process.argv.slice(2);
if (!endpoint) throw new Error("usage: node test/live.ts <read-only-mainnet-rpc>");
const url = new URL(endpoint);
if (!["http:", "https:"].includes(url.protocol)) throw new Error("expected HTTP RPC");
function output(value: string): void {
  process.stdout.write(`${value}\n`);
}
let nextId = 0;
const send: RpcRequest = async (input) => {
  if (
    ![
      "eth_chainId",
      "eth_blockNumber",
      "eth_getBlockByNumber",
      "eth_getCode",
      "eth_call",
      "eth_getStorageAt",
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
// Application-owned throttling: serialize this opt-in probe to respect public RPC limits.
let queue: Promise<void> = Promise.resolve();
const request: RpcRequest = (input) => {
  const result = queue.then(async () => {
    await delay(150);
    return send(input);
  });
  // A caller still receives its rejection; later independent requests may continue.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};
const registry = createContractRegistry(),
  transport = createRpcTransport({ id: url.hostname, request });

function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
const moduleUrl = new URL(
  "../../../../knowledge/protocols/musd/institutional-debt/",
  import.meta.url,
);
const index = object(JSON.parse(readFileSync(new URL("index.json", moduleUrl), "utf8")));
assert(Array.isArray(index.resources));
const resource = object(
  index.resources.find(
    (entry: unknown) => object(entry).id === "institutional-debt-fixed-block-state",
  ),
);
assert(typeof resource.path === "string");
const evidence = object(JSON.parse(readFileSync(new URL(resource.path, moduleUrl), "utf8")));
const known = object(evidence.debtManager).positions;
assert(Array.isArray(known));
const positionIds = known.map((value: unknown) => parseHash32(object(value).positionId));
const reader = createInstitutionalReader({ networkId: "mezo-mainnet", registry, transport });
const state = await reader.read({ positionIds });
assert.equal(state.positions.length, positionIds.length);
assert.equal(state.price.state, "available");
assert.equal(
  state.totals.totalMintedDebt - state.totals.totalDebtBurned,
  state.totals.totalPrincipal,
);
assert(state.positions.every((position) => position.health.state === "available"));
output(
  JSON.stringify(
    {
      kind: "institutional-positions",
      coordinate: state.coordinate,
      price: state.price,
      totals: state.totals,
      positions: state.positions,
    },
    (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
  ),
);
for (const generation of ["original", "second"] as const) {
  const account = registry.resolve({
    networkId: "mezo-mainnet",
    contractId: generation === "original" ? "musd.enclave-v1" : "musd.enclave-v2",
    blockNumber: state.coordinate.blockNumber,
  }).address;
  const custody = await reader.readEnclave({
    generation,
    account,
    targets: [{ address: state.manager, selector: "0xe487893f" }],
    maxUtxos: 256,
    blockNumber: state.coordinate.blockNumber,
  });
  assert.equal(custody.coordinate.blockHash, state.coordinate.blockHash);
  assert.equal(custody.utxos.state, "recorded");
  assert.equal(
    custody.roles.some((role) => role.name === "BRIDGE_MANAGER_ROLE"),
    generation === "second",
  );
  output(
    JSON.stringify(
      { kind: "enclave-authority-and-recorded-utxos", ...custody },
      (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    ),
  );
}
const failedPriceTransport = {
  ...transport,
  read: (input: Parameters<typeof transport.read>[0]) => {
    if (input.address === state.priceFeed)
      return Promise.reject(new Error("explicit price failure fixture"));
    return transport.read(input);
  },
};
const partial = await createInstitutionalReader({
  networkId: "mezo-mainnet",
  registry,
  transport: failedPriceTransport,
}).read({ positionIds: [positionIds[0]!], blockNumber: state.coordinate.blockNumber });
assert.deepEqual(partial.price, { state: "unavailable", reason: "price-call-failed" });
assert(partial.positions[0]?.debt.totalDebt === state.positions[0]?.debt.totalDebt);
assert.equal(partial.positions[0]?.health.state, "unavailable");
const changedCode = { ...transport, getCode: () => Promise.resolve("0x00" as const) };
await assert.rejects(
  createInstitutionalReader({ networkId: "mezo-mainnet", registry, transport: changedCode }).read({
    positionIds: [],
  }),
);
output(
  "Read-only institutional principal/fees/pledges/health, both Enclave generations, optional-price failure and wrong-runtime rejection passed.",
);
