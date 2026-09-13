import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { resolveContract, resolveOperation } from "@mezo-dev-kit/contracts";
import {
  createAbiCodec,
  keccak256,
  parseHash32,
  parseHexData,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createNttRecoveryWriter } from "../src/index.ts";
import type { NttRecoveryInput } from "../src/index.ts";
import { nttExpectedMessage } from "../src/ntt-transfer-writer.ts";
import { wormholeAddress } from "../src/ntt-transfer-reader.ts";
import { messageDigest } from "../src/message.ts";
import { event, sourceHash } from "./fixtures.ts";
import { nttReturn, nttTransferFixture } from "./ntt-transfer-fixture.ts";

const codec = createAbiCodec();
async function fixture() {
  const f = await nttTransferFixture(),
    quote = await f.reader.quote(f.input);
  const message = nttExpectedMessage(quote, 42n),
    digest = messageDigest(BigInt(f.route.source.wormholeChainId), message);
  const sourceLog = event(
    f.route.source.networkId,
    "SendTransceiverMessage",
    [
      BigInt(f.route.destination.wormholeChainId),
      [
        wormholeAddress(quote.source.manager),
        wormholeAddress(quote.destination.manager),
        message,
        "0x",
      ],
    ],
    sourceHash,
  );
  f.source.transport.getReceipt.mockResolvedValue({
    transactionHash: sourceHash,
    blockNumber: toRpcQuantity(f.source.blockNumber),
    blockHash: f.source.blockHash,
    status: "0x1",
    logs: [
      {
        ...sourceLog,
        blockNumber: toRpcQuantity(f.source.blockNumber),
        blockHash: f.source.blockHash,
      },
    ],
  });
  const overrides = {
    source: new Map<string, `0x${string}`>(),
    destination: new Map<string, `0x${string}`>(),
  };
  for (const name of ["source", "destination"] as const) {
    const original = f[name].transport.read.getMockImplementation()!;
    f[name].transport.read.mockImplementation(
      async (call) => overrides[name].get(`${call.address}:${call.data}`) ?? original(call),
    );
  }
  function set(
    side: "source" | "destination",
    name: string,
    args: readonly AbiValue[],
    results: readonly AbiValue[],
    transceiver = false,
  ) {
    const endpoint = f.route[side],
      contract = resolveContract({
        contractId: transceiver ? endpoint.transceiverId : endpoint.managerId,
        networkId: endpoint.networkId,
        blockNumber: f[side].blockNumber,
      });
    const entry = contract.readAbi.find((e) => e.type === "function" && e.name === name);
    assert(entry);
    overrides[side].set(
      `${contract.address}:${codec.encodeFunction(entry, args)}`,
      nttReturn(entry, results),
    );
  }
  function outbound(timestamp = quote.source.timestamp - quote.source.rateLimitDuration) {
    set(
      "source",
      "getOutboundQueuedTransfer",
      [42n],
      [
        [
          wormholeAddress(f.input.recipient),
          wormholeAddress(f.input.refundRecipient),
          quote.packedAmount,
          timestamp,
          BigInt(f.route.destination.wormholeChainId),
          f.input.account,
          quote.instructions,
        ],
      ],
    );
  }
  outbound();
  set("destination", "getInboundQueuedTransfer", [digest], [[0n, 0n, `0x${"0".repeat(40)}`]]);
  set("destination", "isMessageExecuted", [digest], [false]);
  set("destination", "isMessageApproved", [digest], [true]);
  f.destination.transport.simulate.mockResolvedValue("0x");
  const recovery = createNttRecoveryWriter({
    ...f.config,
    sourceExecution: f.execution,
    destinationExecution: f.destinationExecution,
    sourceConfirmations: 1n,
    destinationConfirmations: 1n,
    maxSourceAgeBlocks: 2n,
    maxDestinationAgeBlocks: 2n,
  });
  const base = { operationId: "recovery", account: f.input.account, maxNativeFee: 100n };
  const sourceInput: NttRecoveryInput = {
    ...base,
    kind: "complete-outbound",
    sequence: 42n,
    amount: f.input.amount,
    recipient: f.input.recipient,
    refundRecipient: f.input.refundRecipient,
  };
  return { ...f, quote, message, digest, set, outbound, recovery, base, sourceInput };
}
test("outbound cancellation remains possible without destination RPC and transfers no new value", async () => {
  const f = await fixture();
  f.destination.transport.getChainId.mockRejectedValue(new Error("destination offline"));
  f.source.transport.simulate.mockResolvedValue("0x");
  const prepared = await f.recovery.prepare({ ...f.sourceInput, kind: "cancel-outbound" });
  expect(prepared.transaction.value).toBe(0n);
  expect(prepared.quote).toBeNull();
  await f.recovery.submit(prepared, await f.recovery.simulate(prepared));
  expect(f.sent).toHaveLength(1);
  const entry = resolveOperation({
    contractId: "bridge.musd-ntt-manager",
    networkId: f.route.source.networkId,
    blockNumber: f.source.blockNumber,
    functionName: "cancelOutboundQueuedTransfer",
  }).functionAbi;
  expect(codec.decodeCalldata(entry, f.sent[0]!.data)).toEqual([42n]);
});
test("queued source completion sends its original sequence and never prepares a token transfer", async () => {
  const f = await fixture();
  const entry = resolveOperation({
    contractId: "bridge.musd-ntt-manager",
    networkId: f.route.source.networkId,
    blockNumber: f.source.blockNumber,
    functionName: "completeOutboundQueuedTransfer",
  }).functionAbi;
  f.source.transport.simulate.mockResolvedValue(nttReturn(entry, [42n]));
  const prepared = await f.recovery.prepare(f.sourceInput);
  await f.recovery.submit(prepared, await f.recovery.simulate(prepared));
  expect(codec.decodeCalldata(entry, f.sent[0]!.data)).toEqual([42n]);
  expect(f.sent[0]!.value).toBe(0n);
});
test("queue timeout boundary is inclusive and cannot be skipped", async () => {
  const f = await fixture();
  f.outbound(f.quote.source.timestamp - f.quote.source.rateLimitDuration + 1n);
  await expect(f.recovery.prepare(f.sourceInput)).rejects.toMatchObject({
    code: "RecoveryUnavailable",
  });
  expect(f.sent).toHaveLength(0);
  f.outbound(f.quote.source.timestamp - f.quote.source.rateLimitDuration);
  await expect(f.recovery.prepare(f.sourceInput)).resolves.toHaveProperty("sequence", 42n);
});
test("a missing or mismatched source queue never causes a new transfer", async () => {
  const f = await fixture();
  f.outbound(0n);
  await expect(f.recovery.prepare(f.sourceInput)).rejects.toMatchObject({
    code: "RecoveryUnavailable",
  });
  expect(f.sent).toHaveLength(0);
  f.outbound();
  await expect(
    f.recovery.prepare({ ...f.sourceInput, amount: f.input.amount * 2n }),
  ).rejects.toMatchObject({ code: "RecoveryUnavailable" });
});
test("an approved destination message requires matching confirmed source evidence", async () => {
  const f = await fixture(),
    input = {
      ...f.base,
      kind: "execute-approved" as const,
      sourceTransactionHash: sourceHash,
      message: f.message,
    };
  const prepared = await f.recovery.prepare(input);
  expect(prepared.sourceTransaction).toBe(false);
  expect(prepared.digest).toBe(f.digest);
  await f.recovery.submit(prepared, await f.recovery.simulate(prepared));
  expect(f.sent).toHaveLength(1);
  f.source.transport.getReceipt.mockResolvedValue(null);
  await expect(f.recovery.prepare({ ...input, operationId: "absent" })).rejects.toMatchObject({
    code: "InvalidEvidence",
  });
});
test("destination execution refuses missing approval and already executed messages", async () => {
  const f = await fixture(),
    input = {
      ...f.base,
      kind: "execute-approved" as const,
      sourceTransactionHash: sourceHash,
      message: f.message,
    };
  f.set("destination", "isMessageApproved", [f.digest], [false]);
  await expect(f.recovery.prepare(input)).rejects.toMatchObject({ code: "RecoveryUnavailable" });
  f.set("destination", "isMessageApproved", [f.digest], [true]);
  f.set("destination", "isMessageExecuted", [f.digest], [true]);
  await expect(f.recovery.prepare(input)).rejects.toMatchObject({ code: "RecoveryUnavailable" });
  expect(f.sent).toHaveLength(0);
});
test("inbound queued recovery validates recipient, trimmed amount and delay", async () => {
  const f = await fixture(),
    input = {
      ...f.base,
      kind: "complete-inbound" as const,
      sourceTransactionHash: sourceHash,
      message: f.message,
    };
  f.set(
    "destination",
    "getInboundQueuedTransfer",
    [f.digest],
    [
      [
        f.quote.packedAmount,
        f.quote.destination.timestamp - f.quote.destination.rateLimitDuration,
        f.input.recipient,
      ],
    ],
  );
  const prepared = await f.recovery.prepare(input);
  expect(prepared.amount).toBe(f.quote.destinationAmount);
  await f.recovery.submit(prepared, await f.recovery.simulate(prepared));
  expect(f.sent).toHaveLength(1);
  f.set(
    "destination",
    "getInboundQueuedTransfer",
    [f.digest],
    [[f.quote.packedAmount, f.quote.destination.timestamp, f.input.recipient]],
  );
  await expect(f.recovery.prepare(input)).rejects.toMatchObject({ code: "RecoveryUnavailable" });
});
test("manual VAA recovery rejects malformed headers and mismatched emitter bodies", async () => {
  const f = await fixture(),
    input = {
      ...f.base,
      kind: "receive-attestation" as const,
      sourceTransactionHash: sourceHash,
      message: f.message,
    };
  await expect(f.recovery.prepare({ ...input, vaa: parseHexData("0x00") })).rejects.toMatchObject({
    code: "InvalidEvidence",
  });
  const wrongEmitter = parseHexData(`0x010000000001${"0".repeat(132)}${"0".repeat(102)}00`);
  await expect(f.recovery.prepare({ ...input, vaa: wrongEmitter })).rejects.toMatchObject({
    code: "InvalidEvidence",
  });
  expect(f.sent).toHaveLength(0);
});
test("foreign messages cannot use a saved source digest as intended-recipient proof", async () => {
  const f = await fixture();
  const changed = parseHexData(`${f.message.slice(0, -4)}0001`);
  const input = {
    ...f.base,
    kind: "execute-approved" as const,
    sourceTransactionHash: sourceHash,
    message: changed,
  };
  await expect(f.recovery.prepare(input)).rejects.toMatchObject({ code: "InvalidEvidence" });
  const invalid = parseHexData(
    `0x${parseHash32(`0x${"f".repeat(64)}`).slice(2)}${f.message.slice(66)}`,
  );
  await expect(f.recovery.prepare({ ...input, message: invalid })).rejects.toThrow();
});
test("matching VAA bytes still require deployed guardian verification before a wallet call", async () => {
  const f = await fixture();
  const body = `0000000000000000${f.route.source.wormholeChainId.toString(16).padStart(4, "0")}${wormholeAddress(f.quote.source.transceiver).slice(2)}0000000000000001009945ff10${wormholeAddress(f.quote.source.manager).slice(2)}${wormholeAddress(f.quote.destination.manager).slice(2)}0091${f.message.slice(2)}0000`;
  // Deliberately invalid guardian signature with an otherwise matching envelope.
  const vaa = parseHexData(`0x010000000001${"00".repeat(66)}${body}`),
    hash = keccak256(keccak256(parseHexData(`0x${body}`)));
  f.set("destination", "isVAAConsumed", [hash], [false], true);
  const prepared = await f.recovery.prepare({
    ...f.base,
    kind: "receive-attestation",
    sourceTransactionHash: sourceHash,
    message: f.message,
    vaa,
  });
  const entry = resolveOperation({
    contractId: f.route.destination.transceiverId,
    networkId: f.route.destination.networkId,
    blockNumber: f.destination.blockNumber,
    functionName: "receiveMessage",
  }).functionAbi;
  expect(codec.decodeCalldata(entry, prepared.transaction.data)).toEqual([vaa]);
  f.destination.transport.simulate.mockRejectedValue(new Error("guardian verification failed"));
  await expect(f.recovery.simulate(prepared)).rejects.toMatchObject({ code: "SimulationFailed" });
  expect(f.sent).toHaveLength(0);
  f.set("destination", "isVAAConsumed", [hash], [true], true);
  await expect(f.recovery.prepare(prepared.input)).rejects.toMatchObject({
    code: "RecoveryUnavailable",
  });
});
