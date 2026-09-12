import { getNetwork } from "@mezo-dev-kit/chains";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
import {
  keccak256,
  parseAddress,
  parseHash32,
  parseRpcQuantity,
  parseUint,
  parseUnsignedInteger,
} from "@mezo-dev-kit/evm";
import type { AbiEventValue, Hash32 } from "@mezo-dev-kit/evm";
import { NATIVE_ROUTES } from "./model.generated.ts";
import {
  finishNative,
  historical,
  inspectNative,
  nativeChain,
  nativeCodec,
  nativeEntry,
  nativeEvents,
  nativeFailed,
  nativeIssue,
  nativeObject,
  nativeRead,
  nativeRequest,
  nativeRuntime,
  NativeObserverError,
  requireEvidence,
} from "./native-evidence.ts";
import type { InspectedNative, NativeContext } from "./native-evidence.ts";
import type {
  NativeDeliveryObservation,
  NativeDeliveryObserver,
  NativeObserveInput,
  NativeObserverConfig,
  NativeReceiptAnchor,
  NativeTransferTuple,
} from "./native-types.ts";
type Route = (typeof NATIVE_ROUTES)[number];
const zero = parseAddress(`0x${"0".repeat(40)}`);
function hash(value: AbiEventValue | undefined): Hash32 {
  requireEvidence(
    value !== null &&
      typeof value === "object" &&
      "kind" in value &&
      value.kind === "indexed-hash" &&
      "hash" in value,
    "recipient must be an indexed hash",
  );
  return parseHash32(value.hash);
}
function sourceTuple(route: Route, source: InspectedNative): Readonly<NativeTransferTuple> | null {
  const { receipt, transaction, contract } = source;
  if (!receipt || !transaction || !contract) return null;
  const inbound = route.direction === "inbound-to-mezo",
    calldata = nativeCodec.decodeCalldata(
      nativeEntry(contract.calldataAbi, inbound ? "bridgeERC20" : "bridgeOut"),
      transaction.input,
    );
  const sender = parseAddress(transaction.from);
  requireEvidence(sender !== zero, "source cannot be a system transaction");
  const sourceToken = parseAddress(calldata[0]),
    amount = parseUint(calldata[1]),
    targetChain = inbound ? null : parseUint(calldata[2], 8),
    recipient = parseAddress(calldata[inbound ? 2 : 3]);
  requireEvidence(
    sourceToken === parseAddress(route.source.token) && amount > 0n,
    "source token or amount outside route",
  );
  if (!inbound)
    requireEvidence(targetChain === BigInt(route.targetChain ?? -1), "source target chain differs");
  const events = nativeEvents(receipt, contract, inbound ? "AssetsLocked" : "AssetsUnlocked");
  requireEvidence(events.length === 1, "direct source call must have exactly one bridge event");
  const event = events[0];
  requireEvidence(event, "source event missing");
  const v = event.values;
  const sequence = parseUint(v[0]),
    destinationToken = parseAddress(route.destination.token);
  requireEvidence(sequence > 0n, "bridge sequence must be positive");
  if (inbound)
    requireEvidence(
      parseAddress(v[1]) === recipient &&
        parseAddress(v[2]) === sourceToken &&
        parseUint(v[3]) === amount,
      "source calldata/event tuple differs",
    );
  else
    requireEvidence(
      hash(v[1]) === keccak256(recipient) &&
        parseAddress(v[2]) === destinationToken &&
        parseAddress(v[3]) === sender &&
        parseUint(v[4]) === amount &&
        parseUint(v[5], 8) === targetChain,
      "source calldata/event tuple differs",
    );
  source.observation = { ...source.observation, proof: "source-validated" };
  return Object.freeze({
    sequence,
    recipient,
    sender,
    sourceToken,
    destinationToken,
    amount,
    targetChain,
  });
}

