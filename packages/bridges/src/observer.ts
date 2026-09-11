import { getNetwork } from "@mezo-dev-kit/chains";
import { resolveContract, resolveEvent } from "@mezo-dev-kit/contracts";
import { getReceiptLogs } from "@mezo-dev-kit/core";
import type { ExecutionReceipt } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { Hash32 } from "@mezo-dev-kit/evm";
import { NttObserverError } from "./errors.ts";
import { NTT_ROUTES } from "./model.generated.ts";
import { messageDigest } from "./message.ts";
import type {
  NttDeliveryObservation,
  NttDeliveryObserver,
  NttObservationIssue,
  NttObservationTransport,
  NttObserveInput,
  NttObserverConfig,
  NttReceiptAnchor,
  NttReceiptObservation,
} from "./types.ts";

type Endpoint = (typeof NTT_ROUTES)[number]["source"];
interface Context {
  readonly endpoint: Endpoint;
  readonly transport: NttObservationTransport;
  readonly required: bigint;
  readonly manager: Hash32;
}
interface Inspected {
  observation: NttReceiptObservation;
  readonly receipt: ExecutionReceipt | null;
}
const codec = createAbiCodec();
function invalid(stage: string, message: string): never {
  throw new NttObserverError("InvalidInput", stage, message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new NttObserverError("InvalidEvidence", "receipt", "expected receipt object");
  return value as Record<string, unknown>;
}
function issue(error: unknown, stage: string): NttObservationIssue {
  return Object.freeze(
    error instanceof NttObserverError
      ? { code: error.code, stage: error.stage, message: error.message }
      : { code: "InvalidEvidence", stage, message: "invalid receipt or event evidence" },
  );
}
async function request<T>(stage: string, read: () => T | PromiseLike<T>): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    throw new NttObserverError("TransportFailure", stage, "observation transport failed", {
      cause,
    });
  }
}
async function assertChain(context: Pick<Context, "endpoint" | "transport">): Promise<void> {
  const chain = parseUint(await request("chain", () => context.transport.getChainId()));
  if (chain !== getNetwork(context.endpoint.networkId).evmChainId)
    throw new NttObserverError(
      "ChainMismatch",
      "chain",
      "transport does not match the selected route network",
    );
}
function contract(endpoint: Endpoint, blockNumber: bigint, transceiver = false) {
  try {
    return resolveContract({
      networkId: endpoint.networkId,
      blockNumber,
      contractId: transceiver ? endpoint.transceiverId : endpoint.managerId,
    });
  } catch (cause) {
    throw new NttObserverError(
      "RegistryUnavailable",
      "registry",
      "registered bridge identity unavailable at receipt coordinate",
      { cause },
    );
  }
}
function padded(address: string): Hash32 {
  return parseHash32(`0x${address.slice(2).padStart(64, "0")}`);
}
async function context(
  endpoint: Endpoint,
  transport: NttObservationTransport,
  required: bigint,
): Promise<Context> {
  await assertChain({ endpoint, transport });
  const head = parseUint(await request("head", () => transport.getBlockNumber()));
  return { endpoint, transport, required, manager: padded(contract(endpoint, head).address) };
}
function empty(hash: Hash32, required: bigint): NttReceiptObservation {
  return {
    transactionHash: hash,
    state: "missing",
    anchor: null,
    confirmations: null,
    requiredConfirmations: required,
    evidence: "none",
    digest: null,
    issue: null,
  };
}
function failed(
  value: NttReceiptObservation,
  error: unknown,
  stage: string,
): NttReceiptObservation {
  const problem = issue(error, stage);
  return {
    ...value,
    state: problem.code === "TransportFailure" ? "unavailable" : "invalid",
    issue: problem,
  };
}
async function canonical(ctx: Context, anchor: NttReceiptAnchor): Promise<boolean> {
  const block = await request("block", () => ctx.transport.getBlock(anchor.blockNumber));
  if (block === null || block === undefined) return false;
  if (parseUint(block.number) !== anchor.blockNumber)
    throw new NttObserverError(
      "InvalidEvidence",
      "block",
      "transport returned a different block number",
    );
  return parseHash32(block.hash) === anchor.blockHash;
}
function reorg(value: NttReceiptObservation): NttReceiptObservation {
  return { ...value, state: "reorged", issue: null };
}
async function inspect(
  ctx: Context,
  hash: Hash32,
  previous?: NttReceiptAnchor,
): Promise<Inspected> {
  let observation = empty(hash, ctx.required);
  try {
    const priorChanged = previous ? !(await canonical(ctx, previous)) : false;
    const raw = await request("receipt", () => ctx.transport.getReceipt(hash));
    if (raw === null)
      return {
        observation: priorChanged
          ? reorg({ ...observation, anchor: previous ?? null })
          : observation,
        receipt: null,
      };
    const row = object(raw);
    const transactionHash = parseHash32(row.transactionHash),
      blockHash = parseHash32(row.blockHash),
      blockNumber = parseRpcQuantity(row.blockNumber),
      status = parseRpcQuantity(row.status);
    if (
      transactionHash !== hash ||
      status > 1n ||
      !Array.isArray(row.logs) ||
      row.logs.length > 2048
    )
      throw new NttObserverError(
        "InvalidEvidence",
        "receipt",
        "receipt identity, status or log count is invalid",
      );
    let bytes = 0;
    const logs: readonly unknown[] = row.logs;
    for (const value of logs) {
      const log = object(value);
      const data = parseHexData(log.data);
      if (!Array.isArray(log.topics) || log.topics.length > 4 || data.length > 524290)
        throw new NttObserverError(
          "InvalidEvidence",
          "receipt",
          "receipt log exceeds observation limits",
        );
      bytes += (data.length - 2) / 2 + log.topics.length * 32;
      if (bytes > 8 * 1024 * 1024)
        throw new NttObserverError(
          "InvalidEvidence",
          "receipt",
          "receipt exceeds observation byte budget",
        );
    }
    const anchor = Object.freeze({ transactionHash, blockHash, blockNumber });
    observation = { ...observation, anchor };
    const head = parseUint(await request("head", () => ctx.transport.getBlockNumber()));
    const confirmations = head < blockNumber ? 0n : head - blockNumber + 1n;
    observation = {
      ...observation,
      confirmations,
      state: status === 0n ? "reverted" : confirmations >= ctx.required ? "confirmed" : "included",
    };
    const changed =
      priorChanged ||
      (previous !== undefined &&
        (previous.blockHash !== blockHash || previous.blockNumber !== blockNumber));
    if (changed || head < blockNumber || !(await canonical(ctx, anchor)))
      observation = reorg(observation);
    return { observation, receipt: { transactionHash, blockHash, blockNumber, logs } };
  } catch (error) {
    return { observation: failed(observation, error, "receipt"), receipt: null };
  }
}
function events(ctx: Context, receipt: ExecutionReceipt, eventName: string, transceiver = false) {
  const resolved = contract(ctx.endpoint, receipt.blockNumber, transceiver);
  const abi = resolveEvent({
    contractId: resolved.contractId,
    networkId: ctx.endpoint.networkId,
    blockNumber: receipt.blockNumber,
    eventName,
  });
  return getReceiptLogs(receipt, resolved.address).flatMap((log) => {
    // Anonymous/unrelated logs cannot match the selected non-anonymous event.
    if (log.topics.length === 0) return [];
    const values = codec.decodeEvent(abi, log);
    return values === null ? [] : [values];
  });
}
function decodeSource(
  ctx: Context,
  destination: Context,
  current: Inspected,
  expected?: Hash32,
): void {
  if (!current.receipt || !["included", "confirmed"].includes(current.observation.state)) return;
  try {
    const receipt = current.receipt;
    const sourceManager = padded(contract(ctx.endpoint, receipt.blockNumber).address);
    const matches = events(ctx, receipt, "SendTransceiverMessage", true).flatMap((values) => {
      const tuple = values[1];
      if (!Array.isArray(tuple) || tuple.length !== 4)
        throw new NttObserverError(
          "InvalidEvidence",
          "source-message",
          "invalid transceiver message tuple",
        );
      if (
        parseUint(values[0], 16) !== BigInt(destination.endpoint.wormholeChainId) ||
        parseHash32(tuple[0]) !== sourceManager ||
        parseHash32(tuple[1]) !== destination.manager
      )
        return [];
      const digest = messageDigest(BigInt(ctx.endpoint.wormholeChainId), tuple[2]);
      return expected === undefined || expected === digest ? [digest] : [];
    });
    if (matches.length === 1 && matches[0])
      current.observation = { ...current.observation, evidence: "sent", digest: matches[0] };
    else if (matches.length > 1)
      throw new NttObserverError(
        "InvalidEvidence",
        "source-message",
        "multiple matching messages; select one unique digest",
      );
    else if (expected === undefined && events(ctx, receipt, "OutboundTransferQueued").length === 1)
      current.observation = { ...current.observation, evidence: "outbound-queued" };
    else
      throw new NttObserverError(
        "InvalidEvidence",
        "source-message",
        "no unique message establishes the requested route and digest",
      );
  } catch (error) {
    current.observation = failed(current.observation, error, "source-message");
  }
}
function decodeDestination(ctx: Context, current: Inspected, digest: Hash32): void {
  if (!current.receipt || !["included", "confirmed"].includes(current.observation.state)) return;
  try {
    const receipt = current.receipt;
    if (padded(contract(ctx.endpoint, receipt.blockNumber).address) !== ctx.manager)
      throw new NttObserverError(
        "RegistryUnavailable",
        "registry",
        "destination manager generation requires reassessment",
      );
    const matches = (name: string) =>
      events(ctx, receipt, name).filter((values) => parseHash32(values[0]) === digest).length;
    const redeemed = matches("TransferRedeemed"),
      queued = matches("InboundTransferQueued");
    if (redeemed > 1 || queued > 1)
      throw new NttObserverError(
        "InvalidEvidence",
        "destination-message",
        "duplicate matching delivery evidence",
      );
    current.observation = {
      ...current.observation,
      evidence: redeemed ? "redeemed" : queued ? "inbound-queued" : "none",
      digest: redeemed || queued ? digest : null,
    };
  } catch (error) {
    current.observation = failed(current.observation, error, "destination-message");
  }
}
function parseAnchor(value: NttReceiptAnchor): NttReceiptAnchor {
  if (!value || typeof value !== "object") return invalid("previous", "invalid previous anchor");
  return Object.freeze({
    transactionHash: parseHash32(value.transactionHash),
    blockHash: parseHash32(value.blockHash),
    blockNumber: parseUint(value.blockNumber),
  });
}
async function finish(
  ctx: Context,
  values: readonly Inspected[],
): Promise<NttObservationIssue | null> {
  for (const current of values) {
    if (
      !current.observation.anchor ||
      !["included", "confirmed", "reverted"].includes(current.observation.state)
    )
      continue;
    try {
      if (!(await canonical(ctx, current.observation.anchor)))
        current.observation = reorg(current.observation);
    } catch (error) {
      current.observation = failed(current.observation, error, "final-block");
    }
  }
  try {
    await assertChain(ctx);
  } catch (error) {
    for (const current of values)
      current.observation = failed(current.observation, error, "final-chain");
    if (values.length === 0) return issue(error, "final-chain");
  }
  return null;
}

