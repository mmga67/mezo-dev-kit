import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { getNetwork } from "@mezo-dev-kit/chains";
import { toRpcQuantity } from "@mezo-dev-kit/evm";
import {
  evidenceCapabilities,
  EvidenceError,
  parseEvidenceReport,
  parseEvidenceRequest,
  refreshEvidence,
  createEvidenceHttpRequest,
  parseEvidenceProgress,
} from "../src/index.ts";
import type { EvidenceRequest, EvidenceRpcRequest } from "../src/index.ts";
const block = 11703359n,
  hash = `0x${"ab".repeat(32)}`;
const request: EvidenceRequest = {
  formatVersion: 1,
  runId: "synthetic-run",
  providerId: "fixture",
  networkId: "mezo-mainnet",
  recipe: "network.identity",
  contractIds: [],
  policy: {
    maxRequests: 200,
    maxAttempts: 2,
    maxResponseBytes: 262144,
    timeoutMs: 100,
    maxBlockAgeSeconds: "10",
    maxPriceAgeSeconds: "5",
  },
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("fixture object");
  return v as Record<string, unknown>;
}
// Conformance uses the retained interface bytes, without copying canonical runtime expectations.
const capture = object(
  JSON.parse(
    await readFile(
      new URL(
        "../../../knowledge/contracts/artifacts/read-runtime/lending-mainnet.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
if (!Array.isArray(capture.records)) throw new Error("runtime records");
const skipCode = object(
  capture.records.find((r: unknown) => object(r).contractId === "oracle.skip-btc-usd"),
).code;
const words = (...values: bigint[]) =>
  `0x${values.map((v) => BigInt.asUintN(256, v).toString(16).padStart(64, "0")).join("")}`;
function fixture() {
  const state = {
    chain: getNetwork(request.networkId).evmChainId,
    time: 1000n,
    code: skipCode,
    hash,
    priceTime: 995n,
    price: 60000n * 10n ** 18n,
  };
  const calls: string[] = [];
  const rpc: EvidenceRpcRequest = async ({ method, params }) => {
    calls.push(method);
    if (method === "eth_chainId") return toRpcQuantity(state.chain);
    if (method === "eth_blockNumber") return toRpcQuantity(block);
    if (method === "eth_getBlockByNumber")
      return {
        number: toRpcQuantity(block),
        hash: state.hash,
        timestamp: toRpcQuantity(state.time),
      };
    if (method === "eth_getCode") return state.code;
    if (method === "eth_call")
      return object(params[0]).data === "0x313ce567"
        ? words(18n)
        : words(7n, state.price, 990n, state.priceTime, 7n);
    throw new Error("Unexpected RPC");
  };
  return { state, calls, rpc };
}
test("network capture is immutable, bounded and round-trips independently of canonical acceptance", async () => {
  const f = fixture(),
    events: unknown[] = [];
  const report = await refreshEvidence(request, {
    request: f.rpc,
    now: () => 1000n,
    onProgress: (e) => events.push(e),
  });
  expect(report).toMatchObject({
    status: "complete",
    anchorIntegrity: "consistent",
    blockFreshness: "fresh",
    canonicalAcceptance: "unreviewed",
    historicalIntegrity: "not-assessed",
    coordinate: { blockNumber: block.toString(), blockHash: hash },
    coverage: { planned: 1, collected: 1 },
  });
  expect(report.requestsUsed).toBe(f.calls.length);
  expect(parseEvidenceReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  expect(Object.isFrozen(report.request.policy)).toBe(true);
  expect(events.map((e) => parseEvidenceProgress(e).phase)).toEqual([
    "started",
    "claim",
    "finished",
  ]);
  expect(
    f.calls.every((method) =>
      ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber"].includes(method),
    ),
  ).toBe(true);
});
test.for([0, 1, 2] as const)("block freshness boundary partition %s", async (partition) => {
  const f = fixture();
  f.state.time = [990n, 989n, 1001n][partition]!;
  expect(
    (await refreshEvidence(request, { request: f.rpc, now: () => 1000n })).blockFreshness,
  ).toBe(["fresh", "stale", "future"][partition]);
});
test("revision 1 source labels remain valid alongside scoped module references", async () => {
  const f = fixture();
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  const saved = {
    ...report,
    recipeRevision: "1",
    observations: report.observations.map((o) => ({ ...o, sourceRefs: ["legacy-label"] })),
  };
  expect(parseEvidenceReport(saved)).toEqual(saved);
});
test("wrong chain stops before any block or contract read", async () => {
  const f = fixture();
  f.state.chain = 1n;
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(report).toMatchObject({
    status: "failed",
    failure: "wrong-chain",
    coordinate: null,
    observations: [{ status: "conflict", error: "wrong-chain" }],
  });
  expect(f.calls).toEqual(["eth_chainId"]);
});
test("a changed final block retains observations and marks their coherence invalid", async () => {
  const f = fixture();
  let blocks = 0;
  const report = await refreshEvidence(request, {
    now: () => 1000n,
    request: async (input) => {
      if (input.method === "eth_getBlockByNumber" && ++blocks === 3)
        f.state.hash = `0x${"cd".repeat(32)}`;
      return f.rpc(input);
    },
  });
  expect(report).toMatchObject({
    status: "partial",
    failure: "reorg",
    anchorIntegrity: "changed",
    coverage: { collected: 1 },
  });
});
test("runtime captures retain both observed and expected hashes when bytecode changes", async () => {
  const f = fixture();
  f.state.code = "0x00";
  const report = await refreshEvidence(
    { ...request, recipe: "runtime.current", contractIds: ["oracle.skip-btc-usd"] },
    { now: () => 1000n, request: f.rpc },
  );
  expect(report).toMatchObject({
    status: "complete",
    observations: [
      { status: "match" },
      { status: "conflict", error: "runtime-changed", unit: "runtime-identity" },
    ],
  });
  const observation = report.observations[1];
  expect(observation?.expected).not.toEqual(observation?.observed);
});
test.for([995n, 994n] as const)(
  "Skip retains round, explicit scale and publication freshness at %s",
  async (time) => {
    const f = fixture();
    f.state.priceTime = time;
    const report = await refreshEvidence(
      { ...request, recipe: "price.skip" },
      { now: () => 1000n, request: f.rpc },
    );
    expect(report).toMatchObject({
      status: "complete",
      observations: [
        { status: "match" },
        {
          status: "observed",
          freshness: time === 995n ? "fresh" : "stale",
          observed: {
            answer: f.state.price.toString(),
            decimals: 18,
            publishedAt: time.toString(),
            confidence: null,
          },
        },
      ],
    });
  },
);
test("partial provider failure keeps chain observation and never exposes provider errors", async () => {
  const f = fixture();
  const report = await refreshEvidence(
    { ...request, recipe: "runtime.current", contractIds: ["oracle.skip-btc-usd"] },
    {
      now: () => 1000n,
      request: (input) => {
        if (input.method === "eth_getCode") throw new Error("https://private.example/SECRET");
        return f.rpc(input);
      },
    },
  );
  expect(report).toMatchObject({
    status: "partial",
    anchorIntegrity: "consistent",
    observations: [{ status: "match" }, { status: "unavailable", error: "transport-error" }],
  });
  expect(JSON.stringify(report)).not.toContain("SECRET");
});
test("cancellation preserves completed claims and schedules no more requests", async () => {
  const f = fixture(),
    controller = new AbortController();
  const report = await refreshEvidence(request, {
    now: () => 1000n,
    request: f.rpc,
    signal: controller.signal,
    onProgress: (event) => {
      if (event.phase === "claim") controller.abort();
    },
  });
  expect(report).toMatchObject({
    status: "cancelled",
    failure: "cancelled",
    coverage: { collected: 1 },
  });
  expect(f.calls).toHaveLength(1);
});
test("request budget includes retries and cannot be exceeded", async () => {
  let calls = 0;
  const report = await refreshEvidence(
    { ...request, policy: { ...request.policy, maxRequests: 1 } },
    {
      now: () => 1000n,
      request: () => {
        calls++;
        throw new EvidenceError("transport-error", true);
      },
    },
  );
  expect(report).toMatchObject({ status: "failed", failure: "request-budget", requestsUsed: 1 });
  expect(calls).toBe(1);
});
test("RPC failures are not retried as transient transport errors", async () => {
  const report = await refreshEvidence(request, {
    now: () => 1000n,
    request: () => Promise.reject(new EvidenceError("rpc-error")),
  });
  expect(report).toMatchObject({ status: "failed", failure: "rpc-error", requestsUsed: 1 });
});
test.for([
  { ...request, formatVersion: 2 },
  { ...request, extra: true },
  { ...request, recipe: "all" },
  { ...request, networkId: "implicit" },
  { ...request, recipe: "price.skip", networkId: "mezo-testnet" },
  { ...request, recipe: "runtime.current", contractIds: ["unknown"] },
  { ...request, policy: { ...request.policy, maxPriceAgeSeconds: 5 } },
  { ...request, providerId: "https://secret" },
])("malformed or unsupported request fails before capture %#", (value) => {
  expect(() => parseEvidenceRequest(value)).toThrowError(EvidenceError);
});
test("report parser rejects altered version, units, coordinates and acceptance", async () => {
  const report = await refreshEvidence(request, { now: () => 1000n, request: fixture().rpc });
  for (const altered of [
    { ...report, formatVersion: 2 },
    { ...report, canonicalAcceptance: "accepted" },
    { ...report, coordinate: { ...report.coordinate, chainId: "1" } },
    { ...report, observations: [{ ...report.observations[0], unit: "USD" }] },
    { ...report, status: "complete", coverage: { planned: 2, collected: 1 } },
    { ...report, completedAt: "999" },
  ])
    expect(() => parseEvidenceReport(altered)).toThrowError(EvidenceError);
});
test("capabilities list omitted registrations and no testnet price recipe", () => {
  const catalog = evidenceCapabilities();
  expect(catalog.recipes.find((r) => r.id === "price.skip")?.networkIds).toEqual(["mezo-mainnet"]);
  expect(catalog.networks.some((n) => n.unavailableRuntimeContracts.length > 0)).toBe(true);
});
const httpInput = {
  method: "eth_chainId",
  params: [],
  signal: new AbortController().signal,
  timeoutMs: 100,
  maxResponseBytes: 1024,
};
test("HTTP rejects oversize responses, bad identity, RPC errors and redirects without leaking content", async () => {
  for (const [body, code] of [
    ["s".repeat(1025), "response-too-large"],
    [JSON.stringify({ jsonrpc: "2.0", id: 2, result: "0x1" }), "invalid-response"],
    [JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "SECRET" } }), "rpc-error"],
  ]) {
    const rpc = createEvidenceHttpRequest({
      url: "https://fixture.invalid/SECRET",
      fetch: async (_url, init) => {
        expect(init?.redirect).toBe("error");
        return new Response(body);
      },
    });
    await expect(rpc(httpInput)).rejects.toMatchObject({
      code,
      message: `Evidence operation: ${code}`,
    });
  }
});
test("HTTP cancellation and timeout reach the active transport", async () => {
  const rpc = createEvidenceHttpRequest({
    url: "https://fixture.invalid",
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            reject(new Error("SECRET"));
          },
          { once: true },
        );
      }),
  });
  await expect(rpc({ ...httpInput, timeoutMs: 1 })).rejects.toMatchObject({ code: "timeout" });
  const controller = new AbortController(),
    pending = rpc({ ...httpInput, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "cancelled" });
});

