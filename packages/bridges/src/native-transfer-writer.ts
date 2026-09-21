import { getTokenInterface, resolveEvent, resolveOperation } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  ReadCoordinate,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { keccak256, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { HexData } from "@mezo-dev-kit/evm";
import { NATIVE_ROUTES } from "./model.generated.ts";
import type { NativeTransferTuple } from "./native-types.ts";
import { checkNativeQuote } from "./native-transfer-reader.ts";
import {
  checkNativeClient,
  transferAnchor,
  transferCodec,
  transferEndpoint,
  transferRequire,
} from "./native-transfer-runtime.ts";
import type {
  NativeTransferQuote,
  NativeTransferQuoteInput,
  NativeTransferReader,
  NativeTransferReaderConfig,
} from "./native-transfer-types.ts";

/** Exact source call with a separately executed and confirmed token approval. */
export interface PreparedNativeTransfer {
  readonly quote: Readonly<NativeTransferQuote>;
  readonly transaction: Readonly<PreparedTransaction>;
  readonly approval: Readonly<{
    token: NativeTransferQuote["source"]["token"];
    spender: NativeTransferQuote["source"]["bridge"];
    requiredAmount: bigint;
    currentAllowance: bigint;
    required: boolean;
  }>;
}
/** Confirmed source tuple. Destination payout must be observed independently. */
export interface NativeSourceOutcome {
  readonly state: "source-confirmed";
  readonly tuple: Readonly<NativeTransferTuple>;
}
/** Normal Native source lifecycle; no retry, governance transaction or destination send is provided. */
export interface NativeTransferWriter {
  /** Prepare the exact nonpayable call and separate approval requirement from a fresh quote. */
  prepare(input: {
    readonly operationId: string;
    readonly quote: NativeTransferQuoteInput;
  }): Promise<Readonly<PreparedNativeTransfer>>;
  /** Require this writer's preparation, revalidate both chains and simulate the exact source call. */
  simulate(prepared: PreparedNativeTransfer): Promise<Readonly<SimulatedTransaction>>;
  /** Revalidate and submit through Core. Persist the returned record; uncertainty never authorizes a resend. */
  submit(
    prepared: PreparedNativeTransfer,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  /** Bind the persisted intent and canonical source receipt; source confirmation is not delivery. */
  reconcile(
    prepared: PreparedNativeTransfer,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: NativeSourceOutcome;
    }>
  >;
}
function operation(quote: NativeTransferQuote) {
  const inbound = quote.source.coordinate.networkId === "ethereum-mainnet";
  return resolveOperation({
    contractId: quote.source.contractId,
    networkId: quote.source.coordinate.networkId,
    blockNumber: quote.source.coordinate.blockNumber,
    functionName: inbound ? "bridgeERC20" : "bridgeOut",
    inputTypes: inbound
      ? ["address", "uint256", "address"]
      : ["address", "uint256", "uint8", "bytes"],
  }).functionAbi;
}
export function nativeTransferCalldata(quote: NativeTransferQuote): HexData {
  const route = NATIVE_ROUTES.find((r) => r.id === quote.routeId);
  transferRequire(route, "UnknownRoute", "unknown Native source route");
  return transferCodec.encodeFunction(
    operation(quote),
    route.direction === "inbound-to-mezo"
      ? [quote.source.token, quote.amount, quote.recipient]
      : [quote.source.token, quote.amount, BigInt(route.targetChain ?? -1), quote.recipient],
  );
}
export function reconcileNativeSource(
  quote: NativeTransferQuote,
  receipt: ExecutionReceipt,
): Readonly<NativeSourceOutcome> {
  transferRequire(
    receipt.logs.length <= 2048,
    "InvalidEvidence",
    "Native source receipt exceeds log bounds",
  );
  const route = NATIVE_ROUTES.find((r) => r.id === quote.routeId);
  transferRequire(route, "UnknownRoute", "unknown Native receipt route");
  const inbound = route.direction === "inbound-to-mezo";
  const event = resolveEvent({
    contractId: route.source.contractId,
    networkId: route.source.networkId,
    blockNumber: receipt.blockNumber,
    eventName: inbound ? "AssetsLocked" : "AssetsUnlocked",
  });
  const events = getReceiptLogs(receipt, quote.source.bridge).flatMap((log) => {
    const values = transferCodec.decodeEventWithHashes(event, log);
    return values === null ? [] : [values];
  });
  const values = events[0];
  transferRequire(
    events.length === 1 && values,
    "InvalidEvidence",
    "Native source needs one exact bridge event",
  );
  const sequence = parseUint(values[0]);
  transferRequire(sequence > 0n, "InvalidEvidence", "Native source sequence is zero");
  if (inbound) {
    transferRequire(
      parseAddress(values[1]) === quote.recipient &&
        parseAddress(values[2]) === quote.source.token &&
        parseUint(values[3]) === quote.amount,
      "InvalidEvidence",
      "Native lock tuple differs from intent",
    );
    const transfer = getTokenInterface().find((e) => e.type === "event" && e.name === "Transfer");
    transferRequire(transfer, "InvalidConfiguration", "token Transfer interface missing");
    const custody = getReceiptLogs(receipt, quote.source.token).flatMap((log) => {
      const value = transferCodec.decodeEvent(transfer, log);
      return value === null ? [] : [value];
    });
    transferRequire(
      custody.length === 1 &&
        parseAddress(custody[0]?.[0]) === quote.account &&
        parseAddress(custody[0]?.[1]) === quote.source.bridge &&
        parseUint(custody[0]?.[2]) === quote.amount,
      "InvalidEvidence",
      "Native source token custody differs",
    );
  } else {
    const recipientHash = values[1];
    transferRequire(
      recipientHash !== null &&
        typeof recipientHash === "object" &&
        "kind" in recipientHash &&
        recipientHash.kind === "indexed-hash" &&
        "hash" in recipientHash &&
        parseHash32(recipientHash.hash) === keccak256(quote.recipient) &&
        parseAddress(values[2]) === quote.destination.token &&
        parseAddress(values[3]) === quote.account &&
        parseUint(values[4]) === quote.amount &&
        parseUint(values[5], 8) === BigInt(route.targetChain ?? -1),
      "InvalidEvidence",
      "Native unlock tuple differs from intent",
    );
    // The verified native engine atomically consumes bank authorization and burns BTC.
    // It does not emit an ERC20 Transfer for that burn; a fabricated log is not required.
  }
  return Object.freeze({
    state: "source-confirmed",
    tuple: Object.freeze({
      sequence,
      recipient: quote.recipient,
      sender: quote.account,
      sourceToken: quote.source.token,
      destinationToken: quote.destination.token,
      amount: quote.amount,
      targetChain: inbound ? null : BigInt(route.targetChain ?? -1),
    }),
  });
}
function reinput(quote: NativeTransferQuote, sourceBlockNumber?: bigint): NativeTransferQuoteInput {
  return {
    account: quote.account,
    recipient: quote.recipient,
    amount: quote.amount,
    maxEstimatedDestinationFee: quote.maxEstimatedDestinationFee,
    sourceGasReserve: quote.sourceGasReserve,
    maxSourceAgeBlocks: quote.maxSourceAgeBlocks,
    maxDestinationAgeBlocks: quote.maxDestinationAgeBlocks,
    ...(sourceBlockNumber === undefined ? {} : { sourceBlockNumber }),
  };
}
/** Compose a Native source reader with Core execution, explicit transports and Mezo version reporting. */
export function createNativeTransferWriter(
  config: { readonly reader: NativeTransferReader; readonly execution: ExecutionClient } & Pick<
    NativeTransferReaderConfig,
    "sourceTransport" | "destinationTransport" | "getMezoClientVersion"
  >,
): Readonly<NativeTransferWriter> {
  const owned = new WeakSet<PreparedNativeTransfer>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedNativeTransfer>();
  function assertOwned(prepared: PreparedNativeTransfer) {
    transferRequire(owned.has(prepared), "InvalidInput", "prepare with this Native writer");
  }
  async function fresh(prepared: PreparedNativeTransfer, coordinate?: ReadCoordinate) {
    const original = prepared.quote;
    await transferAnchor(config.sourceTransport, original.source.coordinate);
    await transferAnchor(config.destinationTransport, original.destination.coordinate);
    const quote = await config.reader.quote(reinput(original, coordinate?.blockNumber));
    checkNativeQuote(quote);
    const sourceAge = quote.source.coordinate.blockNumber - original.source.coordinate.blockNumber,
      destinationAge =
        quote.destination.coordinate.blockNumber - original.destination.coordinate.blockNumber;
    transferRequire(
      sourceAge >= 0n &&
        sourceAge <= original.maxSourceAgeBlocks &&
        destinationAge >= 0n &&
        destinationAge <= original.maxDestinationAgeBlocks,
      "StaleQuote",
      "Native preparation expired on source or destination",
    );
    transferRequire(
      quote.source.bridge === original.source.bridge &&
        quote.destination.bridge === original.destination.bridge &&
        quote.source.token === original.source.token &&
        quote.destination.token === original.destination.token &&
        nativeTransferCalldata(quote) === prepared.transaction.data &&
        (coordinate === undefined || coordinate.blockHash === quote.source.coordinate.blockHash),
      "InvalidConfiguration",
      "Native exact call configuration changed",
    );
    transferRequire(
      quote.allowance >= quote.amount,
      "ApprovalRequired",
      "confirm Native token/spender approval and prepare again",
    );
  }
  return Object.freeze<NativeTransferWriter>({
    async prepare(input) {
      transferRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const quote = await config.reader.quote(input.quote);
      checkNativeQuote(quote);
      const transaction: Readonly<PreparedTransaction> = Object.freeze({
        operationId: input.operationId,
        contractId: quote.source.contractId,
        coordinate: quote.source.coordinate,
        from: quote.account,
        to: quote.source.bridge,
        value: 0n,
        data: nativeTransferCalldata(quote),
      });
      const prepared = Object.freeze({
        quote,
        transaction,
        approval: Object.freeze({
          token: quote.source.token,
          spender: quote.source.bridge,
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
      transferRequire(
        !prepared.approval.required,
        "ApprovalRequired",
        "confirm Native token/spender approval and prepare again",
      );
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (returnData, coordinate) => {
          await fresh(prepared, coordinate);
          const values = transferCodec.decodeFunction(operation(prepared.quote), returnData);
          transferRequire(
            prepared.quote.source.coordinate.networkId === "mezo-mainnet"
              ? values.length === 1 && values[0] === true
              : values.length === 0,
            "InvalidEvidence",
            "Native simulation returned an unsuccessful or unexpected result",
          );
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      transferRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "Native simulation does not match preparation",
      );
      return config.execution.submit(simulated, async () => fresh(prepared));
    },
    async reconcile(prepared, record) {
      assertOwned(prepared);
      const restored = parseSubmissionRecord(record),
        tx = prepared.transaction;
      transferRequire(
        restored.operationId === tx.operationId &&
          restored.contractId === tx.contractId &&
          restored.networkId === tx.coordinate.networkId &&
          restored.call.from === tx.from &&
          restored.call.to === tx.to &&
          restored.call.data === tx.data &&
          BigInt(restored.call.value) === 0n,
        "InvalidEvidence",
        "Native submission differs from prepared source intent",
      );
      return config.execution.reconcile(restored, async (receipt) => {
        const coordinate = {
          ...prepared.quote.source.coordinate,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
        };
        const route = NATIVE_ROUTES.find((r) => r.id === prepared.quote.routeId);
        transferRequire(route, "UnknownRoute", "unknown Native receipt route");
        if (route.source.networkId === "mezo-mainnet")
          await checkNativeClient(config.getMezoClientVersion);
        await transferEndpoint(route.source, config.sourceTransport, coordinate);
        const outcome = reconcileNativeSource(prepared.quote, receipt);
        await transferAnchor(config.sourceTransport, coordinate);
        return outcome;
      });
    },
  });
}