/** Observe a bounded historical receipt set. This never constructs or submits a bridge transfer. */
export function createNttDeliveryObserver(
  config: NttObserverConfig,
): Readonly<NttDeliveryObserver> {
  const selected = NTT_ROUTES.find((r) => r.id === config?.routeId);
  if (!selected)
    throw new NttObserverError("UnknownRoute", "config", "unknown NTT observation route");
  const route = selected;
  let sourceRequired: bigint, destinationRequired: bigint;
  try {
    sourceRequired = parseUint(config.sourceConfirmations);
    destinationRequired = parseUint(config.destinationConfirmations);
    if (sourceRequired === 0n || destinationRequired === 0n)
      invalid("config", "confirmations must be positive");
    for (const transport of [config.sourceTransport, config.destinationTransport])
      for (const key of ["getChainId", "getBlockNumber", "getBlock", "getReceipt"] as const)
        if (!transport || typeof transport[key] !== "function")
          invalid("config", "incomplete observation transport");
  } catch (cause) {
    if (cause instanceof NttObserverError) throw cause;
    throw new NttObserverError("InvalidInput", "config", "invalid observer configuration", {
      cause,
    });
  }
  const sourceTransport = config.sourceTransport,
    destinationTransport = config.destinationTransport;
  async function observe(input: NttObserveInput): Promise<Readonly<NttDeliveryObservation>> {
    let sourceHash: Hash32,
      hashes: Hash32[],
      expected: Hash32 | undefined,
      previousSource: NttReceiptAnchor | undefined,
      previousDestinations: NttReceiptAnchor[];
    try {
      if (
        !input ||
        !Array.isArray(input.destinationTransactionHashes) ||
        input.destinationTransactionHashes.length > 32
      )
        invalid("input", "provide at most 32 destination candidates");
      sourceHash = parseHash32(input.sourceTransactionHash);
      hashes = Array.from(input.destinationTransactionHashes, (hash) => parseHash32(hash));
      if (new Set(hashes).size !== hashes.length)
        invalid("input", "destination hashes must be unique");
      expected = input.expectedDigest === undefined ? undefined : parseHash32(input.expectedDigest);
      if (input.previous !== undefined && (!input.previous || typeof input.previous !== "object"))
        invalid("previous", "invalid previous observation");
      previousSource =
        input.previous?.source === undefined ? undefined : parseAnchor(input.previous.source);
      const savedDestinations = input.previous?.destinations;
      if (savedDestinations !== undefined && !Array.isArray(savedDestinations))
        invalid("previous", "invalid previous destination anchors");
      const previous = savedDestinations ?? [];
      if (previous.length > 32) invalid("previous", "invalid previous destination anchors");
      previousDestinations = Array.from(previous, parseAnchor);
      if (previousSource && previousSource.transactionHash !== sourceHash)
        invalid("previous", "previous source does not match");
      if (
        new Set(previousDestinations.map((a) => a.transactionHash)).size !==
          previousDestinations.length ||
        previousDestinations.some((a) => !hashes.includes(a.transactionHash))
      )
        invalid("previous", "retain each unique previous destination in the candidate set");
    } catch (cause) {
      if (cause instanceof NttObserverError) throw cause;
      throw new NttObserverError("InvalidInput", "input", "invalid observation input", { cause });
    }
    const contexts = await Promise.allSettled([
      context(route.source, sourceTransport, sourceRequired),
      context(route.destination, destinationTransport, destinationRequired),
    ]);
    const sourceResult = contexts[0],
      destinationResult = contexts[1];
    if (!sourceResult || !destinationResult) throw new Error("endpoint result missing");
    const source: Inspected =
      sourceResult.status === "fulfilled"
        ? await inspect(sourceResult.value, sourceHash, previousSource)
        : {
            observation: failed(
              empty(sourceHash, sourceRequired),
              sourceResult.reason,
              "source-endpoint",
            ),
            receipt: null,
          };
    const destinations: Inspected[] = [];
    for (const hash of hashes)
      destinations.push(
        destinationResult.status === "fulfilled"
          ? await inspect(
              destinationResult.value,
              hash,
              previousDestinations.find((a) => a.transactionHash === hash),
            )
          : {
              observation: failed(
                empty(hash, destinationRequired),
                destinationResult.reason,
                "destination-endpoint",
              ),
              receipt: null,
            },
      );
    if (sourceResult.status === "fulfilled" && destinationResult.status === "fulfilled") {
      decodeSource(sourceResult.value, destinationResult.value, source, expected);
      if (source.observation.digest)
        for (const candidate of destinations)
          decodeDestination(destinationResult.value, candidate, source.observation.digest);
    }
    if (sourceResult.status === "fulfilled") await finish(sourceResult.value, [source]);
    const destinationIssue =
      destinationResult.status === "fulfilled"
        ? await finish(destinationResult.value, destinations)
        : null;
    const issues = [source.observation, ...destinations.map((d) => d.observation)].flatMap((o) =>
      o.issue ? [o.issue] : [],
    );
    if (destinationIssue) issues.push(destinationIssue);
    if (destinationResult.status === "rejected" && hashes.length === 0)
      issues.push(issue(destinationResult.reason, "destination-endpoint"));
    const s = source.observation;
    const completed = destinations
      .filter((d) => d.observation.state === "confirmed" && d.observation.evidence === "redeemed")
      .map((d) => d.observation.transactionHash);
    let state: NttDeliveryObservation["state"];
    if (s.state === "reorged") state = "reorged";
    else if (s.state === "invalid" || s.state === "unavailable") state = "ambiguous";
    else if (
      s.state === "missing" ||
      s.state === "included" ||
      (s.confirmations ?? 0n) < sourceRequired
    )
      state = "source-pending";
    else if (s.state === "reverted") state = "source-reverted";
    else if (s.evidence === "outbound-queued") state = "source-queued";
    else if (s.digest === null) state = "ambiguous";
    else if (completed.length) state = "completed";
    else if (destinations.some((d) => d.observation.state === "reorged")) state = "reorged";
    else if (issues.length) state = "ambiguous";
    else if (
      destinations.some(
        (d) => d.observation.state === "confirmed" && d.observation.evidence === "inbound-queued",
      )
    )
      state = "destination-queued";
    else state = "message-pending";
    return Object.freeze({
      routeId: route.id,
      state,
      digest: s.digest,
      source: Object.freeze(s),
      destinations: Object.freeze(destinations.map((d) => Object.freeze(d.observation))),
      completionTransactions: Object.freeze(state === "completed" ? completed : []),
      issues: Object.freeze(issues),
      coverage: "provided-receipts-only",
    });
  }
  return Object.freeze({ observe });
}
