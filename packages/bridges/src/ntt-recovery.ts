import { sha256 } from "@mezo-dev-kit/evm";
import { resolveContract, resolveEvent, resolveOperation } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord, verifyContractRuntime } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  ReadCoordinate,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  keccak256,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue, Address, Hash32, HexData } from "@mezo-dev-kit/evm";
import { NTT_ROUTES } from "./model.generated.ts";
import { messageDigest } from "./message.ts";
import { createNttDeliveryObserver } from "./observer.ts";
import {
  createNttTransferReader,
  nttAddress,
  nttCheckAnchor,
  nttCoordinate,
  nttRead,
  nttRequire,
  nttTrimAmount,
  nttTokenRuntime,
  wormholeAddress,
} from "./ntt-transfer-reader.ts";
import { nttTokenSettlement, reconcileNttSource } from "./ntt-transfer-writer.ts";
import type { NttSourceOutcome } from "./ntt-transfer-writer.ts";
import type { NttTransferQuote } from "./ntt-transfer-types.ts";
import type { NttRouteId } from "./types.ts";

interface RecoveryBase {
  readonly operationId: string;
  readonly account: Address;
  readonly maxNativeFee: bigint;
}
interface OutboundRecovery {
  readonly sequence: bigint;
  readonly amount: bigint;
  readonly recipient: Address;
  readonly refundRecipient: Address;
}
interface DestinationRecovery {
  readonly sourceTransactionHash: Hash32;
  readonly message: HexData;
}
/**
 * One explicitly selected source-queue or destination-attestation operation. Required evidence
 * depends on the action and chain.
 */
export type NttRecoveryInput = RecoveryBase &
  (
    | (Readonly<{ kind: "complete-outbound" }> & OutboundRecovery)
    | (Readonly<{ kind: "cancel-outbound" }> & OutboundRecovery)
    | (Readonly<{ kind: "complete-inbound" }> & DestinationRecovery)
    | (Readonly<{ kind: "execute-approved" }> & DestinationRecovery)
    | (Readonly<{ kind: "receive-attestation"; vaa: HexData }> & DestinationRecovery)
  );
/**
 * Per-chain execution/read dependencies and evidence policies. Only the execution client needed
 * for the selected action is required.
 */
export interface NttRecoveryConfig {
  readonly routeId: NttRouteId;
  readonly sourceTransport: RpcTransport;
  readonly destinationTransport: RpcTransport;
  readonly sourceExecution?: ExecutionClient;
  readonly destinationExecution?: ExecutionClient;
  readonly sourceConfirmations: bigint;
  readonly destinationConfirmations: bigint;
  readonly maxSourceAgeBlocks: bigint;
  readonly maxDestinationAgeBlocks: bigint;
}
/**
 * Exact selected recovery call and its source/message evidence. A nullable quote/digest
 * reflects the action, not missing permission to infer one.
 */
export interface PreparedNttRecovery {
  readonly input: Readonly<NttRecoveryInput>;
  readonly transaction: Readonly<PreparedTransaction>;
  readonly sourceTransaction: boolean;
  readonly sequence: bigint;
  readonly digest: Hash32 | null;
  readonly amount: bigint;
  readonly recipient: Address;
  readonly quote: Readonly<NttTransferQuote> | null;
}
/**
 * Observed queue/cancellation or destination progress. Progress is not a general cross-chain
 * completion assertion.
 */
export type NttRecoveryOutcome =
  | NttSourceOutcome
  | Readonly<{ state: "source-cancelled"; sequence: bigint; amount: bigint }>
  | Readonly<{ state: "destination-progress"; digest: Hash32; evidence: "queued" | "redeemed" }>;
/**
 * Explicit manual recovery lifecycle. No automatic retries, attestation service or background
 * delivery worker is selected.
 */
