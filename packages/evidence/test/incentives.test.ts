import { afterEach, expect, test, vi } from "vitest";
import { createAbiCodec, toRpcQuantity } from "@mezo-dev-kit/evm";
import { getNetwork } from "@mezo-dev-kit/chains";
import { resolveContract } from "@mezo-dev-kit/contracts";
import type * as Contracts from "@mezo-dev-kit/contracts";
import {
  evidenceCapabilities,
  EvidenceError,
  parseEvidenceReport,
  refreshEvidence,
} from "../src/index.ts";
import type { EvidenceRequest, EvidenceRpcRequest } from "../src/index.ts";
import { EVIDENCE_INPUTS } from "../src/inputs.generated.ts";
import type * as Inputs from "../src/inputs.generated.ts";

const generation = vi.hoisted(() => ({ changed: false }));
afterEach(() => {
  generation.changed = false;
});
vi.mock("../src/inputs.generated.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof Inputs>();
  const { sha256 } = await import("@mezo-dev-kit/evm");
  return {
    EVIDENCE_INPUTS: {
      ...actual.EVIDENCE_INPUTS,
      incentives: {
        ...actual.EVIDENCE_INPUTS.incentives,
        runtimes: actual.EVIDENCE_INPUTS.incentives.runtimes.map((r) => ({
          ...r,
          expected: {
            ...r.expected,
            addressCodeSha256: sha256("0x6000").slice(2),
            implementationCodeSha256:
              r.expected.implementationCodeSha256 === null ? null : sha256("0x6000").slice(2),
          },
        })),
      },
    },
  };
});

