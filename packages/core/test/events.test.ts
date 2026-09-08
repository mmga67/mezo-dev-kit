import { expect, test, vi } from "vitest";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { parseRpcQuantity, toRpcQuantity } from "@mezo-dev-kit/evm";
import { createEventScanner } from "../src/index.ts";
import type { EventScanPolicy, RpcRequest } from "../src/index.ts";
const registry = createContractRegistry(),
  base = 11703359n;
const hash = (number: bigint): `0x${string}` => `0x${number.toString(16).padStart(64, "0")}`;
const topic = hash(9n),
  tx = hash(10n);
const source = registry.resolve({
  networkId: "mezo-mainnet",
  contractId: "musd.token",
  blockNumber: base,
});
const policy: EventScanPolicy = {
  blocksPerPage: 2,
  maxPages: 3,
  maxLogsPerPage: 10,
  maxLogDataBytes: 256,
  overlapBlocks: 2,
  confirmations: 1n,
  requestTimeoutMs: 1000,
};
const input = {
  contractId: "musd.token",
  fromBlock: base,
  toBlock: base + 3n,
  topics: [topic],
  observedAt: 1000n,
  maxHeadAgeSeconds: 5n,
} as const;
function fixture(overrides: Partial<EventScanPolicy> = {}) {
  const state = {
    head: base + 10n,
    chain: "0x7b7c",
    timestamp: 1000n,
    hashes: new Map<bigint, `0x${string}`>(),
    logs: [] as Record<string, unknown>[],
    calls: [] as string[],
    failPage: -1,
    pages: 0,
    afterLogs: () => undefined,
    override: undefined as RpcRequest | undefined,
  };
  const blockHash = (number: bigint) => state.hashes.get(number) ?? hash(number);
  const log = (number = base, logIndex = 0n, transactionHash = tx) => ({
    address: source.address,
    blockNumber: toRpcQuantity(number),
    blockHash: blockHash(number),
    transactionHash,
    transactionIndex: "0x0",
    logIndex: toRpcQuantity(logIndex),
    topics: [topic],
    data: "0x",
    removed: false,
  });
  const request: RpcRequest = async ({ method, params }) => {
    state.calls.push(method);
    if (state.override) return state.override({ method, params });
    if (method === "eth_chainId") return state.chain;
    if (method === "eth_blockNumber") return toRpcQuantity(state.head);
    if (method === "eth_getBlockByNumber") {
      const number = parseRpcQuantity(params[0]);
      return {
        number: toRpcQuantity(number),
        hash: blockHash(number),
        parentHash: blockHash(number - 1n),
        timestamp: toRpcQuantity(state.timestamp),
      };
    }
    if (method === "eth_getLogs") {
      if (state.pages++ === state.failPage) throw new Error("provider failed");
      const query = params[0] as { fromBlock: string; toBlock: string };
      const values = state.logs.filter(
        (entry) =>
          parseRpcQuantity(entry.blockNumber) >= parseRpcQuantity(query.fromBlock) &&
          parseRpcQuantity(entry.blockNumber) <= parseRpcQuantity(query.toBlock),
      );
      state.afterLogs();
      return values;
    }
    throw new Error("unexpected RPC");
  };
  return {
    state,
    log,
    scanner: createEventScanner({
      networkId: "mezo-mainnet",
      registry,
      request,
      providerId: "fixture",
      capabilityEvidenceId: "bounded-fixture",
      policy: { ...policy, ...overrides },
    }),
  };
}
test("complete empty coverage has a JSON-safe checkpoint and bounded work", async () => {
  const { scanner, state } = fixture();
  const result = await scanner.scan(input);
  expect(result).toMatchObject({
    status: "complete",
    covered: { fromBlock: base, toBlock: base + 3n },
    gaps: [],
    events: [],
    issue: null,
  });
  expect(JSON.parse(JSON.stringify(result.checkpoint))).toMatchObject({
    schemaVersion: 1,
    throughBlock: (base + 3n).toString(),
    anchors: [{ blockNumber: (base + 2n).toString() }, { blockNumber: (base + 3n).toString() }],
  });
  expect(state.calls.filter((name) => name === "eth_getLogs")).toHaveLength(2);
});
test("events deduplicate and sort; identity survives a different query window", async () => {
  const { scanner, state, log } = fixture();
  state.logs = [log(base, 2n), log(), log()];
  const first = await scanner.scan(input);
  expect(first.events.map((entry) => entry.logIndex)).toEqual([0n, 2n]);
  const second = await scanner.scan({ ...input, fromBlock: base - 1n, topics: [] });
  expect(second.queryId).not.toBe(first.queryId);
  expect(second.events[0]?.id).toBe(first.events[0]?.id);
});
test("resume overlaps idempotently and validates checkpoint query identity", async () => {
  const { scanner, state, log } = fixture();
  state.logs = [log(base + 3n)];
  const first = await scanner.scan(input);
  const resumed = await scanner.scan({
    ...input,
    toBlock: base + 5n,
    checkpoint: JSON.parse(JSON.stringify(first.checkpoint)),
  });
  expect(resumed).toMatchObject({
    status: "complete",
    resumedThrough: base + 3n,
    covered: { fromBlock: base + 2n, toBlock: base + 5n },
  });
  expect(resumed.events[0]?.id).toBe(first.events[0]?.id);
  await expect(
    scanner.scan({ ...input, topics: [], checkpoint: first.checkpoint }),
  ).rejects.toThrow("incompatible checkpoint");
  await expect(
    scanner.scan({ ...input, checkpoint: { ...first.checkpoint, anchors: [] } }),
  ).rejects.toThrow("anchor window");
});
test("changed anchors request rewind to the last matching block", async () => {
  const { scanner, state } = fixture();
  const first = await scanner.scan(input);
  state.hashes.set(base + 3n, hash(900n));
  const result = await scanner.scan({ ...input, checkpoint: first.checkpoint });
  expect(result).toMatchObject({
    status: "reorged",
    checkpoint: null,
    events: [],
    reorg: { rollbackTo: { blockNumber: (base + 2n).toString() }, invalidatedFrom: base + 3n },
  });
  state.hashes.set(base + 2n, hash(899n));
  expect(await scanner.scan({ ...input, checkpoint: first.checkpoint })).toMatchObject({
    reorg: { rollbackTo: null, invalidatedFrom: base },
  });
});
test("exact provider log cap cannot establish absence or advance a checkpoint", async () => {
  const { scanner, state, log } = fixture({ maxLogsPerPage: 1 });
  state.logs = [log()];
  expect(await scanner.scan(input)).toMatchObject({
    status: "unknown",
    issue: "log-limit",
    checkpoint: null,
    covered: null,
    events: [],
  });
});
test("provider failure preserves verified earlier pages and exposes the remaining gap", async () => {
  const { scanner, state } = fixture();
  state.failPage = 1;
  expect(await scanner.scan(input)).toMatchObject({
    status: "partial",
    issue: "provider-failure",
    covered: { fromBlock: base, toBlock: base + 1n },
    gaps: [{ fromBlock: base + 2n, toBlock: base + 3n }],
    checkpoint: { throughBlock: (base + 1n).toString() },
  });
});
test("page budget and confirmation tail remain partial", async () => {
  const { scanner } = fixture({ maxPages: 2 });
  expect(await scanner.scan({ ...input, toBlock: base + 7n })).toMatchObject({
    status: "partial",
    issue: "page-limit",
  });
  const other = fixture({ confirmations: 3n });
  other.state.head = base + 3n;
  expect(await other.scanner.scan(input)).toMatchObject({
    status: "partial",
    issue: "unconfirmed",
    confirmedHead: base + 1n,
  });
});
test("stale, future, wrong-chain and unconfirmed heads do not create coverage", async () => {
  const { scanner, state } = fixture();
  state.timestamp = 994n;
  expect(await scanner.scan(input)).toMatchObject({ status: "unknown", issue: "stale-head" });
  state.timestamp = 1001n;
  expect(await scanner.scan(input)).toMatchObject({ issue: "stale-head" });
  state.timestamp = 1000n;
  state.chain = "0x1";
  expect(await scanner.scan(input)).toMatchObject({ issue: "chain-mismatch" });
  state.chain = "0x7b7c";
  state.head = base - 1n;
  expect(await scanner.scan(input)).toMatchObject({ issue: "unconfirmed" });
});
test.for([
  { removed: true },
  { address: `0x${"11".repeat(20)}` },
  { topics: [hash(99n)] },
  { blockHash: hash(99n) },
  { data: "0x1" },
  { logIndex: "0x01" },
])("foreign or malformed logs fail: %j", async (change) => {
  const { scanner, state, log } = fixture();
  state.logs = [{ ...log(), ...change }];
  expect(await scanner.scan(input)).toMatchObject({
    status: "unknown",
    issue: "invalid-response",
    events: [],
    checkpoint: null,
  });
});
test("conflicting duplicate and block-wide log positions fail", async () => {
  const { scanner, state, log } = fixture();
  state.logs = [log(), { ...log(), data: "0xff" }];
  expect(await scanner.scan(input)).toMatchObject({ issue: "invalid-response" });
  state.logs = [log(), log(base, 0n, hash(20n))];
  expect(await scanner.scan(input)).toMatchObject({ issue: "invalid-response" });
});
test("reorg during a page discards its uncommitted observations", async () => {
  const { scanner, state, log } = fixture();
  state.logs = [log()];
  state.afterLogs = () => {
    state.hashes.set(base + 1n, hash(500n));
  };
  expect(await scanner.scan(input)).toMatchObject({
    status: "reorged",
    issue: "reorg",
    events: [],
    covered: null,
    checkpoint: null,
  });
});
test("cancellation and timeout do not masquerade as empty completion", async () => {
  const { scanner, state } = fixture();
  const controller = new AbortController();
  controller.abort();
  expect(await scanner.scan({ ...input, signal: controller.signal })).toMatchObject({
    issue: "aborted",
    checkpoint: null,
  });
  expect(state.calls).toEqual([]);
  vi.useFakeTimers();
  try {
    state.override = () =>
      new Promise(() => {
        /* Deliberately unresolved provider request for the timeout test. */
      });
    const pending = scanner.scan(input);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ status: "unknown", issue: "timeout" });
  } finally {
    vi.useRealTimers();
  }
});
test("invalid budgets and topics reject before querying", async () => {
  expect(() => fixture({ maxPages: 0 })).toThrow();
  expect(() => fixture({ overlapBlocks: 6 })).toThrow();
  const { scanner, state } = fixture();
  await expect(scanner.scan({ ...input, topics: [[]] })).rejects.toThrow();
  expect(state.calls).toEqual([]);
});
