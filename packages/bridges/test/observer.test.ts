import { expect, test } from "vitest";
import { parseHexData } from "@mezo-dev-kit/evm";
import { createNttDeliveryObserver, NttObserverError } from "@mezo-dev-kit/bridges";
import type { NttObserveInput, NttRouteId } from "@mezo-dev-kit/bridges";
import { NTT_ROUTES } from "../src/model.generated.ts";
import { messageDigest } from "../src/message.ts";
import {
  blockNumber,
  destinationHash,
  envelope,
  event,
  fixture,
  hash,
  otherHash,
  receipt,
  sourceHash,
} from "./fixtures.ts";

test.for(NTT_ROUTES.map((r) => r.id))(
  "joins confirmed source and destination evidence for %s",
  async (routeId) => {
    const f = fixture(routeId),
      result = await f.observer.observe(f.input);
    expect(result.state).toBe("completed");
    expect(result.digest).toBe(f.digest);
    expect(result.completionTransactions).toEqual([destinationHash]);
    expect(result.source.evidence).toBe("sent");
    expect(result.destinations[0]?.evidence).toBe("redeemed");
    expect(result.coverage).toBe("provided-receipts-only");
  },
);
test("a successful source with no destination candidates remains pending", async () => {
  const f = fixture(),
    result = await f.observer.observe({ ...f.input, destinationTransactionHashes: [] });
  expect(result.state).toBe("message-pending");
  expect(result.completionTransactions).toEqual([]);
});
test("missing source receipts never establish delivery even if a destination succeeds", async () => {
  const f = fixture();
  f.source.receipts.clear();
  const result = await f.observer.observe(f.input);
  expect(result.state).toBe("source-pending");
  expect(result.digest).toBeNull();
});
test("source revert requires its own confirmation policy", async () => {
  const f = fixture();
  f.source.receipts.set(sourceHash, receipt(sourceHash, [], "0x0"));
  expect((await f.observer.observe(f.input)).state).toBe("source-reverted");
  f.source.port.getBlockNumber.mockResolvedValue(blockNumber);
  expect((await f.observer.observe(f.input)).state).toBe("source-pending");
});
test("source and destination finality are independent and include the inclusion block", async () => {
  const f = fixture();
  f.source.port.getBlockNumber.mockResolvedValue(blockNumber);
  expect((await f.observer.observe(f.input)).state).toBe("source-pending");
  f.source.port.getBlockNumber.mockResolvedValue(blockNumber + 1n);
  f.destination.port.getBlockNumber.mockResolvedValue(blockNumber);
  expect((await f.observer.observe(f.input)).state).toBe("message-pending");
  f.destination.port.getBlockNumber.mockResolvedValue(blockNumber + 1n);
  expect((await f.observer.observe(f.input)).state).toBe("completed");
});
test("outbound queue evidence does not create a digest or destination completion", async () => {
  const f = fixture();
  f.source.receipts.set(
    sourceHash,
    receipt(sourceHash, [
      event(f.route.source.networkId, "OutboundTransferQueued", [1n], sourceHash),
    ]),
  );
  const result = await f.observer.observe(f.input);
  expect(result.state).toBe("source-queued");
  expect(result.digest).toBeNull();
  expect(result.completionTransactions).toEqual([]);
});
test("a matching inbound queue remains incomplete until a later redemption", async () => {
  const f = fixture();
  f.destination.receipts.set(
    otherHash,
    receipt(otherHash, [
      event(f.route.destination.networkId, "InboundTransferQueued", [f.digest], otherHash),
    ]),
  );
  expect(
    (await f.observer.observe({ ...f.input, destinationTransactionHashes: [otherHash] })).state,
  ).toBe("destination-queued");
  const result = await f.observer.observe({
    ...f.input,
    destinationTransactionHashes: [otherHash, destinationHash],
  });
  expect(result.state).toBe("completed");
  expect(result.destinations[0]?.evidence).toBe("inbound-queued");
});
test("later failed, missing and unavailable candidates cannot demote a canonical completion", async () => {
  const f = fixture();
  f.destination.receipts.set(otherHash, receipt(otherHash, [], "0x0"));
  const failedHash = hash("4"),
    missingHash = hash("5");
  f.destination.port.getReceipt.mockImplementation(async (tx) => {
    if (tx === failedHash) throw new Error("private endpoint detail");
    return f.destination.receipts.get(tx) ?? null;
  });
  const result = await f.observer.observe({
    ...f.input,
    destinationTransactionHashes: [destinationHash, otherHash, failedHash, missingHash],
  });
  expect(result.state).toBe("completed");
  expect(result.destinations.map((d) => d.state)).toEqual([
    "confirmed",
    "reverted",
    "unavailable",
    "missing",
  ]);
  expect(result.issues).toEqual([
    { code: "TransportFailure", stage: "receipt", message: "observation transport failed" },
  ]);
});
test("unrelated redemption digests and lookalike emitting addresses do not prove delivery", async () => {
  const f = fixture();
  const wrongDigest = event(
    f.route.destination.networkId,
    "TransferRedeemed",
    [hash("f")],
    destinationHash,
  );
  f.destination.receipts.set(destinationHash, receipt(destinationHash, [wrongDigest]));
  expect((await f.observer.observe(f.input)).state).toBe("message-pending");
  f.destination.receipts.set(
    destinationHash,
    receipt(destinationHash, [{ ...f.redeem, address: `0x${"9".repeat(40)}` }]),
  );
  expect((await f.observer.observe(f.input)).state).toBe("message-pending");
});
test.for(["source", "destination"] as const)("chain mismatch on %s is explicit", async (side) => {
  const f = fixture();
  f[side].port.getChainId.mockResolvedValue(999n);
  const result = await f.observer.observe(f.input);
  expect(result.state).toBe("ambiguous");
  expect(result.issues.some((i) => i.code === "ChainMismatch")).toBe(true);
  expect(result.completionTransactions).toEqual([]);
});
test("destination endpoint failure remains visible with an empty candidate set", async () => {
  const f = fixture();
  f.destination.port.getBlockNumber.mockRejectedValue(new Error("offline"));
  const result = await f.observer.observe({ ...f.input, destinationTransactionHashes: [] });
  expect(result.state).toBe("ambiguous");
  expect(result.issues[0]?.code).toBe("TransportFailure");
});
test.for(["source", "destination"] as const)(
  "a saved %s block anchor detects a reorg",
  async (side) => {
    const f = fixture();
    f[side].port.getBlock.mockImplementation(async (number) => ({ number, hash: hash("b") }));
    const result = await f.observer.observe({
      ...f.input,
      previous: { source: f.anchor(sourceHash), destinations: [f.anchor(destinationHash)] },
    });
    expect(result.state).toBe("reorged");
    expect(result.completionTransactions).toEqual([]);
  },
);
test("receipt disappearance after a prior block reorg is distinct from an unseen transaction", async () => {
  const f = fixture();
  f.source.receipts.clear();
  f.source.port.getBlock.mockImplementation(async (number) => ({ number, hash: hash("b") }));
  expect(
    (await f.observer.observe({ ...f.input, previous: { source: f.anchor(sourceHash) } })).state,
  ).toBe("reorged");
});
test("all completion anchors are rechecked after later candidate reads", async () => {
  const f = fixture();
  f.destination.port.getReceipt.mockImplementation(async (tx) => {
    if (tx === otherHash)
      f.destination.port.getBlock.mockImplementation(async (number) => ({
        number,
        hash: hash("b"),
      }));
    return f.destination.receipts.get(tx) ?? null;
  });
  const result = await f.observer.observe({
    ...f.input,
    destinationTransactionHashes: [destinationHash, otherHash],
  });
  expect(result.state).toBe("reorged");
  expect(result.completionTransactions).toEqual([]);
});
test("chain switching during observation invalidates earlier receipt evidence", async () => {
  const f = fixture();
  f.destination.port.getChainId.mockResolvedValueOnce(1n).mockResolvedValue(999n);
  const result = await f.observer.observe(f.input);
  expect(result.state).toBe("ambiguous");
  expect(result.issues.some((i) => i.code === "ChainMismatch")).toBe(true);
});
test("a final destination chain failure remains visible without destination candidates", async () => {
  const f = fixture();
  f.destination.port.getChainId.mockResolvedValueOnce(1n).mockResolvedValue(999n);
  const result = await f.observer.observe({ ...f.input, destinationTransactionHashes: [] });
  expect(result.state).toBe("ambiguous");
  expect(result.issues.some((i) => i.code === "ChainMismatch")).toBe(true);
});
test("sparse candidate arrays and null or sparse saved anchors fail before observation", async () => {
  const f = fixture();
  const inputs: unknown[] = [
    { ...f.input, destinationTransactionHashes: Array(1) },
    { ...f.input, previous: { destinations: null } },
    { ...f.input, previous: { destinations: Array(1) } },
  ];
  for (const input of inputs)
    await expect(f.observer.observe(input as NttObserveInput)).rejects.toMatchObject({
      code: "InvalidInput",
    });
  expect(f.source.port.getChainId).not.toHaveBeenCalled();
});
test.for([
  { transactionHash: otherHash },
  { status: "0x2" },
  { blockNumber: "0x00" },
  { logs: Array.from({ length: 2049 }, () => ({})) },
])("malformed source receipt %j cannot establish a message", async (patch) => {
  const f = fixture();
  f.source.receipts.set(sourceHash, { ...receipt(sourceHash, [f.send]), ...patch });
  const result = await f.observer.observe(f.input);
  expect(result.state).toBe("ambiguous");
  expect(result.source.state).toBe("invalid");
});
test.for([
  { removed: true },
  { transactionHash: otherHash },
  { blockHash: hash("b") },
  { blockNumber: "0x1" },
])("mismatched source log %j is rejected", async (patch) => {
  const f = fixture();
  f.source.receipts.set(sourceHash, receipt(sourceHash, [{ ...f.send, ...patch }]));
  expect((await f.observer.observe(f.input)).source.state).toBe("invalid");
});
test("duplicate event indices and duplicate matching destination events fail", async () => {
  const f = fixture();
  f.destination.receipts.set(destinationHash, receipt(destinationHash, [f.redeem, f.redeem]));
  expect((await f.observer.observe(f.input)).destinations[0]?.state).toBe("invalid");
  f.destination.receipts.set(
    destinationHash,
    receipt(destinationHash, [f.redeem, { ...f.redeem, logIndex: "0x1" }]),
  );
  expect((await f.observer.observe(f.input)).destinations[0]?.state).toBe("invalid");
});
test("multiple source messages require an explicit unique digest", async () => {
  const f = fixture(),
    alternate = parseHexData(`${envelope.slice(0, -2)}ee`);
  const second = event(
    f.route.source.networkId,
    "SendTransceiverMessage",
    f.sendValues(alternate),
    sourceHash,
    1,
  );
  f.source.receipts.set(sourceHash, receipt(sourceHash, [f.send, second]));
  expect((await f.observer.observe(f.input)).state).toBe("ambiguous");
  expect((await f.observer.observe({ ...f.input, expectedDigest: f.digest })).state).toBe(
    "completed",
  );
  expect((await f.observer.observe({ ...f.input, expectedDigest: hash("f") })).state).toBe(
    "ambiguous",
  );
});
test("route peer and recipient-chain mismatches are not accepted as source messages", async () => {
  const f = fixture();
  for (const values of [
    [999n, f.sendValues()[1]!],
    [2n, [hash("f"), hash("f"), envelope, "0x"]],
  ] as const) {
    f.source.receipts.set(
      sourceHash,
      receipt(sourceHash, [
        event(f.route.source.networkId, "SendTransceiverMessage", values, sourceHash),
      ]),
    );
    expect((await f.observer.observe(f.input)).state).toBe("ambiguous");
  }
});
test("NTT envelope length and chain-width validation prevent ambiguous digests", () => {
  expect(messageDigest(50n, envelope)).not.toBe(messageDigest(2n, envelope));
  for (const value of [
    "0x",
    `${envelope}00`,
    envelope.slice(0, -2),
    `${envelope.slice(0, 130)}0002ff`,
  ])
    expect(() => messageDigest(50n, value)).toThrow();
  expect(() => messageDigest(65536n, envelope)).toThrow();
  expect(() => messageDigest(0n, envelope)).toThrow();
});
test("invalid configuration and unbounded or conflicting inputs fail before transport calls", async () => {
  const f = fixture();
  expect(() => createNttDeliveryObserver({ ...f.config, sourceConfirmations: 0n })).toThrow(
    NttObserverError,
  );
  expect(() =>
    createNttDeliveryObserver({ ...f.config, routeId: "unknown" as NttRouteId }),
  ).toThrow(NttObserverError);
  expect(() => {
    Reflect.apply(createNttDeliveryObserver, undefined, [{ ...f.config, sourceTransport: null }]);
  }).toThrow(NttObserverError);
  const inputs: unknown[] = [
    null,
    { ...f.input, sourceTransactionHash: "bad" },
    { ...f.input, destinationTransactionHashes: [destinationHash, destinationHash] },
    { ...f.input, destinationTransactionHashes: Array(33).fill(destinationHash) },
    { ...f.input, previous: { source: f.anchor(otherHash) } },
    { ...f.input, previous: { destinations: [f.anchor(otherHash)] } },
  ];
  for (const input of inputs)
    await expect(f.observer.observe(input as NttObserveInput)).rejects.toMatchObject({
      code: "InvalidInput",
    });
  expect(f.source.port.getChainId).not.toHaveBeenCalled();
  expect(f.destination.port.getChainId).not.toHaveBeenCalled();
});
