import {
  getTokenInterface,
  resolveContract,
  resolveEvent,
  resolveOperation,
} from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord, verifyContractRuntime } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  ReadCoordinate,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { Hash32, HexData } from "@mezo-dev-kit/evm";
import { NTT_ROUTES } from "./model.generated.ts";
import { messageDigest } from "./message.ts";
import { nttRequire, nttTokenRuntime, wormholeAddress } from "./ntt-transfer-reader.ts";
import type {
  NttTransferQuote,
  NttTransferQuoteInput,
  NttTransferReader,
  NttTransferTransport,
} from "./ntt-transfer-types.ts";

export interface PreparedNttTransfer {
  readonly quote: Readonly<NttTransferQuote>;
  /** Execute an explicit token approval separately, confirm it and prepare again. */
  readonly approval: Readonly<{
    token: NttTransferQuote["source"]["token"];
    spender: NttTransferQuote["source"]["manager"];
    requiredAmount: bigint;
    currentAllowance: bigint;
    required: boolean;
  }>;
  readonly transaction: Readonly<PreparedTransaction>;
}
export type NttSourceOutcome =
  | Readonly<{ state: "source-queued"; sequence: bigint; digest: null; message: null }>
  | Readonly<{ state: "source-sent"; sequence: bigint; digest: Hash32; message: HexData }>;
