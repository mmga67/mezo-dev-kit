import { getNetwork } from "@mezo-dev-kit/chains";
import {
  createContractRegistry,
  isContractId,
  resolveContract,
  resolveRuntimeIdentity,
} from "@mezo-dev-kit/contracts";
import { createRpcTransport, ExecutionError } from "@mezo-dev-kit/core";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import {
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  sha256,
} from "@mezo-dev-kit/evm";
import { createSkipPriceReader, evaluatePriceFreshness } from "@mezo-dev-kit/prices";
import { evidenceCapabilities } from "./catalog.ts";
import { EVIDENCE_INPUTS } from "./inputs.generated.ts";
import { incentiveClaims, plannedIncentives, readIncentiveField } from "./incentives.ts";
import { freeze, parseEvidenceReport, parseEvidenceRequest } from "./validation.ts";
import { EvidenceError } from "./types.ts";
import type {
  EvidenceFailure,
  EvidenceFreshness,
  EvidenceObservation,
  EvidencePorts,
  EvidenceReport,
  EvidenceRequest,
  RuntimeEvidenceValue,
} from "./types.ts";

class ProgressError extends Error {
  constructor(cause: unknown) {
    super("Consumer progress callback failed", { cause });
  }
}
function failure(error: unknown): EvidenceFailure {
  if (error instanceof ExecutionError && error.code === "InvalidTransaction")
    return "runtime-changed";
  return error instanceof EvidenceError && error.code !== "invalid-input"
    ? error.code
    : "invalid-response";
}
function freshness(publishedAt: bigint, asOf: bigint, maxAge: string): EvidenceFreshness {
  const result = evaluatePriceFreshness({ publishedAt, asOf, maxAgeSeconds: BigInt(maxAge) });
  return result.status === "valid"
    ? "fresh"
    : result.status === "future-dated"
      ? "future"
      : result.status === "missing-time"
        ? "missing"
        : "stale";
}
/** Read-only bounded capture. URLs, wallets, filesystem, acceptance and scheduling stay outside. */
export async function refreshEvidence(
  input: EvidenceRequest,
  ports: EvidencePorts,
): Promise<EvidenceReport> {
  const request = parseEvidenceRequest(input),
    network = getNetwork(request.networkId),
    signal = ports.signal ?? new AbortController().signal;
  if (typeof ports.request !== "function" || typeof ports.now !== "function")
    throw new EvidenceError("invalid-input");
  const startedAt = parseUint(ports.now());
  const base = { status: "not-run" as const, error: null, freshness: "not-evaluated" as const };
  const observations: EvidenceObservation[] = [
    {
      ...base,
      id: "network.identity",
      unit: "chain-id",
      expected: network.evmChainId.toString(),
      observed: null,
      sourceRefs: [`networks:${network.id}`],
    },
    ...(request.recipe === "runtime.current" || request.recipe === "incentives.configuration"
      ? request.contractIds.map((id) => ({
          ...base,
          id: `runtime:${id}`,
          unit: "runtime-identity" as const,
          expected: null,
          observed: null,
          sourceRefs: ["contracts:contract-deployments"],
        }))
      : []),
    ...plannedIncentives(request),
    ...(request.recipe === "price.skip"
      ? [
          {
            ...base,
            id: "price.skip",
            unit: "usd-per-btc" as const,
            expected: null,
            observed: null,
            sourceRefs: ["prices:price-sources-feeds"],
          },
        ]
      : []),
  ];
  let used = 0,
    sequence = 0,
    coordinate: ReadCoordinate | null = null,
    blockTimestamp: bigint | null = null;
  let integrity: EvidenceReport["anchorIntegrity"],
    blockFreshness: EvidenceFreshness = "not-evaluated",
    runFailure: EvidenceFailure | null = null;
  const collected = () => observations.filter((o) => o.observed !== null).length;
  const progress = (phase: "started" | "claim" | "finished") => {
    try {
      ports.onProgress?.(
        freeze({
          formatVersion: 1,
          runId: request.runId,
          sequence: sequence++,
          phase,
          collected: collected(),
          planned: observations.length,
        }),
      );
    } catch (error) {
      throw new ProgressError(error);
    }
  };
  const set = (index: number, value: EvidenceObservation) => {
    observations[index] = freeze(value);
    progress("claim");
  };
  // Core's price reader issues independent reads together. Serialize them here so the
  // same request ceiling, cancellation and retry budget apply to every adapter call.
  let queue: Promise<unknown> = Promise.resolve();
  function rpc(input: {
    readonly method: string;
    readonly params: readonly unknown[];
  }): Promise<unknown> {
    const pending = queue.then(async () => {
      for (let attempt = 1; attempt <= request.policy.maxAttempts; attempt++) {
        if (signal.aborted) throw new EvidenceError("cancelled");
        if (used >= request.policy.maxRequests) throw new EvidenceError("request-budget");
        used++;
        let result: unknown;
        try {
          result = await ports.request({
            ...input,
            signal,
            timeoutMs: request.policy.timeoutMs,
            maxResponseBytes: request.policy.maxResponseBytes,
          });
        } catch (error) {
          if (signal.aborted) throw new EvidenceError("cancelled");
          const safe =
            error instanceof EvidenceError ? error : new EvidenceError("transport-error", true);
          if (safe.retryable && attempt < request.policy.maxAttempts) continue;
          throw safe;
        }
        if (signal.aborted) throw new EvidenceError("cancelled");
        try {
          const encoded = JSON.stringify(result);
          if (encoded === undefined) throw new EvidenceError("invalid-response");
          if (new TextEncoder().encode(encoded).byteLength > request.policy.maxResponseBytes)
            throw new EvidenceError("response-too-large");
          if (
            coordinate &&
            input.method === "eth_chainId" &&
            parseRpcQuantity(result) !== coordinate.chainId
          )
            throw new EvidenceError("wrong-chain");
          if (coordinate && input.method === "eth_getBlockByNumber") {
            if (
              !result ||
              typeof result !== "object" ||
              !("number" in result) ||
              !("hash" in result) ||
              !("timestamp" in result)
            )
              throw new EvidenceError("reorg");
            if (
              parseRpcQuantity(result.number) !== coordinate.blockNumber ||
              parseHash32(result.hash) !== coordinate.blockHash ||
              (blockTimestamp !== null && parseRpcQuantity(result.timestamp) !== blockTimestamp)
            )
              throw new EvidenceError("reorg");
          }
        } catch (error) {
          throw error instanceof EvidenceError ? error : new EvidenceError("invalid-response");
        }
        return result;
      }
      throw new EvidenceError("transport-error");
    });
    queue = pending.catch(() => undefined);
    return pending;
  }
  const transport = createRpcTransport({ id: request.providerId, request: rpc });
  progress("started");
  try {
    const actual = parseUint(await transport.getChainId()).toString();
    set(0, {
      ...observations[0]!,
      unit: "chain-id",
      expected: network.evmChainId.toString(),
      observed: actual,
      status: actual === network.evmChainId.toString() ? "match" : "conflict",
      error: actual === network.evmChainId.toString() ? null : "wrong-chain",
    });
    if (actual !== network.evmChainId.toString()) throw new EvidenceError("wrong-chain");
    const number = parseUint(await transport.getBlockNumber()),
      block = await transport.getBlock(number);
    if (!block || parseUint(block.number) !== number) throw new EvidenceError("invalid-response");
    coordinate = {
      networkId: network.id,
      chainId: network.evmChainId,
      blockNumber: number,
      blockHash: parseHash32(block.hash),
    };
    blockTimestamp = await transport.getBlockTimestamp(coordinate);
    const asOf = parseUint(ports.now());
    if (asOf < startedAt) throw new EvidenceError("invalid-input");
    blockFreshness = freshness(blockTimestamp, asOf, request.policy.maxBlockAgeSeconds);
    for (let index = 1; index < observations.length; index++) {
      const planned = observations[index]!;
      try {
        if (signal.aborted) throw new EvidenceError("cancelled");
        if (planned.unit === "runtime-identity") {
          const contractId = planned.id.slice("runtime:".length);
          if (!isContractId(contractId)) throw new EvidenceError("unavailable");
          const contract = resolveContract({
            contractId,
            networkId: network.id,
            blockNumber: number,
          });
          const identity = resolveRuntimeIdentity({
            contractId,
            networkId: network.id,
            blockNumber: number,
          });
          const hash = (code: unknown) => sha256(parseHexData(code)).slice(2);
          const currentExpected: RuntimeEvidenceValue = {
            address: contract.address,
            addressCodeSha256: identity.addressCodeSha256,
            implementationAddress:
              identity.implementationSlot === null ? null : contract.implementationAddress,
            implementationCodeSha256: identity.implementationCodeSha256,
            implementationSlotValue:
              identity.implementationSlot === null || contract.implementationAddress === null
                ? null
                : `0x${"0".repeat(24)}${contract.implementationAddress.slice(2)}`,
          };
          // Storage layout and field semantics are bound to the recipe's baseline generation.
          // A newly accepted registry generation must not silently rebind this old recipe.
          const expected =
            request.recipe === "incentives.configuration"
              ? EVIDENCE_INPUTS.incentives.runtimes.find((r) => r.contractId === contractId)
                  ?.expected
              : currentExpected;
          if (!expected) throw new EvidenceError("unavailable");
          const addressCodeSha256 = hash(await transport.getCode(contract.address, coordinate));
          const implementationSlotValue =
            identity.implementationSlot === null
              ? null
              : await transport.getStorage(
                  contract.address,
                  identity.implementationSlot,
                  coordinate,
                );
          const implementationAddress =
            implementationSlotValue === null
              ? null
              : parseAddress(`0x${implementationSlotValue.slice(-40)}`);
          const implementationCodeSha256 =
            implementationAddress === null
              ? null
              : hash(await transport.getCode(implementationAddress, coordinate));
          const observed: RuntimeEvidenceValue = {
            address: contract.address,
            addressCodeSha256,
            implementationAddress,
            implementationCodeSha256,
            implementationSlotValue,
          };
          const match = JSON.stringify(expected) === JSON.stringify(observed);
          set(index, {
            ...planned,
            expected,
            observed,
            status: match ? "match" : "conflict",
            error: match ? null : "runtime-changed",
          });
        } else if (
          planned.unit === "incentive-configuration" ||
          planned.unit === "incentive-state" ||
          planned.unit === "incentive-metadata"
        ) {
          const claim = incentiveClaims(request).find((c) => `incentive:${c.id}` === planned.id);
          const identity = observations.find((o) => o.id === `runtime:${claim?.contractId}`);
          if (identity?.status !== "match")
            throw new EvidenceError(
              identity?.error === "runtime-changed" ? "runtime-changed" : "unavailable",
            );
          const observed = await readIncentiveField(planned.id, request, coordinate, transport);
          const same = JSON.stringify(observed) === JSON.stringify(planned.expected);
          const conflict = !same && planned.unit === "incentive-configuration";
          set(index, {
            ...planned,
            observed,
            status: same ? "match" : conflict ? "conflict" : "observed",
            error: conflict ? "configuration-changed" : null,
          });
        } else if (planned.unit === "usd-per-btc") {
          if (blockFreshness === "future") throw new EvidenceError("invalid-response");
          const price = await createSkipPriceReader({
            networkId: network.id,
            registry: createContractRegistry(),
            transport,
          }).read({
            blockNumber: number,
            asOf,
            observedAt: asOf,
            maxAgeSeconds: BigInt(request.policy.maxPriceAgeSeconds),
            targetDecimals: EVIDENCE_INPUTS.skip.sourceDecimals,
            rounding: "toward-zero",
            allowPrecisionLoss: false,
          });
          const observed = {
            answer: price.round.answer.toString(),
            decimals: price.targetDecimals,
            roundId: price.round.roundId.toString(),
            startedAt: price.round.startedAt.toString(),
            publishedAt: price.round.updatedAt.toString(),
            answeredInRound: price.round.answeredInRound.toString(),
            confidence: null,
          };
          set(index, {
            ...planned,
            observed,
            status: price.normalization.status === "valid" ? "observed" : "conflict",
            error: price.normalization.status === "valid" ? null : "invalid-price",
            freshness:
              price.freshness.status === "valid"
                ? "fresh"
                : price.freshness.status === "future-dated"
                  ? "future"
                  : price.freshness.status === "missing-time"
                    ? "missing"
                    : "stale",
          });
        }
      } catch (error) {
        if (error instanceof ProgressError) throw error;
        const code = failure(error);
        set(index, {
          ...planned,
          status: code === "cancelled" ? "not-run" : "unavailable",
          error: code,
        });
        if (["reorg", "wrong-chain", "cancelled", "request-budget"].includes(code))
          throw new EvidenceError(code);
      }
    }
    await transport.getBlock(number);
    await transport.getChainId();
    integrity = "consistent";
  } catch (error) {
    if (error instanceof ProgressError) {
      await queue;
      throw error.cause;
    }
    runFailure = failure(error);
    integrity =
      coordinate && ["reorg", "wrong-chain"].includes(runFailure) ? "changed" : "unavailable";
    if (observations[0]?.status === "not-run")
      set(0, {
        ...observations[0],
        status: runFailure === "cancelled" ? "not-run" : "unavailable",
        error: runFailure,
      });
  }
  // Drain any already queued price calls before taking the final immutable snapshot.
  await queue;
  if (signal.aborted) runFailure = "cancelled";
  const completedAt = parseUint(ports.now());
  if (completedAt < startedAt) throw new EvidenceError("invalid-input");
  if (blockTimestamp !== null)
    blockFreshness = freshness(blockTimestamp, completedAt, request.policy.maxBlockAgeSeconds);
  for (const [index, observation] of observations.entries()) {
    if (observation.unit === "usd-per-btc" && observation.observed !== null) {
      observations[index] = freeze({
        ...observation,
        freshness:
          observation.observed.publishedAt === "0"
            ? "missing"
            : freshness(
                BigInt(observation.observed.publishedAt),
                completedAt,
                request.policy.maxPriceAgeSeconds,
              ),
      });
    }
  }
  const status =
    runFailure === "cancelled"
      ? "cancelled"
      : coordinate === null
        ? "failed"
        : integrity === "consistent" && observations.every((o) => o.observed !== null)
          ? "complete"
          : collected() > 0
            ? "partial"
            : "failed";
  const report = parseEvidenceReport({
    formatVersion: 1,
    request,
    recipeRevision: EVIDENCE_INPUTS.revision,
    inputDigest: EVIDENCE_INPUTS.inputDigest,
    startedAt: startedAt.toString(),
    completedAt: completedAt.toString(),
    status,
    coordinate:
      coordinate && blockTimestamp !== null
        ? {
            chainId: coordinate.chainId.toString(),
            blockNumber: coordinate.blockNumber.toString(),
            blockHash: coordinate.blockHash,
            blockTimestamp: blockTimestamp.toString(),
          }
        : null,
    anchorIntegrity: integrity,
    blockFreshness,
    historicalIntegrity: "not-assessed",
    canonicalAcceptance: "unreviewed",
    failure: runFailure,
    requestsUsed: used,
    coverage: { planned: observations.length, collected: collected() },
    observations,
    limitations: [
      ...evidenceCapabilities().limitations,
      "A single provider's response is an observation, not an independent consensus proof.",
      "Runtime checks cover address code and registered implementation slots/code; proxy admin, source reproduction, dynamic discovery and mechanics are outside this recipe.",
    ],
  });
  progress("finished");
  return report;
}