function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("fixture object");
  return v as Record<string, unknown>;
}
// Synthetic runtime expectations isolate orchestration; the separate live smoke checks deployed code.
vi.mock("@mezo-dev-kit/contracts", async (importOriginal) => {
  const actual = await importOriginal<typeof Contracts>();
  const { sha256 } = await import("@mezo-dev-kit/evm");
  return {
    ...actual,
    resolveRuntimeIdentity: (input: Parameters<typeof actual.resolveRuntimeIdentity>[0]) => {
      const identity = actual.resolveRuntimeIdentity(input);
      return {
        ...identity,
        addressCodeSha256: sha256(generation.changed ? "0x6001" : "0x6000").slice(2),
        implementationCodeSha256:
          identity.implementationCodeSha256 === null
            ? null
            : sha256(generation.changed ? "0x6001" : "0x6000").slice(2),
      };
    },
  };
});
const block = BigInt(EVIDENCE_INPUTS.incentives.baselineCoordinate.blockNumber);
const hash = `0x${"ab".repeat(32)}`;
const words = (...v: bigint[]) => `0x${v.map((x) => x.toString(16).padStart(64, "0")).join("")}`;
const request: EvidenceRequest = {
  formatVersion: 1,
  runId: "incentives-fixture",
  providerId: "fixture",
  networkId: "mezo-mainnet",
  recipe: "incentives.configuration",
  contractIds: [...new Set(EVIDENCE_INPUTS.incentives.claims.map((c) => c.contractId))],
  policy: {
    maxRequests: 500,
    maxAttempts: 1,
    maxResponseBytes: 262144,
    timeoutMs: 1000,
    maxBlockAgeSeconds: "10",
    maxPriceAgeSeconds: "10",
  },
};
function fixture() {
  const state = { changed: "", unavailable: "", badCode: false, wrongChain: false, reorg: false };
  const calls: { method: string; params: readonly unknown[] }[] = [];
  const codec = createAbiCodec();
  const rpc: EvidenceRpcRequest = async (input) => {
    const { method, params } = input;
    calls.push({ method, params });
    if (method === "eth_chainId")
      return toRpcQuantity(state.wrongChain ? 1n : getNetwork(request.networkId).evmChainId);
    if (method === "eth_blockNumber") return toRpcQuantity(block);
    if (method === "eth_getBlockByNumber")
      return {
        number: toRpcQuantity(block),
        hash: state.reorg ? `0x${"cd".repeat(32)}` : hash,
        timestamp: toRpcQuantity(1000n),
      };
    if (method === "eth_getCode")
      return state.badCode ? "0x00" : generation.changed ? "0x6001" : "0x6000";
    const claim = EVIDENCE_INPUTS.incentives.claims.find((c) => {
      if (
        !c.supported ||
        resolveContract({ networkId: "mezo-mainnet", contractId: c.contractId, blockNumber: block })
          .address !== (method === "eth_call" ? obj(params[0]).to : params[0])
      )
        return false;
      return c.slot !== null
        ? method === "eth_getStorageAt" && BigInt(String(params[1])) === BigInt(c.slot)
        : method === "eth_call" && obj(params[0]).data === codec.encodeFunction(c.abi);
    });
    if (claim) {
      if (claim.id === state.unavailable) throw new EvidenceError("rpc-error");
      const value = claim.expected;
      if (typeof value === "string")
        return words(BigInt(value) + (claim.id === state.changed ? 1n : 0n));
      if (Array.isArray(value))
        return words(32n, BigInt(value.length), ...value.map((v) => BigInt(v)));
      throw new Error("Unsupported fixture");
    }
    if (method === "eth_getStorageAt") {
      const target = EVIDENCE_INPUTS.incentives.claims
        .map((c) =>
          resolveContract({
            networkId: "mezo-mainnet",
            contractId: c.contractId,
            blockNumber: block,
          }),
        )
        .find((c) => c.address === params[0]);
      if (target?.implementationAddress) return words(BigInt(target.implementationAddress));
    }
    throw new Error("Unexpected fixture RPC");
  };
  return { state, calls, rpc };
}
test("all 34 configured fields remain visible, including six unsupported strings", async () => {
  const f = fixture();
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(report).toMatchObject({
    status: "partial",
    coverage: { planned: 40, collected: 34 },
    anchorIntegrity: "consistent",
  });
  expect(report.observations.filter((o) => o.error === "unsupported-codec")).toHaveLength(6);
  expect(report.observations.filter((o) => o.status === "match")).toHaveLength(34);
  expect(parseEvidenceReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  expect(evidenceCapabilities().incentiveFields).toHaveLength(34);
  expect(f.calls.every((c) => !c.method.startsWith("eth_send"))).toBe(true);
});
test.for([
  ["boost-voter-max-voting-num", "conflict", "configuration-changed"],
  ["vebtc-current-supply", "observed", null],
  ["vebtc-current-max-lock-time", "conflict", "configuration-changed"],
] as const)(
  "field %s distinguishes configuration review from state movement",
  async ([id, status, error]) => {
    const f = fixture();
    f.state.changed = id;
    const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
    expect(report.observations.find((o) => o.id === `incentive:${id}`)).toMatchObject({
      status,
      error,
    });
  },
);
test("changed runtime prevents interpretation of every affected field", async () => {
  const f = fixture();
  f.state.badCode = true;
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(
    report.observations
      .filter((o) => o.id.startsWith("incentive:"))
      .every((o) => o.observed === null && o.error === "runtime-changed"),
  ).toBe(true);
  expect(f.calls.some((c) => c.method === "eth_call")).toBe(false);
});
test("an unavailable getter preserves successful sibling observations", async () => {
  const f = fixture();
  f.state.unavailable = "vebtc-current-supply";
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(report.observations.find((o) => o.id === "incentive:vebtc-current-supply")).toMatchObject({
    status: "unavailable",
    error: "rpc-error",
  });
  expect(
    report.observations.find((o) => o.id === "incentive:boost-voter-max-voting-num")?.status,
  ).toBe("match");
});
test("a later accepted registry generation cannot rebind the recipe's older storage semantics", async () => {
  const f = fixture();
  generation.changed = true;
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(
    report.observations
      .filter((o) => o.id.startsWith("runtime:"))
      .every((o) => o.error === "runtime-changed"),
  ).toBe(true);
  expect(f.calls.some((c) => c.method === "eth_call")).toBe(false);
});
test("wrong network never starts incentives calls", async () => {
  const f = fixture();
  f.state.wrongChain = true;
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(report.failure).toBe("wrong-chain");
  expect(f.calls).toHaveLength(1);
});
test("cancellation and reorg retain incomplete field coverage", async () => {
  for (const mode of ["cancel", "reorg"] as const) {
    const f = fixture();
    const controller = new AbortController();
    const report = await refreshEvidence(request, {
      request: f.rpc,
      now: () => 1000n,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.collected === 7) {
          if (mode === "cancel") controller.abort();
          else f.state.reorg = true;
        }
      },
    });
    expect(report.failure).toBe(mode === "cancel" ? "cancelled" : "reorg");
    expect(report.coverage.collected).toBeLessThan(report.coverage.planned);
  }
});
test("report validation rejects relabeling a configuration conflict as ordinary state", async () => {
  const f = fixture();
  f.state.changed = "boost-voter-max-voting-num";
  const report = await refreshEvidence(request, { request: f.rpc, now: () => 1000n });
  expect(() =>
    parseEvidenceReport({
      ...report,
      observations: report.observations.map((o) =>
        o.id === "incentive:boost-voter-max-voting-num"
          ? { ...o, unit: "incentive-state", status: "observed", error: null }
          : o,
      ),
    }),
  ).toThrow();
});