export interface NttTransferWriter {
  prepare(input: {
    readonly operationId: string;
    readonly quote: NttTransferQuoteInput;
  }): Promise<Readonly<PreparedNttTransfer>>;
  simulate(prepared: PreparedNttTransfer): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedNttTransfer,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedNttTransfer,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: NttSourceOutcome;
    }>
  >;
}
const codec = createAbiCodec();
function operation(quote: NttTransferQuote) {
  return resolveOperation({
    contractId: "bridge.musd-ntt-manager",
    networkId: quote.source.coordinate.networkId,
    blockNumber: quote.source.coordinate.blockNumber,
    functionName: "transfer",
    inputTypes: ["uint256", "uint16", "bytes32", "bytes32", "bool", "bytes"],
  }).functionAbi;
}
export function nttTransferCalldata(quote: NttTransferQuote): HexData {
  const route = NTT_ROUTES.find((r) => r.id === quote.routeId);
  nttRequire(route, "UnknownRoute", "unknown NTT transfer route");
  return parseHexData(
    codec.encodeFunction(operation(quote), [
      quote.amount,
      BigInt(route.destination.wormholeChainId),
      wormholeAddress(quote.recipient),
      wormholeAddress(quote.refundRecipient),
      quote.shouldQueue,
      quote.instructions,
    ]),
  );
}
function check(quote: NttTransferQuote) {
  nttRequire(
    !quote.source.managerPaused &&
      !quote.source.transceiverPaused &&
      !quote.destination.managerPaused &&
      !quote.destination.transceiverPaused,
    "InvalidConfiguration",
    "NTT route is paused",
  );
  nttRequire(
    quote.tokenBalance >= quote.amount &&
      quote.nativeBalance >= quote.nativeFee &&
      quote.nativeFee <= quote.maxNativeFee &&
      (!quote.sourceWouldQueue || quote.shouldQueue),
    "BoundExceeded",
    "NTT balance, fee or outbound queue consent is insufficient",
  );
}
function reinput(quote: NttTransferQuote, sourceBlockNumber?: bigint): NttTransferQuoteInput {
  return {
    account: quote.account,
    recipient: quote.recipient,
    refundRecipient: quote.refundRecipient,
    amount: quote.amount,
    shouldQueue: quote.shouldQueue,
    maxNativeFee: quote.maxNativeFee,
    maxSourceAgeBlocks: quote.maxSourceAgeBlocks,
    maxDestinationAgeBlocks: quote.maxDestinationAgeBlocks,
    ...(sourceBlockNumber === undefined ? {} : { sourceBlockNumber }),
  };
}
export function nttExpectedMessage(quote: NttTransferQuote, sequence: bigint): HexData {
  const route = NTT_ROUTES.find((r) => r.id === quote.routeId);
  nttRequire(route, "UnknownRoute", "unknown NTT route");
  const hex = (value: bigint, bytes: number) =>
    parseUint(value, bytes * 8)
      .toString(16)
      .padStart(bytes * 2, "0");
  const payload = `994e5454${hex(BigInt(quote.trimmedDecimals), 1)}${hex(quote.trimmedAmount, 8)}${wormholeAddress(quote.source.token).slice(2)}${wormholeAddress(quote.recipient).slice(2)}${hex(BigInt(route.destination.wormholeChainId), 2)}`;
  return parseHexData(
    `0x${hex(sequence, 32)}${wormholeAddress(quote.account).slice(2)}${hex(BigInt(payload.length / 2), 2)}${payload}`,
  );
}
export function reconcileNttSource(
  quote: NttTransferQuote,
  receipt: ExecutionReceipt,
): NttSourceOutcome {
  nttRequire(
    receipt.logs.length <= 2048,
    "InvalidEvidence",
    "NTT source receipt exceeds log bound",
  );
  const route = NTT_ROUTES.find((r) => r.id === quote.routeId);
  nttRequire(route, "UnknownRoute", "unknown NTT route");
  const manager = resolveContract({
    contractId: route.source.managerId,
    networkId: route.source.networkId,
    blockNumber: receipt.blockNumber,
  });
  const transceiver = resolveContract({
    contractId: route.source.transceiverId,
    networkId: route.source.networkId,
    blockNumber: receipt.blockNumber,
  });
  nttRequire(
    manager.address === quote.source.manager && transceiver.address === quote.source.transceiver,
    "InvalidEvidence",
    "NTT receipt generation differs",
  );
  const event = (
    contractId: typeof route.source.managerId | typeof route.source.transceiverId,
    address: string,
    name: string,
  ) => {
    const entry = resolveEvent({
      contractId,
      networkId: route.source.networkId,
      blockNumber: receipt.blockNumber,
      eventName: name,
    });
    return getReceiptLogs(receipt, parseAddress(address)).flatMap((log) => {
      const decoded = codec.decodeEvent(entry, log);
      return decoded === null ? [] : [decoded];
    });
  };
  const sent = event(route.source.transceiverId, transceiver.address, "SendTransceiverMessage");
  const queued = event(route.source.managerId, manager.address, "OutboundTransferQueued");
  const limited = event(route.source.managerId, manager.address, "OutboundTransferRateLimited");
  if (sent.length === 0 && queued.length === 1 && queued[0] && limited.length === 1 && limited[0]) {
    const sequence = parseUint(queued[0][0], 64);
    nttRequire(
      quote.shouldQueue &&
        parseAddress(limited[0][0]) === quote.account &&
        parseUint(limited[0][1], 64) === sequence &&
        parseUint(limited[0][2]) === quote.amount &&
        parseUint(limited[0][3]) < quote.amount,
      "InvalidEvidence",
      "NTT queued source tuple differs",
    );
    return Object.freeze({ state: "source-queued", sequence, digest: null, message: null });
  }
  nttRequire(
    sent.length === 1 && sent[0] && queued.length === 0 && limited.length === 0,
    "InvalidEvidence",
    "NTT source has no unique send or queue outcome",
  );
  nttRequire(
    parseUint(sent[0][0], 16) === BigInt(route.destination.wormholeChainId),
    "InvalidEvidence",
    "NTT source destination chain differs",
  );
  const raw: unknown = sent[0][1];
  nttRequire(
    Array.isArray(raw) && raw.length === 4,
    "InvalidEvidence",
    "NTT transceiver payload shape differs",
  );
  const fields: readonly unknown[] = raw;
  nttRequire(
    parseHash32(fields[0]) === wormholeAddress(parseAddress(manager.address)) &&
      parseHash32(fields[1]) === wormholeAddress(quote.destination.manager) &&
      parseHexData(fields[3]).length === 2,
    "InvalidEvidence",
    "NTT transceiver manager or additional payload differs",
  );
  const message = parseHexData(fields[2]);
  nttRequire(
    message.length === 292,
    "InvalidEvidence",
    "NTT ordinary manager message length differs",
  );
  const sequence = parseUint(BigInt(`0x${message.slice(2, 66)}`), 64);
  nttRequire(
    message === nttExpectedMessage(quote, sequence),
    "InvalidEvidence",
    "NTT source sender, recipient, token or amount differs from intent",
  );
  return Object.freeze({
    state: "source-sent",
    sequence,
    message,
    digest: messageDigest(BigInt(route.source.wormholeChainId), message),
  });
}
export function createNttTransferWriter(config: {
  readonly reader: NttTransferReader;
  readonly execution: ExecutionClient;
  readonly sourceTransport: NttTransferTransport;
}): Readonly<NttTransferWriter> {
  const owned = new WeakSet<PreparedNttTransfer>();
  const simulations = new WeakMap<SimulatedTransaction, PreparedNttTransfer>();
  function assertOwned(prepared: PreparedNttTransfer) {
    nttRequire(owned.has(prepared), "InvalidInput", "prepare with this NTT writer");
  }
  async function fresh(prepared: PreparedNttTransfer, coordinate?: ReadCoordinate) {
    const original = prepared.quote;
    const quote = await config.reader.quote(reinput(original, coordinate?.blockNumber));
    check(quote);
    const sourceAge = quote.source.coordinate.blockNumber - original.source.coordinate.blockNumber;
    const destinationAge =
      quote.destination.coordinate.blockNumber - original.destination.coordinate.blockNumber;
    nttRequire(
      sourceAge >= 0n &&
        sourceAge <= original.maxSourceAgeBlocks &&
        destinationAge >= 0n &&
        destinationAge <= original.maxDestinationAgeBlocks,
      "StaleQuote",
      "NTT preparation expired on source or destination",
    );
    nttRequire(
      quote.source.manager === original.source.manager &&
        quote.destination.manager === original.destination.manager &&
        quote.source.transceiver === original.source.transceiver &&
        quote.destination.transceiver === original.destination.transceiver &&
        nttTransferCalldata(quote) === prepared.transaction.data &&
        quote.nativeFee === prepared.transaction.value &&
        (coordinate === undefined || coordinate.blockHash === quote.source.coordinate.blockHash),
      "InvalidConfiguration",
      "NTT exact call configuration or fee changed",
    );
    nttRequire(
      quote.allowance >= quote.amount,
      "ApprovalRequired",
      "confirm the exact token/spender approval and prepare again",
    );
  }
  return Object.freeze<NttTransferWriter>({
    async prepare(input) {
      nttRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const operationId = input.operationId;
      const quote = await config.reader.quote(input.quote);
      check(quote);
      const transaction: Readonly<PreparedTransaction> = Object.freeze({
        operationId,
        contractId: "bridge.musd-ntt-manager",
        coordinate: quote.source.coordinate,
        from: quote.account,
        to: quote.source.manager,
        value: quote.nativeFee,
        data: nttTransferCalldata(quote),
      });
      const prepared = Object.freeze({
        quote,
        transaction,
        approval: Object.freeze({
          token: quote.source.token,
          spender: quote.source.manager,
          requiredAmount: quote.amount,
          currentAllowance: quote.allowance,
          required: quote.allowance < quote.amount,
        }),
      });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      nttRequire(
        !prepared.approval.required,
        "ApprovalRequired",
        "confirm the exact token/spender approval and prepare again",
      );
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (returnData, coordinate) => {
          await fresh(prepared, coordinate);
          const decoded = codec.decodeFunction(operation(prepared.quote), returnData);
          nttRequire(
            decoded.length === 1,
            "InvalidEvidence",
            "NTT transfer simulation must return a sequence",
          );
          parseUint(decoded[0], 64);
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      nttRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "NTT simulation differs from prepared transfer",
      );
      return config.execution.submit(simulated, async () => fresh(prepared));
    },
    async reconcile(prepared, record) {
      assertOwned(prepared);
      const restored = parseSubmissionRecord(record),
        tx = prepared.transaction;
      nttRequire(
        restored.operationId === tx.operationId &&
          restored.contractId === tx.contractId &&
          restored.networkId === tx.coordinate.networkId &&
          restored.call.from === tx.from &&
          restored.call.to === tx.to &&
          restored.call.data === tx.data &&
          BigInt(restored.call.value) === tx.value,
        "InvalidEvidence",
        "NTT submission differs from prepared source call",
      );
      return config.execution.reconcile(restored, async (receipt) => {
        const coordinate = {
          ...prepared.quote.source.coordinate,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
        };
        for (const contractId of [
          "bridge.musd-ntt-manager",
          "bridge.musd-wormhole-transceiver",
        ] as const) {
          const contract = resolveContract({
            contractId,
            networkId: coordinate.networkId,
            blockNumber: coordinate.blockNumber,
          });
          await verifyContractRuntime({ transport: config.sourceTransport, contract, coordinate });
        }
        const route = NTT_ROUTES.find((r) => r.id === prepared.quote.routeId);
        nttRequire(route, "UnknownRoute", "unknown NTT receipt route");
        await nttTokenRuntime(config.sourceTransport, coordinate, route.source);
        nttTokenSettlement(prepared.quote, receipt, "deposit");
        return reconcileNttSource(prepared.quote, receipt);
      });
    },
  });
}