test("a block mined during collection is evaluated at capture completion, not run start", async () => {
  const f = fixture();
  f.state.time = 1001n;
  let ticks = 999n;
  const report = await refreshEvidence(request, { request: f.rpc, now: () => ++ticks });
  expect(report).toMatchObject({
    startedAt: "1000",
    completedAt: "1002",
    status: "complete",
    blockFreshness: "fresh",
  });
});
test("saved freshness cannot be relabeled and a changed expected value cannot claim a match", async () => {
  const report = await refreshEvidence(request, { request: fixture().rpc, now: () => 1000n });
  expect(() => parseEvidenceReport({ ...report, blockFreshness: "stale" })).toThrowError(
    EvidenceError,
  );
  expect(() =>
    parseEvidenceReport({
      ...report,
      observations: [{ ...report.observations[0], observed: "1" }],
    }),
  ).toThrowError(EvidenceError);
});
test("nonpositive source prices remain explicit conflicts, never usable zero prices", async () => {
  const f = fixture();
  f.state.price = 0n;
  const report = await refreshEvidence(
    { ...request, recipe: "price.skip" },
    { now: () => 1000n, request: f.rpc },
  );
  expect(report.observations[1]).toMatchObject({
    status: "conflict",
    error: "invalid-price",
    observed: { answer: "0" },
  });
});
test("consumer progress exceptions reject instead of masquerading as provider evidence", async () => {
  const error = new Error("consumer failure");
  await expect(
    refreshEvidence(request, {
      request: fixture().rpc,
      now: () => 1000n,
      onProgress: (progress) => {
        if (progress.phase === "claim") throw error;
      },
    }),
  ).rejects.toBe(error);
});

test("the public evidence HTTP adapter refuses submission methods before fetch", async () => {
  let contacted = false;
  const rpc = createEvidenceHttpRequest({
    url: "https://fixture.invalid",
    fetch: () => {
      contacted = true;
      return Promise.reject(new Error("must not run"));
    },
  });
  await expect(rpc({ ...httpInput, method: "eth_sendRawTransaction" })).rejects.toMatchObject({
    code: "invalid-input",
  });
  expect(contacted).toBe(false);
});