async function inboundDelivery(
  readConsensus: NativeObserverConfig["getMezoConsensusBlock"],
  ctx: NativeContext,
  destination: InspectedNative,
  tuple: NativeTransferTuple,
): Promise<void> {
  const { transaction, contract, receipt } = destination;
  if (!transaction || !contract || !receipt) return;
  requireEvidence(
    parseAddress(transaction.from) === zero &&
      parseRpcQuantity(transaction.transactionIndex) === 0n &&
      parseRpcQuantity(transaction.gas) === 0n &&
      parseRpcQuantity(transaction.gasPrice) === 0n,
    "inbound must be the validator-injected system transaction",
  );
  const batch = nativeCodec.decodeCalldata(
    nativeEntry(contract.calldataAbi, "bridge"),
    transaction.input,
  )[0];
  requireEvidence(
    Array.isArray(batch) && batch.length > 0 && batch.length <= 128,
    "system batch outside observation bounds",
  );
  // Multiple entries can confound the same account's delta, including failed mints.
  requireEvidence(
    batch.length === 1,
    "multi-entry system batches require independent mint attribution",
    "DeliveryUnproven",
  );
  const payload: unknown = batch[0];
  requireEvidence(Array.isArray(payload) && payload.length === 4, "invalid system tuple");
  if (parseUint(payload[0]) !== tuple.sequence) return;
  requireEvidence(
    parseAddress(payload[1]) === tuple.recipient &&
      parseUint(payload[2]) === tuple.amount &&
      parseAddress(payload[3]) === tuple.sourceToken,
    "system/source tuple conflict",
  );
  destination.observation = { ...destination.observation, proof: "payload-accepted" };
  const before = historical(ctx, receipt.blockNumber - 1n);
  destination.auxiliary.push({ ...before.coordinate });
  await nativeRuntime(ctx, before);
  const seq = nativeEntry(contract.readAbi, "getCurrentSequenceTip"),
    mapping = nativeEntry(contract.readAbi, "getERC20TokenMapping"),
    balance = nativeEntry(getTokenInterface(), "balanceOf");
  const preSequence = parseUint((await nativeRead(ctx, before, seq))[0]),
    postSequence = parseUint((await nativeRead(ctx, contract, seq))[0]);
  requireEvidence(
    preSequence + 1n === tuple.sequence && postSequence === tuple.sequence,
    "sequence transition does not match system payload",
    "DeliveryUnproven",
  );
  for (const coordinate of [before, contract]) {
    const mapped = (await nativeRead(ctx, coordinate, mapping, [tuple.sourceToken]))[0];
    requireEvidence(
      Array.isArray(mapped) &&
        parseAddress(mapped[0]) === tuple.sourceToken &&
        parseAddress(mapped[1]) === tuple.destinationToken,
      "mapped representation unavailable or changed",
      "DeliveryUnproven",
    );
  }
  requireEvidence(
    readConsensus,
    "consensus block required to exclude non-EVM balance changes",
    "DeliveryUnproven",
  );
  const consensus = nativeObject(
      await nativeRequest(ctx, "consensus-block", () => readConsensus(receipt.blockNumber)),
    ),
    block = nativeObject(consensus.block),
    header = nativeObject(block.header),
    data = nativeObject(block.data),
    txs = data.txs;
  function consensusHash(value: unknown) {
    requireEvidence(typeof value === "string", "invalid consensus hash");
    return parseHash32(`0x${value}`);
  }
  requireEvidence(
    consensusHash(nativeObject(consensus.block_id).hash) === receipt.blockHash &&
      consensusHash(nativeObject(header.last_block_id).hash) === before.coordinate.blockHash &&
      parseUnsignedInteger(header.height) === receipt.blockNumber &&
      header.chain_id === getNetwork(ctx.endpoint.networkId).cosmosChainId,
    "consensus block identity mismatch",
  );
  requireEvidence(
    Array.isArray(txs) &&
      txs.length === 1 &&
      typeof txs[0] === "string" &&
      txs[0].length > 0 &&
      txs[0].length <= 2 * 1024 * 1024,
    "other consensus transactions or missing coverage prevent mint attribution",
    "DeliveryUnproven",
  );
  const pre = parseUint(
      (await nativeRead(ctx, before, balance, [tuple.recipient], tuple.destinationToken))[0],
    ),
    post = parseUint(
      (await nativeRead(ctx, contract, balance, [tuple.recipient], tuple.destinationToken))[0],
    );
  requireEvidence(
    post >= pre && post - pre === tuple.amount,
    "recipient mint is missing or cannot be reconciled",
    "DeliveryUnproven",
  );
  destination.observation = {
    ...destination.observation,
    proof: "delivered",
    settlement: Object.freeze({ gross: tuple.amount, net: tuple.amount, fee: 0n }),
  };
}