/** Direct ordinary MUSD custody only; approval events do not count as token settlement. */
export function nttTokenSettlement(
  quote: Readonly<{
    source: Pick<NttTransferQuote["source"], "token" | "manager" | "mode">;
    account: NttTransferQuote["account"];
    amount: bigint;
  }>,
  receipt: ExecutionReceipt,
  kind: "deposit" | "refund",
): void {
  const entry = getTokenInterface().find((e) => e.type === "event" && e.name === "Transfer");
  nttRequire(entry, "InvalidConfiguration", "canonical token transfer interface missing");
  const transfers = getReceiptLogs(receipt, quote.source.token).flatMap((log) => {
    const decoded = codec.decodeEvent(entry, log);
    return decoded === null ? [] : [decoded];
  });
  const zero = parseAddress(`0x${"0".repeat(40)}`);
  const expected =
    kind === "refund"
      ? [[quote.source.mode === "locking" ? quote.source.manager : zero, quote.account]]
      : quote.source.mode === "locking"
        ? [[quote.account, quote.source.manager]]
        : [
            [quote.account, quote.source.manager],
            [quote.source.manager, zero],
          ];
  nttRequire(
    transfers.length === expected.length &&
      expected.every(
        ([from, to]) =>
          transfers.filter(
            (t) =>
              parseAddress(t[0]) === from &&
              parseAddress(t[1]) === to &&
              parseUint(t[2]) === quote.amount,
          ).length === 1,
      ),
    "InvalidEvidence",
    "NTT token custody settlement differs from intended amount",
  );
}
