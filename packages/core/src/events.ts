import { createHash } from "node:crypto";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import {
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  parseUnsignedInteger,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { rpcObject } from "./rpc.ts";
import type {
  EventAnchor,
  EventCheckpoint,
  EventRange,
  EventScanner,
  EventScannerConfig,
  EventScanInput,
  EventScanIssue,
  EventScanResult,
  EventTopics,
  ScannedEvent,
} from "./event-types.ts";

export class EventScanError extends Error {
  readonly code: EventScanIssue | "invalid-input";
  constructor(code: EventScanIssue | "invalid-input", message: string) {
    super(message);
    this.name = "EventScanError";
    this.code = code;
  }
}
interface Header {
  readonly number: bigint;
  readonly hash: `0x${string}`;
  readonly parentHash: `0x${string}`;
  readonly timestamp: bigint;
}
function fail(code: EventScanIssue | "invalid-input", message: string): never {
  throw new EventScanError(code, message);
}
function bounded(value: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    fail("invalid-input", `${label} is outside scanner limits`);
  return value;
}
function identity(source: ResolvedContract): string {
  return [
    source.networkId,
    source.contractId,
    source.deploymentId,
    source.address,
    source.currentCodeFromBlock,
    source.implementationAddress,
    source.abi.abiSemanticSha256,
  ].join(":");
}
function topics(input: EventTopics): EventTopics {
  if (!Array.isArray(input) || input.length > 4)
    fail("invalid-input", "topics must contain at most four positions");
  return Object.freeze(
    input.map((topic: unknown) => {
      if (topic === null) return null;
      if (Array.isArray(topic)) {
        bounded(topic.length, 64, "topic alternatives");
        return Object.freeze(
          [...new Set(topic.map((entry: unknown) => parseHash32(entry)))].sort(),
        );
      }
      return parseHash32(topic);
    }),
  );
}
function decimal(value: unknown): bigint {
  if (typeof value !== "string" || value.length > 78)
    fail("invalid-input", "invalid checkpoint block");
  return parseUint(parseUnsignedInteger(value));
}
function checkpoint(
  value: unknown,
  queryId: string,
  from: bigint,
  to: bigint,
  window: number,
): EventCheckpoint | null {
  if (value === undefined) return null;
  const item = rpcObject(value);
  if (
    item.schemaVersion !== 1 ||
    item.queryId !== queryId ||
    decimal(item.fromBlock) !== from ||
    !Array.isArray(item.anchors)
  )
    fail("invalid-input", "incompatible checkpoint");
  const through = decimal(item.throughBlock);
  if (
    through < from ||
    through > to ||
    item.anchors.length !==
      Number(through - from + 1n < BigInt(window) ? through - from + 1n : BigInt(window))
  )
    fail("invalid-input", "invalid checkpoint anchor window");
  let expected = through - BigInt(item.anchors.length) + 1n;
  const anchors = item.anchors.map((raw: unknown) => {
    const anchor = rpcObject(raw),
      number = decimal(anchor.blockNumber);
    if (number !== expected++) fail("invalid-input", "checkpoint anchors must be contiguous");
    return Object.freeze({
      blockNumber: number.toString(),
      blockHash: parseHash32(anchor.blockHash),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    queryId,
    fromBlock: from.toString(),
    throughBlock: through.toString(),
    anchors: Object.freeze(anchors),
  });
}
function matches(filter: EventTopics, actual: readonly `0x${string}`[]): boolean {
  return filter.every(
    (topic, index) =>
      actual[index] !== undefined &&
      (topic === null ||
        (Array.isArray(topic) ? topic.includes(actual[index]) : topic === actual[index])),
  );
}

/** Bounded raw logs from one current registered generation. No storage, decoding or outcome inference. */
export function createEventScanner(config: EventScannerConfig): Readonly<EventScanner> {
  const network = getNetwork(config.networkId),
    policy = Object.freeze({ ...config.policy });
  for (const label of ["providerId", "capabilityEvidenceId"] as const)
    if (
      typeof config[label] !== "string" ||
      config[label].trim() !== config[label] ||
      config[label].length < 1 ||
      config[label].length > 256
    )
      fail("invalid-input", `invalid ${label}`);
  if (typeof config.request !== "function") fail("invalid-input", "request is required");
  bounded(policy.blocksPerPage, 1000, "blocksPerPage");
  bounded(policy.maxPages, 100, "maxPages");
  bounded(policy.blocksPerPage * policy.maxPages, 10000, "total blocks");
  bounded(policy.maxLogsPerPage, 10000, "maxLogsPerPage");
  bounded(policy.maxLogsPerPage * policy.maxPages, 100000, "total logs");
  bounded(policy.maxLogDataBytes, 65536, "maxLogDataBytes");
  bounded(policy.overlapBlocks, 1000, "overlapBlocks");
  if (policy.overlapBlocks >= policy.blocksPerPage * policy.maxPages)
    fail("invalid-input", "scan budget must exceed overlap to make progress");
  if (parseUint(policy.confirmations) < 1n) fail("invalid-input", "confirmations must be positive");
  bounded(policy.requestTimeoutMs, 60000, "requestTimeoutMs");
  const { registry, request, providerId, capabilityEvidenceId } = config;
  return Object.freeze({
    async scan(input: EventScanInput): Promise<Readonly<EventScanResult>> {
      const from = parseUint(input.fromBlock),
        to = parseUint(input.toBlock),
        observedAt = parseUint(input.observedAt),
        maxAge = parseUint(input.maxHeadAgeSeconds);
      if (from > to) fail("invalid-input", "reversed event range");
      const filter = topics(input.topics);
      const source = registry.resolve({
        networkId: network.id,
        contractId: input.contractId,
        blockNumber: from,
      });
      const sourceKey = identity(source);
      const sourceId = createHash("sha256").update(sourceKey).digest("hex");
      const queryId = createHash("sha256")
        .update(JSON.stringify([sourceKey, from.toString(), filter]))
        .digest("hex");
      const previous = checkpoint(input.checkpoint, queryId, from, to, policy.overlapBlocks);
      const start = previous ? BigInt(previous.anchors[0]!.blockNumber) : from;
      let confirmedHead: bigint | null = null,
        through: bigint | null = null;
      let candidate: Readonly<EventCheckpoint> | null = null;
      let anchors: readonly Readonly<EventAnchor>[] = [];
      let events: Readonly<ScannedEvent>[] = [];
      let retainedBytes = 0;
      const committedAnchors = new Map(
        previous?.anchors.map((anchor) => [BigInt(anchor.blockNumber), anchor.blockHash]),
      );
      const transactions = new Map<string, string>();
      async function rpc(method: string, params: readonly unknown[]): Promise<unknown> {
        if (input.signal?.aborted) fail("aborted", "scan aborted");
        let timer: ReturnType<typeof setTimeout> | undefined;
        let onAbort: (() => void) | undefined;
        try {
          return await Promise.race([
            Promise.resolve()
              .then(() => request({ method, params }))
              .catch(() => fail("provider-failure", "provider request failed")),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new EventScanError("timeout", "provider request timed out"));
              }, policy.requestTimeoutMs);
              onAbort = () => {
                reject(new EventScanError("aborted", "scan aborted"));
              };
              input.signal?.addEventListener("abort", onAbort, { once: true });
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
          if (onAbort) input.signal?.removeEventListener("abort", onAbort);
        }
      }
      async function header(number: bigint): Promise<Header> {
        const raw = rpcObject(await rpc("eth_getBlockByNumber", [toRpcQuantity(number), false]));
        if (parseRpcQuantity(raw.number) !== number)
          fail("invalid-response", "provider returned another block");
        return Object.freeze({
          number,
          hash: parseHash32(raw.hash),
          parentHash: parseHash32(raw.parentHash),
          timestamp: parseRpcQuantity(raw.timestamp),
        });
      }
      async function checkChain() {
        if (parseRpcQuantity(await rpc("eth_chainId", [])) !== network.evmChainId)
          fail("chain-mismatch", "event provider chain mismatch");
      }
      function result(
        issue: EventScanIssue | null,
        reorg: EventScanResult["reorg"] = null,
      ): Readonly<EventScanResult> {
        const covered =
          through === null ? null : Object.freeze({ fromBlock: start, toBlock: through });
        const gaps: Readonly<EventRange>[] =
          through === to
            ? []
            : [
                Object.freeze({
                  fromBlock: reorg?.invalidatedFrom ?? (through === null ? start : through + 1n),
                  toBlock: to,
                }),
              ];
        return Object.freeze({
          status:
            reorg || issue === "reorg"
              ? "reorged"
              : issue === null
                ? "complete"
                : covered
                  ? "partial"
                  : "unknown",
          queryId,
          source,
          providerId,
          capabilityEvidenceId,
          observedAt,
          requested: Object.freeze({ fromBlock: from, toBlock: to }),
          resumedThrough: previous ? BigInt(previous.throughBlock) : null,
          covered,
          gaps: Object.freeze(gaps),
          confirmedHead,
          events: Object.freeze(events),
          checkpoint: candidate,
          issue,
          reorg,
        });
      }
      try {
        await checkChain();
        const headNumber = parseRpcQuantity(await rpc("eth_blockNumber", [])),
          head = await header(headNumber);
        if (head.timestamp > observedAt || observedAt - head.timestamp > maxAge)
          return result("stale-head");
        confirmedHead =
          headNumber + 1n >= policy.confirmations ? headNumber + 1n - policy.confirmations : null;
        if (previous) {
          let rollbackTo: Readonly<EventAnchor> | null = null,
            changed = false;
          for (const anchor of previous.anchors) {
            const block = BigInt(anchor.blockNumber);
            if (block > headNumber || (await header(block)).hash !== anchor.blockHash)
              changed = true;
            else if (!changed) rollbackTo = anchor;
          }
          if (changed)
            return result(
              "reorg",
              Object.freeze({
                rollbackTo,
                invalidatedFrom: rollbackTo ? BigInt(rollbackTo.blockNumber) + 1n : from,
              }),
            );
          if (confirmedHead === null || confirmedHead < BigInt(previous.throughBlock))
            return result("unconfirmed");
        }
        if (confirmedHead === null || confirmedHead < start) return result("unconfirmed");
        const end = to < confirmedHead ? to : confirmedHead;
        let cursor = start,
          pages = 0;
        while (cursor <= end && pages < policy.maxPages) {
          const last =
            cursor + BigInt(policy.blocksPerPage) - 1n < end
              ? cursor + BigInt(policy.blocksPerPage) - 1n
              : end;
          for (const number of [cursor, last])
            if (
              identity(
                registry.resolve({
                  networkId: network.id,
                  contractId: input.contractId,
                  blockNumber: number,
                }),
              ) !== sourceKey
            )
              fail("source-changed", "range crosses a registered source generation");
          const headers = new Map<bigint, Header>();
          let parent = anchors.at(-1)?.blockHash;
          for (let number = cursor; number <= last; number++) {
            const value = await header(number);
            const committed = committedAnchors.get(number);
            if (committed && committed !== value.hash)
              fail("reorg", "checkpoint changed while re-reading overlap");
            if (parent && value.parentHash !== parent)
              fail("reorg", "block ancestry changed during scan");
            headers.set(number, value);
            parent = value.hash;
          }
          const response = await rpc("eth_getLogs", [
            {
              address: source.address,
              fromBlock: toRpcQuantity(cursor),
              toBlock: toRpcQuantity(last),
              topics: filter,
            },
          ]);
          if (!Array.isArray(response)) fail("invalid-response", "provider logs are not an array");
          if (response.length >= policy.maxLogsPerPage) return result("log-limit");
          const unique = new Map<string, Readonly<ScannedEvent>>();
          let pageBytes = 0;
          for (const raw of response) {
            const log = rpcObject(raw),
              number = parseRpcQuantity(log.blockNumber),
              block = headers.get(number);
            if (
              parseHash32(log.blockHash) !== block?.hash ||
              parseAddress(log.address) !== source.address ||
              log.removed !== false ||
              !Array.isArray(log.topics) ||
              log.topics.length > 4 ||
              typeof log.data !== "string" ||
              log.data.length > 2 + 2 * policy.maxLogDataBytes
            )
              fail("invalid-response", "log is outside the validated source or coordinate");
            const logTopics = Object.freeze(log.topics.map((entry: unknown) => parseHash32(entry)));
            if (!matches(filter, logTopics)) fail("invalid-response", "log does not match topics");
            const transactionHash = parseHash32(log.transactionHash),
              logIndex = parseRpcQuantity(log.logIndex);
            const item = Object.freeze({
              id: `${sourceId}:${transactionHash}:${logIndex}`,
              address: source.address,
              blockNumber: number,
              blockHash: block.hash,
              transactionHash,
              transactionIndex: parseRpcQuantity(log.transactionIndex),
              logIndex,
              topics: logTopics,
              data: parseHexData(log.data),
            });
            const existing = unique.get(item.id);
            if (
              existing &&
              (existing.blockNumber !== item.blockNumber ||
                existing.blockHash !== item.blockHash ||
                existing.transactionIndex !== item.transactionIndex ||
                existing.data !== item.data ||
                existing.topics.join() !== item.topics.join())
            )
              fail("invalid-response", "conflicting duplicate event");
            if (!existing) {
              unique.set(item.id, item);
              pageBytes += item.data.length / 2 + item.topics.length * 32 + 256;
            }
            if (retainedBytes + pageBytes > 16 * 1024 * 1024) return result("log-limit");
          }
          const page = [...unique.values()].sort((a, b) =>
            a.blockNumber < b.blockNumber
              ? -1
              : a.blockNumber > b.blockNumber
                ? 1
                : a.logIndex < b.logIndex
                  ? -1
                  : a.logIndex > b.logIndex
                    ? 1
                    : 0,
          );
          let preceding: ScannedEvent | undefined;
          for (const event of page) {
            const txCoordinate = `${event.blockNumber}:${event.transactionIndex}`,
              seen = transactions.get(event.transactionHash);
            if (seen !== undefined && seen !== txCoordinate)
              fail("invalid-response", "transaction appears at conflicting coordinates");
            transactions.set(event.transactionHash, txCoordinate);
            if (
              preceding?.blockNumber === event.blockNumber &&
              (preceding.logIndex === event.logIndex ||
                preceding.transactionIndex > event.transactionIndex ||
                (preceding.transactionIndex === event.transactionIndex &&
                  preceding.transactionHash !== event.transactionHash))
            )
              fail("invalid-response", "inconsistent event ordering");
            preceding = event;
          }
          if ((await header(last)).hash !== headers.get(last)!.hash)
            fail("reorg", "page anchor changed");
          await checkChain();
          events.push(...page);
          retainedBytes += pageBytes;
          through = last;
          anchors = Object.freeze(
            [
              ...anchors,
              ...[...headers.values()].map((value) =>
                Object.freeze({ blockNumber: value.number.toString(), blockHash: value.hash }),
              ),
            ].slice(-policy.overlapBlocks),
          );
          // Never regress a committed checkpoint while re-reading its overlap.
          if (!previous || last >= BigInt(previous.throughBlock))
            candidate = Object.freeze({
              schemaVersion: 1,
              queryId,
              fromBlock: from.toString(),
              throughBlock: last.toString(),
              anchors,
            });
          cursor = last + 1n;
          pages++;
        }
        return result(through === to ? null : cursor <= end ? "page-limit" : "unconfirmed");
      } catch (error) {
        const issue =
          error instanceof EventScanError && error.code !== "invalid-input"
            ? error.code
            : "invalid-response";
        if (issue === "reorg" || issue === "chain-mismatch") {
          through = null;
          candidate = null;
          events = [];
        }
        return result(issue);
      }
    },
  });
}