async function outboundDelivery(
  ctx: NativeContext,
  destination: InspectedNative,
  tuple: NativeTransferTuple,
): Promise<void> {
  const { receipt, contract } = destination;
  if (!receipt || !contract) return;
  const recipientHash = keccak256(tuple.recipient);
  const attestations = nativeEvents(receipt, contract, "AssetsUnlockAttested").filter(
    (e) => parseUint(e.values[1]) === tuple.sequence,
  );
  for (const { values: v } of attestations)
    requireEvidence(
      parseAddress(v[0]) !== zero &&
        parseAddress(v[2]) === tuple.recipient &&
        parseAddress(v[3]) === tuple.destinationToken &&
        parseUint(v[4]) === tuple.amount &&
        parseUint(v[5], 8) === tuple.targetChain,
      "attestation/source tuple conflict",
    );
  if (attestations.length > 0)
    destination.observation = { ...destination.observation, proof: "attested" };
  const confirmations = nativeEvents(receipt, contract, "AssetsUnlockConfirmed").filter(
    (e) => parseUint(e.values[0]) === tuple.sequence,
  );
  if (confirmations.length === 0) return;
  requireEvidence(
    confirmations.length === 1,
    "multiple confirmations for the same source sequence",
  );
  const confirmation = confirmations[0];
  requireEvidence(confirmation, "confirmation missing");
  const v = confirmation.values;
  requireEvidence(
    hash(v[1]) === recipientHash &&
      parseAddress(v[2]) === tuple.destinationToken &&
      parseUint(v[3]) === tuple.amount &&
      parseUint(v[4], 8) === tuple.targetChain,
    "confirmation/source tuple conflict",
  );
  requireEvidence(
    attestations.some((a) => a.logIndex < confirmation.logIndex),
    "confirmation needs the matching attestation in this bounded receipt",
    "DeliveryUnproven",
  );
  const collector = parseAddress(
    (await nativeRead(ctx, contract, nativeEntry(contract.readAbi, "feeCollector")))[0],
  );
  requireEvidence(
    collector !== tuple.recipient &&
      collector !== contract.address &&
      tuple.recipient !== contract.address,
    "fee and recipient attribution overlap",
    "DeliveryUnproven",
  );
  const transfers = nativeEvents(
    receipt,
    contract,
    "Transfer",
    tuple.destinationToken,
    getTokenInterface(),
  ).filter((e) => parseAddress(e.values[0]) === contract.address);
  requireEvidence(
    transfers.length === 2,
    "settlement requires exactly the fee and recipient transfers",
    "DeliveryUnproven",
  );
  const recipient = transfers.filter((e) => parseAddress(e.values[1]) === tuple.recipient),
    fees = transfers.filter((e) => parseAddress(e.values[1]) === collector);
  requireEvidence(
    recipient.length === 1 && fees.length === 1,
    "settlement transfer recipients differ",
    "DeliveryUnproven",
  );
  const net = parseUint(recipient[0]?.values[2]),
    fee = parseUint(fees[0]?.values[2]);
  requireEvidence(
    net > 0n && net + fee === tuple.amount,
    "recipient net plus fee does not equal gross source amount",
    "DeliveryUnproven",
  );
  destination.observation = {
    ...destination.observation,
    proof: "delivered",
    settlement: Object.freeze({ gross: tuple.amount, net, fee }),
  };
}

