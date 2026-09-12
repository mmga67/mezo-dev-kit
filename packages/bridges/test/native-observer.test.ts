import { expect, test } from "vitest";
import { createNativeDeliveryObserver } from "../src/index.ts";
import { nativeFixture } from "./native-fixture.ts";
import { object, objects, values } from "../../../scripts/lib/json.ts";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseRpcQuantity,
  parseUint,
} from "@mezo-dev-kit/evm";
import { getTokenInterface, resolveHistoricalContractEvidence } from "@mezo-dev-kit/contracts";

test.for([true, false])(
  "joins the complete pinned Native direction, inbound=%s",
  async (inbound) => {
    const f = await nativeFixture(inbound),
      r = await createNativeDeliveryObserver(f.config).observe(f.input);
    expect(r.state).toBe("completed");
    expect(r.completionTransactions).toEqual(f.input.destinationTransactionHashes);
    expect(r.source.proof).toBe("source-validated");
    const settlement = r.destinations[0]?.settlement;
    expect(settlement).not.toBeNull();
    expect(settlement?.gross).toBe((settlement?.net ?? 0n) + (settlement?.fee ?? 0n));
    expect(f.calls.some((c) => /send|broadcast|estimateGas/.test(c.method))).toBe(false);
  },
);
test.for([
  "skipped mint",
  "different mapping",
  "other consensus transaction",
  "wrong consensus chain",
  "wrong consensus parent",
  "sequence only",
  "ordinary sender",
] as const)("does not complete inbound for %s", async (kind) => {
  const f = await nativeFixture();
  if (kind === "skipped mint") f.probe(27).result = f.probe(20).result;
  if (kind === "different mapping") f.probe(26).result = `0x${"00".repeat(64)}`;
  if (kind === "other consensus transaction")
    object(object(f.consensus.block, "block").data, "data").txs = ["YQ==", "Yg=="];
  if (kind === "wrong consensus chain")
    object(object(f.consensus.block, "block").header, "header").chain_id = "wrong-chain";
  if (kind === "wrong consensus parent")
    object(
      object(object(f.consensus.block, "block").header, "header").last_block_id,
      "parent",
    ).hash = "ab".repeat(32);
  if (kind === "sequence only") f.probe(24).result = f.probe(17).result;
  if (kind === "ordinary sender")
    object(f.probe(34).result, "transaction").from = object(f.probe(9).result, "source").from;
  const r = await createNativeDeliveryObserver(f.config).observe(f.input);
  expect(r.state).not.toBe("completed");
  expect(r.completionTransactions).toEqual([]);
  expect(r.destinations[0]?.issue?.code).toBe(
    ["wrong consensus chain", "wrong consensus parent", "ordinary sender"].includes(kind)
      ? "InvalidEvidence"
      : "DeliveryUnproven",
  );
});
test("requires consensus coverage even when the balance delta and EVM system transaction match", async () => {
  const f = await nativeFixture(),
    { getMezoConsensusBlock: unused, ...config } = f.config;
  expect(unused).toBeDefined();
  const r = await createNativeDeliveryObserver(config).observe(f.input);
  expect(r.destinations[0]?.proof).toBe("payload-accepted");
  expect(r.destinations[0]?.issue?.code).toBe("DeliveryUnproven");
  expect(r.state).toBe("destination-progress");
});
test.for([
  "no attestation",
  "no confirmation",
  "missing fee",
  "wrong recipient",
  "wrong net",
  "wrong source value",
  "wrong implementation",
  "failed receipt",
] as const)("preserves incomplete outbound evidence for %s", async (kind) => {
  const f = await nativeFixture(false),
    receipt = object(f.probe(10).result, "receipt"),
    logs = objects(receipt.logs, "logs");
  const abi = [
      ...resolveHistoricalContractEvidence({
        contractId: "bridge.native-mezo-bridge",
        networkId: "ethereum-mainnet",
        blockNumber: parseRpcQuantity(receipt.blockNumber),
      }).readAbi,
      ...getTokenInterface(),
    ],
    codec = createAbiCodec();
  function event(log: Record<string, unknown>, name: string) {
    const entry = abi.find((e) => e.type === "event" && e.name === name);
    if (!entry) throw new Error("event ABI missing");
    return codec.decodeEventWithHashes(entry, {
      data: log.data,
      topics: values(log.topics, "topics"),
    });
  }
  const expectedRecipient = parseAddress(object(f.probe(36).result, "source").from);
  if (kind === "no attestation")
    receipt.logs = logs.filter((l) => event(l, "AssetsUnlockAttested") === null);
  if (kind === "no confirmation")
    receipt.logs = logs.filter((l) => event(l, "AssetsUnlockConfirmed") === null);
  if (kind === "missing fee")
    receipt.logs = logs.filter((l) => {
      const v = event(l, "Transfer");
      return v === null || parseAddress(v[1]) === expectedRecipient;
    });
  if (kind === "wrong recipient" || kind === "wrong net") {
    const log = logs.find((l) => {
      const v = event(l, "Transfer");
      return v !== null && parseAddress(v[1]) === expectedRecipient;
    });
    if (!log) throw new Error("recipient fixture missing");
    const topics = log.topics;
    if (!Array.isArray(topics)) throw new Error("topics missing");
    if (kind === "wrong recipient") topics[2] = `0x${"00".repeat(12)}${"ab".repeat(20)}`;
    else {
      const decoded = event(log, "Transfer");
      if (!decoded) throw new Error("transfer missing");
      log.data = `0x${(parseUint(decoded[2]) + 1n).toString(16).padStart(64, "0")}`;
    }
  }
  if (kind === "wrong source value") object(f.probe(36).result, "source").value = "0x1";
  if (kind === "wrong implementation") f.probe(7).result = `0x${"00".repeat(32)}`;
  if (kind === "failed receipt") receipt.status = "0x0";
  const r = await createNativeDeliveryObserver(f.config).observe(f.input);
  expect(r.state).not.toBe("completed");
  expect(r.completionTransactions).toEqual([]);
});
test("one unavailable candidate cannot erase another canonical completion", async () => {
  const f = await nativeFixture(false),
    extra = parseHash32(`0x${"ab".repeat(32)}`),
    transport = f.config.destinationTransport;
  const r = await createNativeDeliveryObserver({
    ...f.config,
    destinationTransport: {
      ...transport,
      getReceipt: async (h) => {
        if (h === extra) throw new Error("provider refused");
        return transport.getReceipt(h);
      },
    },
  }).observe({
    ...f.input,
    destinationTransactionHashes: [...f.input.destinationTransactionHashes, extra],
  });
  expect(r.state).toBe("completed");
  expect(r.destinations[1]?.state).toBe("unavailable");
  expect(r.completionTransactions).toEqual(f.input.destinationTransactionHashes);
});
test("rechecks the parent state anchor before reporting inbound completion", async () => {
  const f = await nativeFixture(),
    transport = f.config.destinationTransport;
  const r = await createNativeDeliveryObserver({
    ...f.config,
    destinationTransport: {
      ...transport,
      getBlock: async (n) => {
        const block = await transport.getBlock(n);
        if (n === 8944560n && block) return { ...block, hash: `0x${"ab".repeat(32)}` };
        return block;
      },
    },
  }).observe(f.input);
  expect(r.completionTransactions).toEqual([]);
  expect(r.destinations[0]?.state).toBe("reorged");
});
test("retains missing destinations as pending and distinguishes source reversion", async () => {
  const f = await nativeFixture();
  const observer = createNativeDeliveryObserver(f.config);
  const pending = await observer.observe({ ...f.input, destinationTransactionHashes: [] });
  expect(pending.state).toBe("message-pending");
  object(f.probe(8).result, "source").status = "0x0";
  const reverted = await observer.observe(f.input);
  expect(reverted.state).toBe("source-reverted");
  expect(reverted.completionTransactions).toEqual([]);
});
test("requires independent confirmations on both chains", async () => {
  const f = await nativeFixture(false);
  const r = await createNativeDeliveryObserver({
    ...f.config,
    destinationConfirmations: 2n,
  }).observe(f.input);
  expect(r.state).toBe("destination-progress");
  expect(r.destinations[0]?.state).toBe("included");
  expect(r.completionTransactions).toEqual([]);
});
test("rejects duplicate candidates and cancellation before I/O", async () => {
  const f = await nativeFixture(),
    observer = createNativeDeliveryObserver(f.config);
  await expect(
    observer.observe({
      ...f.input,
      destinationTransactionHashes: [
        ...f.input.destinationTransactionHashes,
        ...f.input.destinationTransactionHashes,
      ],
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  const controller = new AbortController();
  controller.abort();
  await expect(observer.observe({ ...f.input, signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(f.calls).toEqual([]);
});

test("captures previous anchors before asynchronous reads so caller mutation cannot hide a reorg", async () => {
  const f = await nativeFixture(),
    receipt = object(f.probe(8).result, "source"),
    originalHash = parseHash32(receipt.blockHash),
    changedHash = parseHash32(`0x${"ab".repeat(32)}`);
  const previous = {
    transactionHash: f.input.sourceTransactionHash,
    blockNumber: parseRpcQuantity(receipt.blockNumber),
    blockHash: changedHash,
  };
  const transport = f.config.sourceTransport;
  const r = await createNativeDeliveryObserver({
    ...f.config,
    sourceTransport: {
      ...transport,
      getChainId: async () => {
        previous.blockHash = originalHash;
        return transport.getChainId();
      },
    },
  }).observe({ ...f.input, previous: { source: previous } });
  expect(r.source.state).toBe("reorged");
  expect(r.completionTransactions).toEqual([]);
});