export interface NttRecoveryWriter {
  /**
   * Read only the evidence required for the explicitly selected recovery action and prepare its
   * source or destination call without signing.
   */
  prepare(input: NttRecoveryInput): Promise<Readonly<PreparedNttRecovery>>;
  /**
   * Simulate this writer's prepared recovery call using the execution client for the selected
   * chain; do not submit.
   */
  simulate(prepared: PreparedNttRecovery): Promise<Readonly<SimulatedTransaction>>;
  /**
   * Revalidate and submit the matching writer-owned preparation/simulation through Core.
   * Returns a durable record, not confirmation or protocol completion. Recover an uncertain
   * send by its existing intent.
   */
  submit(
    prepared: PreparedNttRecovery,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  /**
   * Match the persisted intent and confirmed receipt, then verify the selected recovery
   * action's queue/attestation evidence. Required evidence mismatches can reject even when the
   * EVM receipt succeeded.
   */
  reconcile(
    prepared: PreparedNttRecovery,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: NttRecoveryOutcome;
    }>
  >;
}
const codec = createAbiCodec();
function array(value: unknown, size: number): readonly unknown[] {
  nttRequire(
    Array.isArray(value) && value.length === size,
    "InvalidEvidence",
    "NTT recovery tuple differs",
  );
  return value;
}
function unpad(value: unknown): Address {
  const padded = parseHash32(value);
  nttRequire(
    padded.startsWith(`0x${"0".repeat(24)}`),
    "InvalidEvidence",
    "NTT recovery address is not EVM padded",
  );
  return nttAddress(`0x${padded.slice(-40)}`);
}
function parseMessage(route: (typeof NTT_ROUTES)[number], value: unknown) {
  const message = parseHexData(value);
  nttRequire(
    message.length === 292 && message.slice(130, 142) === "004f994e5454",
    "InvalidEvidence",
    "only ordinary MUSD NTT messages are recoverable",
  );
  const data = message.slice(2);
  const sequence = parseUint(BigInt(`0x${data.slice(0, 64)}`), 64),
    sender = unpad(`0x${data.slice(64, 128)}`);
  const decimals = Number.parseInt(data.slice(140, 142), 16),
    trimmedAmount = parseUint(BigInt(`0x${data.slice(142, 158)}`), 64);
  const token = unpad(`0x${data.slice(158, 222)}`),
    recipient = unpad(`0x${data.slice(222, 286)}`),
    chain = BigInt(`0x${data.slice(286, 290)}`);
  nttRequire(
    decimals === 8 &&
      trimmedAmount > 0n &&
      token === parseAddress(route.source.token) &&
      chain === BigInt(route.destination.wormholeChainId),
    "InvalidEvidence",
    "NTT recovery token, amount precision or destination differs",
  );
  const amount = trimmedAmount * 10n ** BigInt(route.source.decimals - decimals);
  return {
    message,
    sequence,
    sender,
    recipient,
    amount,
    payload: parseHexData(`0x${data.slice(132)}`),
    digest: messageDigest(BigInt(route.source.wormholeChainId), message),
    ...nttTrimAmount(amount, route.source.decimals, route.destination.decimals),
  };
}
function verifyVaa(
  value: unknown,
  route: (typeof NTT_ROUTES)[number],
  quote: NttTransferQuote,
  message: HexData,
) {
  const vaa = parseHexData(value);
  nttRequire(
    vaa.length >= 116 && vaa.length <= 131074 && vaa.slice(2, 4) === "01",
    "InvalidEvidence",
    "bounded Wormhole VAA version 1 required",
  );
  const count = Number.parseInt(vaa.slice(12, 14), 16),
    bodyOffset = 14 + count * 132;
  nttRequire(
    count > 0 && vaa.length > bodyOffset + 102,
    "InvalidEvidence",
    "VAA signatures or body missing",
  );
  const body = vaa.slice(bodyOffset);
  nttRequire(
    BigInt(`0x${body.slice(16, 20)}`) === BigInt(route.source.wormholeChainId) &&
      parseHash32(`0x${body.slice(20, 84)}`) === wormholeAddress(quote.source.transceiver),
    "InvalidEvidence",
    "VAA emitter differs from source transceiver",
  );
  const payload = body.slice(102);
  const expected = `9945ff10${wormholeAddress(quote.source.manager).slice(2)}${wormholeAddress(quote.destination.manager).slice(2)}${((message.length - 2) / 2).toString(16).padStart(4, "0")}${message.slice(2)}0000`;
  nttRequire(
    payload === expected,
    "InvalidEvidence",
    "VAA payload differs from the confirmed source message",
  );
  // This binds the body, not guardian validity. The deployed transceiver verifies guardians in exact simulation/execution.
  return { vaa, hash: parseHash32(keccak256(keccak256(parseHexData(`0x${body}`)))) };
}
/**
 * Create explicitly chosen NTT queue and attestation recovery operations.
 *
 * @remarks
 * The selected action determines the chain and evidence required. Preparation does
 * not schedule retries or acquire attestations. Simulation, submission and source
 * reconciliation remain separate from observing eventual cross-chain delivery.
 * See the package reference for each recovery action's prerequisites.
 */
export function createNttRecoveryWriter(config: NttRecoveryConfig): Readonly<NttRecoveryWriter> {
  const route = NTT_ROUTES.find((r) => r.id === config.routeId);
  nttRequire(route, "UnknownRoute", "unknown MUSD NTT recovery route");
  const sourceAge = parseUint(config.maxSourceAgeBlocks),
    destinationAge = parseUint(config.maxDestinationAgeBlocks);
  const reader = createNttTransferReader(config);
  const observer = createNttDeliveryObserver(config);
  const { sourceTransport, destinationTransport, sourceExecution, destinationExecution } = config;
  const owned = new WeakSet<PreparedNttRecovery>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedNttRecovery>();
  function own(prepared: PreparedNttRecovery) {
    nttRequire(owned.has(prepared), "InvalidInput", "prepare with this NTT recovery writer");
  }
  const execution = (prepared: PreparedNttRecovery) => {
    const client = prepared.sourceTransaction ? sourceExecution : destinationExecution;
    nttRequire(client, "InvalidInput", "the selected recovery side requires its execution client");
    return client;
  };
  async function build(
    raw: NttRecoveryInput,
    pinned?: ReadCoordinate,
  ): Promise<Readonly<PreparedNttRecovery>> {
    nttRequire(
      typeof raw.operationId === "string" &&
        raw.operationId.length > 0 &&
        [
          "complete-outbound",
          "cancel-outbound",
          "complete-inbound",
          "execute-approved",
          "receive-attestation",
        ].includes(raw.kind),
      "InvalidInput",
      "known NTT recovery kind and operation ID required",
    );
    const base = {
      operationId: raw.operationId,
      account: nttAddress(raw.account),
      maxNativeFee: parseUint(raw.maxNativeFee),
    };
    const input: Readonly<NttRecoveryInput> = Object.freeze(
      raw.kind === "complete-outbound" || raw.kind === "cancel-outbound"
        ? {
            ...base,
            kind: raw.kind,
            sequence: parseUint(raw.sequence, 64),
            amount: parseUint(raw.amount),
            recipient: nttAddress(raw.recipient),
            refundRecipient: nttAddress(raw.refundRecipient),
          }
        : raw.kind === "receive-attestation"
          ? {
              ...base,
              kind: raw.kind,
              sourceTransactionHash: parseHash32(raw.sourceTransactionHash),
              message: parseHexData(raw.message),
              vaa: parseHexData(raw.vaa),
            }
          : {
              ...base,
              kind: raw.kind,
              sourceTransactionHash: parseHash32(raw.sourceTransactionHash),
              message: parseHexData(raw.message),
            },
    );
    const outbound = input.kind === "complete-outbound" || input.kind === "cancel-outbound";
    const endpoint = outbound ? route!.source : route!.destination,
      transport = outbound ? sourceTransport : destinationTransport;
    const coordinate = await nttCoordinate(
      endpoint,
      transport,
      pinned?.blockNumber,
      outbound ? sourceAge : destinationAge,
    );
    nttRequire(
      pinned === undefined || coordinate.blockHash === pinned.blockHash,
      "ReorgDetected",
      "NTT recovery simulation block changed",
    );
    const manager = resolveContract({
      contractId: endpoint.managerId,
      networkId: endpoint.networkId,
      blockNumber: coordinate.blockNumber,
    });
    await verifyContractRuntime({ transport, contract: manager, coordinate });
    const tokenCode = parseHexData(
      await transport.getCode(parseAddress(endpoint.token), coordinate),
    );
    nttRequire(
      sha256(tokenCode).slice(2) === endpoint.tokenCodeSha256,
      "RuntimeMismatch",
      "NTT recovery token runtime differs",
    );
    const read = (name: string, args: readonly AbiValue[] = []) =>
      nttRead(
        transport,
        coordinate,
        endpoint.managerId,
        parseAddress(manager.address),
        manager.readAbi,
        name,
        args,
      );
    nttRequire(
      (await read("isPaused"))[0] === false,
      "RecoveryUnavailable",
      "NTT recovery manager is paused",
    );
    const timestamp = parseUint(await transport.getBlockTimestamp(coordinate));
    let quote: NttTransferQuote | null = null,
      sequence: bigint,
      digest: Hash32 | null = null,
      amount: bigint,
      recipient: Address,
      method: string,
      args: readonly AbiValue[],
      value = 0n,
      contractId: typeof endpoint.managerId | typeof endpoint.transceiverId = endpoint.managerId;
    if (input.kind === "complete-outbound" || input.kind === "cancel-outbound") {
      sequence = parseUint(input.sequence, 64);
      amount = parseUint(input.amount);
      recipient = nttAddress(input.recipient);
      const refundRecipient = nttAddress(input.refundRecipient),
        trimmed = nttTrimAmount(amount, route!.source.decimals, route!.destination.decimals);
      const queue = array((await read("getOutboundQueuedTransfer", [sequence]))[0], 7);
      nttRequire(
        parseUint(queue[3], 64) > 0n &&
          parseUint(queue[3], 64) <= timestamp &&
          unpad(queue[0]) === recipient &&
          unpad(queue[1]) === refundRecipient &&
          parseUint(queue[2], 72) === trimmed.packedAmount &&
          parseUint(queue[4], 16) === BigInt(route!.destination.wormholeChainId) &&
          parseAddress(queue[5]) === input.account,
        "RecoveryUnavailable",
        "outbound queue is missing or differs from the sender's retained intent",
      );
      method =
        input.kind === "cancel-outbound"
          ? "cancelOutboundQueuedTransfer"
          : "completeOutboundQueuedTransfer";
      args = [sequence];
      if (input.kind === "complete-outbound") {
        const duration = parseUint((await read("rateLimitDuration"))[0], 64);
        nttRequire(
          timestamp >= parseUint(queue[3], 64) + duration,
          "RecoveryUnavailable",
          "outbound transfer is still queued",
        );
        quote = await reader.quote({
          account: input.account,
          recipient,
          refundRecipient,
          amount,
          shouldQueue: true,
          maxNativeFee: input.maxNativeFee,
          maxSourceAgeBlocks: sourceAge,
          maxDestinationAgeBlocks: destinationAge,
          sourceBlockNumber: coordinate.blockNumber,
        });
        nttRequire(
          !quote.source.managerPaused &&
            !quote.source.transceiverPaused &&
            parseHexData(queue[6]) === quote.instructions &&
            quote.nativeBalance >= quote.nativeFee &&
            quote.nativeFee <= input.maxNativeFee,
          "RecoveryUnavailable",
          "stored instructions changed or recovery fee balance is insufficient",
        );
        value = quote.nativeFee;
      }
    } else {
      const parsed = parseMessage(route!, input.message);
      sequence = parsed.sequence;
      amount = parsed.destinationAmount;
      recipient = parsed.recipient;
      digest = parsed.digest;
      const sourceHash = parseHash32(input.sourceTransactionHash);
      const observation = await observer.observe({
        sourceTransactionHash: sourceHash,
        destinationTransactionHashes: [],
        expectedDigest: digest,
      });
      nttRequire(
        observation.source.state === "confirmed" &&
          observation.source.evidence === "sent" &&
          observation.digest === digest,
        "InvalidEvidence",
        "recovery requires confirmed source evidence for the same message",
      );
      quote = await reader.quote({
        account: parsed.sender,
        recipient,
        refundRecipient: parsed.sender,
        amount: parsed.amount,
        shouldQueue: true,
        maxNativeFee: input.maxNativeFee,
        maxSourceAgeBlocks: sourceAge,
        maxDestinationAgeBlocks: destinationAge,
        destinationBlockNumber: coordinate.blockNumber,
      });
      const queued = array((await read("getInboundQueuedTransfer", [digest]))[0], 3);
      if (input.kind === "complete-inbound") {
        const queuedAt = parseUint(queued[1], 64),
          duration = parseUint((await read("rateLimitDuration"))[0], 64);
        nttRequire(
          queuedAt > 0n &&
            queuedAt <= timestamp &&
            timestamp >= queuedAt + duration &&
            parseUint(queued[0], 72) === parsed.packedAmount &&
            parseAddress(queued[2]) === recipient,
          "RecoveryUnavailable",
          "inbound queue is missing, still delayed or differs from the source message",
        );
        method = "completeInboundQueuedTransfer";
        args = [digest];
      } else {
        nttRequire(
          parseUint(queued[1], 64) === 0n &&
            (await read("isMessageExecuted", [digest]))[0] === false,
          "RecoveryUnavailable",
          "message is already executed or queued; reobserve its delivery",
        );
        if (input.kind === "execute-approved") {
          nttRequire(
            (await read("isMessageApproved", [digest]))[0] === true,
            "RecoveryUnavailable",
            "message has not met the manager attestation threshold",
          );
          method = "executeMsg";
          args = [
            BigInt(route!.source.wormholeChainId),
            wormholeAddress(quote.source.manager),
            [
              parseHash32(`0x${parsed.message.slice(2, 66)}`),
              wormholeAddress(parsed.sender),
              parsed.payload,
            ],
          ];
        } else {
          nttRequire(
            !quote.destination.transceiverPaused,
            "RecoveryUnavailable",
            "destination transceiver is paused",
          );
          const vaa = verifyVaa(input.vaa, route!, quote, parsed.message);
          contractId = endpoint.transceiverId;
          const transceiver = resolveContract({
            contractId,
            networkId: endpoint.networkId,
            blockNumber: coordinate.blockNumber,
          });
          nttRequire(
            (
              await nttRead(
                transport,
                coordinate,
                contractId,
                parseAddress(transceiver.address),
                transceiver.readAbi,
                "isVAAConsumed",
                [vaa.hash],
              )
            )[0] === false,
            "RecoveryUnavailable",
            "VAA is already consumed; inspect manager progress",
          );
          method = "receiveMessage";
          args = [vaa.vaa];
        }
      }
    }
    const operation = resolveOperation({
      contractId,
      networkId: endpoint.networkId,
      blockNumber: coordinate.blockNumber,
      functionName: method,
    });
    await nttCheckAnchor(transport, coordinate);
    const transaction: PreparedTransaction = Object.freeze({
      operationId: input.operationId,
      contractId,
      coordinate,
      from: input.account,
      to: operation.contract.address,
      value,
      data: codec.encodeFunction(operation.functionAbi, args),
    });
    return Object.freeze({
      input,
      transaction,
      sourceTransaction: outbound,
      sequence,
      amount,
      recipient,
      digest,
      quote,
    });
  }
  async function fresh(prepared: PreparedNttRecovery, coordinate?: ReadCoordinate) {
    const current = await build(prepared.input, coordinate),
      age =
        current.transaction.coordinate.blockNumber - prepared.transaction.coordinate.blockNumber;
    nttRequire(
      age >= 0n &&
        age <= (prepared.sourceTransaction ? sourceAge : destinationAge) &&
        current.transaction.to === prepared.transaction.to &&
        current.transaction.data === prepared.transaction.data &&
        current.transaction.value === prepared.transaction.value,
      "StaleQuote",
      "NTT recovery call, fee or freshness changed",
    );
  }
  return Object.freeze<NttRecoveryWriter>({
    async prepare(input) {
      const result = await build(input);
      owned.add(result);
      return result;
    },
    async simulate(prepared) {
      own(prepared);
      const result = await execution(prepared).simulate(
        prepared.transaction,
        async (data, coordinate) => {
          await fresh(prepared, coordinate);
          if (prepared.input.kind === "complete-outbound") {
            const entry = resolveOperation({
              contractId: prepared.transaction.contractId,
              networkId: coordinate.networkId,
              blockNumber: coordinate.blockNumber,
              functionName: "completeOutboundQueuedTransfer",
            }).functionAbi;
            nttRequire(
              parseUint(codec.decodeFunction(entry, data)[0], 64) === prepared.sequence,
              "InvalidEvidence",
              "recovery simulated a different sequence",
            );
          } else
            nttRequire(
              parseHexData(data).length === 2,
              "InvalidEvidence",
              "recovery returned unexpected bytes",
            );
        },
      );
      simulations.set(result, prepared);
      return result;
    },
    async submit(prepared, simulated) {
      own(prepared);
      nttRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "foreign NTT recovery simulation",
      );
      return execution(prepared).submit(simulated, async () => fresh(prepared));
    },
    async reconcile(prepared, record) {
      own(prepared);
      const restored = parseSubmissionRecord(record),
        tx = prepared.transaction;
      nttRequire(
        restored.operationId === tx.operationId &&
          restored.networkId === tx.coordinate.networkId &&
          restored.contractId === tx.contractId &&
          restored.call.from === tx.from &&
          restored.call.to === tx.to &&
          restored.call.data === tx.data &&
          BigInt(restored.call.value) === tx.value,
        "InvalidEvidence",
        "recovery submission differs from prepared call",
      );
      return execution(prepared).reconcile(restored, async (receipt) => {
        const receiptCoordinate = {
          ...prepared.transaction.coordinate,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
        };
        const receiptTransport = prepared.sourceTransaction
          ? sourceTransport
          : destinationTransport;
        const endpoint = prepared.sourceTransaction ? route.source : route.destination;
        for (const contractId of [endpoint.managerId, endpoint.transceiverId]) {
          const target = resolveContract({
            contractId,
            networkId: receiptCoordinate.networkId,
            blockNumber: receipt.blockNumber,
          });
          await verifyContractRuntime({
            transport: receiptTransport,
            contract: target,
            coordinate: receiptCoordinate,
          });
        }
        await nttTokenRuntime(receiptTransport, receiptCoordinate, endpoint);
        nttRequire(
          receipt.logs.length <= 2048,
          "InvalidEvidence",
          "NTT recovery receipt exceeds log bound",
        );
        if (prepared.input.kind === "complete-outbound") {
          nttRequire(prepared.quote, "InvalidEvidence", "source recovery intent missing");
          const outcome = reconcileNttSource(prepared.quote, receipt);
          nttRequire(
            outcome.state === "source-sent" && outcome.sequence === prepared.sequence,
            "InvalidEvidence",
            "queued completion did not send the same sequence",
          );
          return outcome;
        }
        const manager = resolveContract({
          contractId: endpoint.managerId,
          networkId: endpoint.networkId,
          blockNumber: receipt.blockNumber,
        });
        const logs = getReceiptLogs(receipt, manager.address);
        const events = (name: string) =>
          logs.flatMap((log) => {
            const decoded = codec.decodeEvent(
              resolveEvent({
                contractId: endpoint.managerId,
                networkId: endpoint.networkId,
                blockNumber: receipt.blockNumber,
                eventName: name,
              }),
              log,
            );
            return decoded === null ? [] : [decoded];
          });
        if (prepared.input.kind === "cancel-outbound") {
          const cancelled = events("OutboundTransferCancelled");
          nttRequire(
            cancelled.length === 1 &&
              cancelled[0] &&
              parseUint(cancelled[0][0]) === prepared.sequence &&
              parseAddress(cancelled[0][1]) === prepared.input.account &&
              parseUint(cancelled[0][2]) === prepared.amount,
            "InvalidEvidence",
            "outbound cancellation settlement differs",
          );
          nttTokenSettlement(
            {
              source: {
                token: parseAddress(endpoint.token),
                manager: parseAddress(manager.address),
                mode: endpoint.mode === 0 ? "locking" : "burning",
              },
              account: prepared.input.account,
              amount: prepared.amount,
            },
            receipt,
            "refund",
          );
          return Object.freeze({
            state: "source-cancelled" as const,
            sequence: prepared.sequence,
            amount: prepared.amount,
          });
        }
        const redeemed = events("TransferRedeemed").filter(
            (e) => parseHash32(e[0]) === prepared.digest,
          ),
          queued = events("InboundTransferQueued").filter(
            (e) => parseHash32(e[0]) === prepared.digest,
          );
        nttRequire(
          prepared.digest &&
            ((redeemed.length === 1 && queued.length === 0) ||
              (queued.length === 1 && redeemed.length === 0)),
          "InvalidEvidence",
          "destination recovery has no unique matching progress",
        );
        if (redeemed.length === 1)
          nttTokenSettlement(
            {
              source: {
                token: parseAddress(endpoint.token),
                manager: parseAddress(manager.address),
                mode: endpoint.mode === 0 ? "locking" : "burning",
              },
              account: prepared.recipient,
              amount: prepared.amount,
            },
            receipt,
            "refund",
          );
        return Object.freeze({
          state: "destination-progress" as const,
          digest: prepared.digest,
          evidence: redeemed.length === 1 ? ("redeemed" as const) : ("queued" as const),
        });
      });
    },
  });
}
