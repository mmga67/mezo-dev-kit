import { evaluatePriceFreshness } from "@mezo-dev-kit/prices";
import { getNetwork, isNetworkId } from "@mezo-dev-kit/chains";
import { parseAddress, parseHash32, parseUint, parseUnsignedInteger } from "@mezo-dev-kit/evm";
import { EVIDENCE_INPUTS } from "./inputs.generated.ts";
import { EvidenceError } from "./types.ts";
import { incentiveClaims, plannedIncentives } from "./incentives.ts";
import type {
  EvidenceFailure,
  EvidenceFreshness,
  EvidenceObservation,
  EvidenceProgress,
  EvidenceReport,
  EvidenceRequest,
  PriceEvidenceValue,
  RuntimeEvidenceValue,
  IncentiveEvidenceValue,
} from "./types.ts";

export function freeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) freeze(entry);
    Object.freeze(value);
  }
  return value;
}
function invalid(): never {
  throw new EvidenceError("invalid-input");
}
function obj(v: unknown): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return invalid();
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, expected: string): void {
  const names = expected.split(" ");
  if (Object.keys(v).length !== names.length || names.some((k) => !Object.hasOwn(v, k))) invalid();
}
function word(v: unknown): string {
  if (typeof v !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(v)) return invalid();
  return v;
}
function sourceRef(v: unknown): string {
  if (
    typeof v !== "string" ||
    (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(v) &&
      !/^[a-z0-9]+(?:[/-][a-z0-9]+)*:[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/.test(v))
  )
    return invalid();
  return v;
}
function uint(v: unknown): string {
  if (typeof v !== "string" || v.length > 78) return invalid();
  try {
    return parseUint(parseUnsignedInteger(v)).toString();
  } catch {
    return invalid();
  }
}
function count(v: unknown, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) return invalid();
  return v;
}
function values(v: unknown): unknown[] {
  if (!Array.isArray(v)) return invalid();
  return v;
}
function select<T extends string>(v: unknown, allowed: readonly T[]): T {
  const found = allowed.find((a) => a === v);
  if (!found) return invalid();
  return found;
}
const failures: readonly EvidenceFailure[] = [
  "wrong-chain",
  "invalid-price",
  "runtime-changed",
  "configuration-changed",
  "unsupported-codec",
  "reorg",
  "invalid-response",
  "transport-error",
  "rpc-error",
  "timeout",
  "response-too-large",
  "request-budget",
  "cancelled",
  "unavailable",
];
function failure(v: unknown): EvidenceFailure | null {
  return v === null ? null : select(v, failures);
}
function freshness(v: unknown): EvidenceFreshness {
  return select(v, ["fresh", "stale", "future", "missing", "not-evaluated"]);
}
function hash(v: unknown): string {
  try {
    return parseHash32(v);
  } catch {
    return invalid();
  }
}
function address(v: unknown): string {
  try {
    return parseAddress(v);
  } catch {
    return invalid();
  }
}
function digest(v: unknown): string {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v)) return invalid();
  return v;
}
function request(value: unknown, capture: boolean): EvidenceRequest {
  const v = obj(value);
  keys(v, "formatVersion runId providerId networkId recipe contractIds policy");
  if (v.formatVersion !== 1 || !isNetworkId(v.networkId)) return invalid();
  const recipe = select(v.recipe, [
      "network.identity",
      "runtime.current",
      "price.skip",
      "incentives.configuration",
    ]),
    networkId = v.networkId;
  const contractIds = values(v.contractIds).map(word);
  if (
    contractIds.length > 100 ||
    new Set(contractIds).size !== contractIds.length ||
    (recipe === "runtime.current" || recipe === "incentives.configuration"
      ? !contractIds.length
      : contractIds.length > 0)
  )
    invalid();
  if (recipe === "price.skip" && networkId !== "mezo-mainnet") invalid();
  if (
    recipe === "incentives.configuration" &&
    (networkId !== "mezo-mainnet" ||
      contractIds.some((id) => !EVIDENCE_INPUTS.incentives.claims.some((c) => c.contractId === id)))
  )
    invalid();
  if (capture && (recipe === "runtime.current" || recipe === "incentives.configuration")) {
    const network = EVIDENCE_INPUTS.networks.find((n) => n.id === networkId);
    if (
      !network ||
      contractIds.some((id) => !(network.runtimeContracts as readonly string[]).includes(id))
    )
      invalid();
  }
  const p = obj(v.policy);
  keys(
    p,
    "maxRequests maxAttempts maxResponseBytes timeoutMs maxBlockAgeSeconds maxPriceAgeSeconds",
  );
  return freeze({
    formatVersion: 1,
    runId: word(v.runId),
    providerId: word(v.providerId),
    networkId,
    recipe,
    contractIds,
    policy: {
      maxRequests: count(p.maxRequests, 1, 5000),
      maxAttempts: count(p.maxAttempts, 1, 3),
      maxResponseBytes: count(p.maxResponseBytes, 1024, 2097152),
      timeoutMs: count(p.timeoutMs, 100, 60000),
      maxBlockAgeSeconds: uint(p.maxBlockAgeSeconds),
      maxPriceAgeSeconds: uint(p.maxPriceAgeSeconds),
    },
  });
}
/** Strict schema-v1 request parser. Unsupported recipe/network/contract combinations fail before RPC. */
export function parseEvidenceRequest(value: unknown): EvidenceRequest {
  return request(value, true);
}
function runtime(v: unknown): RuntimeEvidenceValue | null {
  if (v === null) return null;
  const r = obj(v);
  keys(
    r,
    "address addressCodeSha256 implementationAddress implementationCodeSha256 implementationSlotValue",
  );
  if ((r.implementationCodeSha256 === null) !== (r.implementationSlotValue === null)) invalid();
  return {
    address: address(r.address),
    addressCodeSha256: digest(r.addressCodeSha256),
    implementationAddress:
      r.implementationAddress === null ? null : address(r.implementationAddress),
    implementationCodeSha256:
      r.implementationCodeSha256 === null ? null : digest(r.implementationCodeSha256),
    implementationSlotValue:
      r.implementationSlotValue === null ? null : hash(r.implementationSlotValue),
  };
}
function price(v: unknown): PriceEvidenceValue | null {
  if (v === null) return null;
  const p = obj(v);
  keys(p, "answer decimals roundId startedAt publishedAt answeredInRound confidence");
  if (
    typeof p.answer !== "string" ||
    !/^(0|-?[1-9][0-9]*)$/.test(p.answer) ||
    p.confidence !== null
  )
    return invalid();
  if (BigInt(p.answer) < -(1n << 255n) || BigInt(p.answer) >= 1n << 255n) return invalid();
  return {
    answer: p.answer,
    decimals: count(p.decimals, 0, 77),
    roundId: uint(p.roundId),
    startedAt: uint(p.startedAt),
    publishedAt: uint(p.publishedAt),
    answeredInRound: uint(p.answeredInRound),
    confidence: null,
  };
}
function observation(value: unknown): EvidenceObservation {
  const v = obj(value);
  keys(v, "id status error freshness sourceRefs unit expected observed");
  const base = {
    id: word(v.id),
    status: select(v.status, ["match", "conflict", "observed", "unavailable", "not-run"]),
    error: failure(v.error),
    freshness: freshness(v.freshness),
    sourceRefs: values(v.sourceRefs).map(sourceRef),
  };
  if ((base.status === "unavailable" || base.status === "not-run") !== (v.observed === null))
    invalid();
  if ((base.status === "match" || base.status === "observed") && base.error !== null) invalid();
  if (base.status === "conflict" && base.error === null) invalid();
  if (v.unit === "chain-id")
    return {
      ...base,
      unit: v.unit,
      expected: uint(v.expected),
      observed: v.observed === null ? null : uint(v.observed),
    };
  if (v.unit === "runtime-identity")
    return { ...base, unit: v.unit, expected: runtime(v.expected), observed: runtime(v.observed) };
  if (v.unit === "usd-per-btc" && v.expected === null)
    return { ...base, unit: v.unit, expected: null, observed: price(v.observed) };
  if (
    v.unit === "incentive-configuration" ||
    v.unit === "incentive-state" ||
    v.unit === "incentive-metadata"
  )
    return {
      ...base,
      unit: v.unit,
      expected: incentiveValue(v.expected),
      observed: incentiveValue(v.observed),
    };
  return invalid();
}
function incentiveValue(value: unknown): IncentiveEvidenceValue | null {
  if (value === null) return null;
  const v = obj(value);
  keys(v, "valueUnit value");
  const valueUnit = select(v.valueUnit, [
    "address",
    "address-list",
    "seconds",
    "count",
    "base-units",
    "text",
  ]);
  if (valueUnit === "address-list") return { valueUnit, value: values(v.value).map(address) };
  if (valueUnit === "address") return { valueUnit, value: address(v.value) };
  if (valueUnit === "text") {
    if (typeof v.value !== "string" || v.value.length > 1000) return invalid();
    return { valueUnit, value: v.value };
  }
  return { valueUnit, value: uint(v.value) };
}
/** Validate saved JSON without relabeling it with today's recipe inputs or acceptance. */
export function parseEvidenceReport(value: unknown): EvidenceReport {
  const v = obj(value);
  keys(
    v,
    "formatVersion request recipeRevision inputDigest startedAt completedAt status coordinate anchorIntegrity blockFreshness historicalIntegrity canonicalAcceptance failure requestsUsed coverage observations limitations",
  );
  if (
    v.formatVersion !== 1 ||
    v.historicalIntegrity !== "not-assessed" ||
    v.canonicalAcceptance !== "unreviewed"
  )
    return invalid();
  const req = request(v.request, false),
    startedAt = uint(v.startedAt),
    completedAt = uint(v.completedAt);
  if (BigInt(completedAt) < BigInt(startedAt)) invalid();
  let coordinate: EvidenceReport["coordinate"] = null;
  if (v.coordinate !== null) {
    const c = obj(v.coordinate);
    keys(c, "chainId blockNumber blockHash blockTimestamp");
    coordinate = {
      chainId: uint(c.chainId),
      blockNumber: uint(c.blockNumber),
      blockHash: hash(c.blockHash),
      blockTimestamp: uint(c.blockTimestamp),
    };
    if (BigInt(coordinate.chainId) !== getNetwork(req.networkId).evmChainId) invalid();
  }
  const observations = values(v.observations).map(observation),
    coverage = obj(v.coverage);
  keys(coverage, "planned collected");
  const ids = [
    "network.identity",
    ...(req.recipe === "runtime.current" || req.recipe === "incentives.configuration"
      ? req.contractIds.map((id) => `runtime:${id}`)
      : req.recipe === "price.skip"
        ? ["price.skip"]
        : []),
    ...plannedIncentives(req).map((c) => c.id),
  ];
  const planned = count(coverage.planned, 1, 101),
    collected = count(coverage.collected, 0, planned);
  if (
    observations.length !== planned ||
    planned !== ids.length ||
    observations.some((o, i) => o.id !== ids[i]) ||
    collected !== observations.filter((o) => o.observed !== null).length
  )
    invalid();
  for (const [index, item] of observations.entries()) {
    if (
      item.unit !==
      (index === 0
        ? "chain-id"
        : req.recipe === "price.skip"
          ? "usd-per-btc"
          : req.recipe === "incentives.configuration" && index > req.contractIds.length
            ? plannedIncentives(req)[index - req.contractIds.length - 1]?.unit
            : "runtime-identity")
    )
      invalid();
    if (item.status === "unavailable" && item.error === null) invalid();
    if (item.unit !== "usd-per-btc" && item.freshness !== "not-evaluated") invalid();
    if (item.unit === "chain-id") {
      if (item.expected !== getNetwork(req.networkId).evmChainId.toString()) invalid();
      if (
        item.observed !== null &&
        (item.status !== (item.expected === item.observed ? "match" : "conflict") ||
          item.error !== (item.expected === item.observed ? null : "wrong-chain"))
      )
        invalid();
      if (coordinate !== null && item.observed !== coordinate.chainId) invalid();
    }
    if (item.unit === "runtime-identity" && item.observed !== null) {
      if (coordinate === null || item.expected === null) invalid();
      const same = JSON.stringify(item.expected) === JSON.stringify(item.observed);
      if (
        item.status !== (same ? "match" : "conflict") ||
        item.error !== (same ? null : "runtime-changed")
      )
        invalid();
    }
    if (
      item.unit === "incentive-configuration" ||
      item.unit === "incentive-state" ||
      item.unit === "incentive-metadata"
    ) {
      const claim = incentiveClaims(req).find((c) => `incentive:${c.id}` === item.id);
      if (
        !claim ||
        JSON.stringify(item.expected) !==
          JSON.stringify(
            claim.expected === null ? null : { valueUnit: claim.unit, value: claim.expected },
          )
      )
        invalid();
      if (item.observed !== null) {
        if (
          coordinate === null ||
          item.observed.valueUnit !== claim.unit ||
          !claim.supported ||
          observations.find((o) => o.id === `runtime:${claim.contractId}`)?.status !== "match"
        )
          invalid();
        const same = JSON.stringify(item.expected) === JSON.stringify(item.observed);
        const conflict = !same && item.unit === "incentive-configuration";
        if (
          item.status !== (same ? "match" : conflict ? "conflict" : "observed") ||
          item.error !== (conflict ? "configuration-changed" : null)
        )
          invalid();
      }
    }
    if (item.unit === "usd-per-btc" && item.observed !== null) {
      if (
        coordinate === null ||
        BigInt(item.observed.publishedAt) > BigInt(coordinate.blockTimestamp) ||
        BigInt(coordinate.blockTimestamp) > BigInt(completedAt)
      )
        invalid();
      const positive = BigInt(item.observed.answer) > 0n;
      if (
        item.status !== (positive ? "observed" : "conflict") ||
        item.error !== (positive ? null : "invalid-price")
      )
        invalid();
      const pf = evaluatePriceFreshness({
        publishedAt: item.observed.publishedAt === "0" ? null : BigInt(item.observed.publishedAt),
        asOf: BigInt(completedAt),
        maxAgeSeconds: BigInt(req.policy.maxPriceAgeSeconds),
      });
      const expected =
        pf.status === "valid"
          ? "fresh"
          : pf.status === "future-dated"
            ? "future"
            : pf.status === "missing-time"
              ? "missing"
              : "stale";
      if (item.freshness !== expected) invalid();
    }
  }
  if (coordinate !== null) {
    const bf = evaluatePriceFreshness({
      publishedAt: BigInt(coordinate.blockTimestamp),
      asOf: BigInt(completedAt),
      maxAgeSeconds: BigInt(req.policy.maxBlockAgeSeconds),
    });
    if (
      v.blockFreshness !==
      (bf.status === "valid" ? "fresh" : bf.status === "future-dated" ? "future" : "stale")
    )
      invalid();
  } else if (v.blockFreshness !== "not-evaluated") invalid();
  const status = select(v.status, ["complete", "partial", "failed", "cancelled"]),
    anchorIntegrity = select(v.anchorIntegrity, ["consistent", "changed", "unavailable"]);
  if (anchorIntegrity !== "unavailable" && coordinate === null) invalid();
  if ((status === "cancelled") !== (v.failure === "cancelled")) invalid();
  if (status === "failed" && coordinate !== null) invalid();
  if (
    status === "complete" &&
    (coordinate === null ||
      anchorIntegrity !== "consistent" ||
      collected !== planned ||
      v.failure !== null)
  )
    invalid();
  const limitations = values(v.limitations).map((v) => {
    if (typeof v !== "string" || v.length > 2000) return invalid();
    return v;
  });
  return freeze({
    formatVersion: 1,
    request: req,
    recipeRevision: word(v.recipeRevision),
    inputDigest: digest(v.inputDigest),
    startedAt,
    completedAt,
    status,
    coordinate,
    anchorIntegrity,
    blockFreshness: freshness(v.blockFreshness),
    historicalIntegrity: "not-assessed",
    canonicalAcceptance: "unreviewed",
    failure: failure(v.failure),
    requestsUsed: count(v.requestsUsed, 0, req.policy.maxRequests),
    coverage: { planned, collected },
    observations,
    limitations,
  });
}
/** Validate application progress records, independently of the final report. */
export function parseEvidenceProgress(value: unknown): EvidenceProgress {
  const v = obj(value);
  keys(v, "formatVersion runId sequence phase collected planned");
  if (v.formatVersion !== 1) return invalid();
  const planned = count(v.planned, 1, 101);
  return freeze({
    formatVersion: 1,
    runId: word(v.runId),
    sequence: count(v.sequence, 0, 10000),
    phase: select(v.phase, ["started", "claim", "finished"]),
    collected: count(v.collected, 0, planned),
    planned,
  });
}