function inputHashes(input: NativeObserveInput): {
  source: Hash32;
  destinations: Hash32[];
  previous: Map<Hash32, NativeReceiptAnchor>;
} {
  requireEvidence(
    input &&
      Array.isArray(input.destinationTransactionHashes) &&
      input.destinationTransactionHashes.length <= 32,
    "at most 32 unique destination candidates are allowed",
    "InvalidInput",
  );
  const source = parseHash32(input.sourceTransactionHash),
    destinations = input.destinationTransactionHashes.map((h) => parseHash32(h));
  requireEvidence(
    new Set(destinations).size === destinations.length,
    "duplicate destination candidates",
    "InvalidInput",
  );
  const previous = new Map<Hash32, NativeReceiptAnchor>();
  const priorDestinations = input.previous?.destinations ?? [];
  requireEvidence(
    Array.isArray(priorDestinations) && priorDestinations.length <= 32,
    "at most 32 previous destination anchors are allowed",
    "InvalidInput",
  );
  const priorValues: readonly unknown[] = priorDestinations;
  function parseAnchor(value: unknown): Readonly<NativeReceiptAnchor> {
    const anchor = nativeObject(value);
    return Object.freeze({
      transactionHash: parseHash32(anchor.transactionHash),
      blockNumber: parseUint(anchor.blockNumber),
      blockHash: parseHash32(anchor.blockHash),
    });
  }
  const prior = priorValues.map(parseAnchor);
  const sourcePrior =
    input.previous?.source === undefined ? undefined : parseAnchor(input.previous.source);
  for (const anchor of [...(sourcePrior ? [sourcePrior] : []), ...prior]) {
    const hash = anchor.transactionHash;
    requireEvidence(!previous.has(hash), "duplicate prior anchors", "InvalidInput");
    previous.set(hash, anchor);
  }
  if (sourcePrior)
    requireEvidence(
      sourcePrior.transactionHash === source,
      "previous source hash differs",
      "InvalidInput",
    );
  for (const anchor of prior)
    requireEvidence(
      destinations.includes(anchor.transactionHash),
      "previous destination removed from candidate coverage",
      "InvalidInput",
    );
  return { source, destinations, previous };
}
export function createNativeDeliveryObserver(
  config: NativeObserverConfig,
): Readonly<NativeDeliveryObserver> {
  const selected = NATIVE_ROUTES.find((r) => r.id === config.routeId);
  if (!selected) throw new NativeObserverError("UnknownRoute", "route", "unknown Native route");
  const route: Route = selected;
  requireEvidence(
    parseUint(config.sourceConfirmations) > 0n && parseUint(config.destinationConfirmations) > 0n,
    "positive confirmation counts required",
    "InvalidInput",
  );
  // Capture configuration so caller mutation cannot alter an in-flight observation.
  const sourceTransport = config.sourceTransport,
    destinationTransport = config.destinationTransport,
    sourceRequired = config.sourceConfirmations,
    destinationRequired = config.destinationConfirmations,
    consensus = config.getMezoConsensusBlock;
  async function observe(input: NativeObserveInput): Promise<Readonly<NativeDeliveryObservation>> {
    const hashes = inputHashes(input),
      signal = input.signal;
    signal?.throwIfAborted();
    const sourceContext: NativeContext = {
        endpoint: route.source,
        transport: sourceTransport,
        required: sourceRequired,
        ...(signal ? { signal } : {}),
      },
      destinationContext: NativeContext = {
        endpoint: route.destination,
        transport: destinationTransport,
        required: destinationRequired,
        ...(signal ? { signal } : {}),
      };
    const source = await inspectNative(
      sourceContext,
      hashes.source,
      hashes.previous.get(hashes.source),
    );
    let tuple: Readonly<NativeTransferTuple> | null = null;
    try {
      await nativeChain(sourceContext);
      tuple = sourceTuple(route, source);
    } catch (error) {
      signal?.throwIfAborted();
      source.observation = nativeFailed(source.observation, error);
    }
    const destinations: InspectedNative[] = [];
    for (const hash of hashes.destinations) {
      const candidate = await inspectNative(destinationContext, hash, hashes.previous.get(hash));
      destinations.push(candidate);
      try {
        await nativeChain(destinationContext);
        if (tuple && source.observation.proof === "source-validated") {
          if (route.direction === "inbound-to-mezo")
            await inboundDelivery(consensus, destinationContext, candidate, tuple);
          else await outboundDelivery(destinationContext, candidate, tuple);
        }
      } catch (error) {
        signal?.throwIfAborted();
        const issue = nativeIssue(error);
        candidate.observation =
          issue.code === "DeliveryUnproven"
            ? { ...candidate.observation, issue, settlement: null }
            : nativeFailed(candidate.observation, error);
      }
    }
    await finishNative(sourceContext, source);
    for (const candidate of destinations) await finishNative(destinationContext, candidate);
    const sourceConfirmed =
      source.observation.state === "confirmed" && source.observation.proof === "source-validated";
    const completionTransactions = sourceConfirmed
      ? destinations
          .filter((d) => d.observation.state === "confirmed" && d.observation.proof === "delivered")
          .map((d) => d.observation.transactionHash)
      : [];
    const sourceState = source.observation.state;
    const state: NativeDeliveryObservation["state"] =
      completionTransactions.length > 0
        ? "completed"
        : sourceState === "reorged"
          ? "reorged"
          : sourceState === "reverted"
            ? "source-reverted"
            : sourceState === "missing" || sourceState === "included"
              ? "source-pending"
              : [source, ...destinations].some(
                    (d) =>
                      d.observation.state === "invalid" || d.observation.state === "unavailable",
                  )
                ? "ambiguous"
                : destinations.some((d) => d.observation.state === "reorged")
                  ? "reorged"
                  : destinations.some((d) => d.observation.proof !== "none")
                    ? "destination-progress"
                    : "message-pending";
    return Object.freeze({
      routeId: route.id,
      state,
      tuple,
      source: Object.freeze(source.observation),
      destinations: Object.freeze(destinations.map((d) => Object.freeze(d.observation))),
      completionTransactions: Object.freeze(completionTransactions),
      coverage: "provided-receipts-and-historical-coordinates-only",
    });
  }
  return Object.freeze({ observe });
}
