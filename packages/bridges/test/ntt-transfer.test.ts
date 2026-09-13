import { expect, test } from "vitest";
import { createAbiCodec, parseAddress, parseHexData } from "@mezo-dev-kit/evm";
import { resolveContract, resolveOperation } from "@mezo-dev-kit/contracts";
import { createNttTransferReader, createNttTokenTargetResolver } from "../src/index.ts";
import { NTT_ROUTES } from "../src/model.generated.ts";
import { nttTrimAmount } from "../src/ntt-transfer-reader.ts";
import { nttExpectedMessage, reconcileNttSource } from "../src/ntt-transfer-writer.ts";
import { event, sourceHash } from "./fixtures.ts";
import { nttReturn, nttTransferFixture } from "./ntt-transfer-fixture.ts";

test.for(NTT_ROUTES.map((r) => r.id))(
  "reads captured %s configuration and exact registered-index fee",
  async (routeId) => {
    const f = await nttTransferFixture(routeId),
      quote = await f.reader.quote(f.input);
    expect(quote.source.transceiverIndex).toBe(1n);
    expect(quote.instructions).toBe("0x01010101");
    expect(quote.nativeFee).toBe(0n);
    expect(quote.destinationAmount).toBe(f.input.amount);
    expect(quote.packedAmount).toBe((100_000_000n << 8n) | 8n);
    expect(quote.source.coordinate.blockHash).toBe(f.source.blockHash);
    expect(quote.destination.coordinate.blockHash).toBe(f.destination.blockHash);
  },
);
test("rejects precision loss instead of silently reducing transferred value", () => {
  expect(nttTrimAmount(10n ** 10n, 18, 18).trimmedAmount).toBe(1n);
  expect(() => nttTrimAmount(10n ** 10n - 1n, 18, 18)).toThrow(
    expect.objectContaining({ code: "AmountHasDust" }),
  );
  expect(() => nttTrimAmount(10n ** 10n + 1n, 18, 18)).toThrow(
    expect.objectContaining({ code: "AmountHasDust" }),
  );
  expect(nttTrimAmount(((1n << 64n) - 1n) * 10n ** 10n, 18, 18).trimmedAmount).toBe(
    (1n << 64n) - 1n,
  );
  expect(() => nttTrimAmount((1n << 64n) * 10n ** 10n, 18, 18)).toThrow();
  expect(nttTrimAmount(1230000000000000000n, 18, 6).destinationAmount).toBe(1230000n);
});
test("rejects chain mismatch before reading configuration", async () => {
  const f = await nttTransferFixture();
  f.source.transport.getChainId.mockResolvedValue(1n);
  await expect(f.reader.quote(f.input)).rejects.toMatchObject({ code: "ChainMismatch" });
  expect(f.source.transport.read).not.toHaveBeenCalled();
});
test("rejects changed runtime and token code", async () => {
  const f = await nttTransferFixture();
  f.source.transport.getCode.mockResolvedValue(parseHexData("0x01"));
  await expect(f.reader.quote(f.input)).rejects.toMatchObject({ code: "RuntimeMismatch" });
});
test("rejects a stale explicit read coordinate", async () => {
  const f = await nttTransferFixture();
  await expect(
    f.reader.quote({ ...f.input, sourceBlockNumber: f.source.blockNumber - 3n }),
  ).rejects.toMatchObject({ code: "StaleQuote" });
});
test("cancellation prevents subsequent reads", async () => {
  const f = await nttTransferFixture(),
    controller = new AbortController();
  f.source.transport.read.mockImplementationOnce(async () => {
    controller.abort(new Error("stop NTT"));
    return "0x";
  });
  await expect(f.reader.quote({ ...f.input, signal: controller.signal })).rejects.toThrow(
    "stop NTT",
  );
  expect(f.source.transport.read).toHaveBeenCalledTimes(1);
  expect(f.destination.transport.read).not.toHaveBeenCalled();
});
test("uses the exact six-argument call with Core final simulation and durable submission", async () => {
  const f = await nttTransferFixture(),
    prepared = await f.writer.prepare({ operationId: "transfer", quote: f.input });
  const entry = resolveOperation({
    contractId: "bridge.musd-ntt-manager",
    networkId: f.route.source.networkId,
    blockNumber: f.source.blockNumber,
    functionName: "transfer",
  }).functionAbi;
  const decoded = createAbiCodec().decodeCalldata(entry, prepared.transaction.data);
  expect(decoded[0]).toBe(f.input.amount);
  expect(decoded[4]).toBe(false);
  expect(decoded[5]).toBe("0x01010101");
  const simulation = await f.writer.simulate(prepared),
    record = await f.writer.submit(prepared, simulation);
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0]?.data).toBe(prepared.transaction.data);
  expect(f.sent[0]?.value).toBe(0n);
  expect(record.call.value).toBe("0");
  expect(f.source.transport.simulate).toHaveBeenCalledTimes(2);
  await expect(f.writer.submit(prepared, simulation)).rejects.toMatchObject({
    code: "DuplicateSubmission",
  });
  expect(f.sent).toHaveLength(1);
});
test("approval is explicit and prevents simulation until preparation is renewed", async () => {
  const f = await nttTransferFixture(),
    base = f.source.transport.read.getMockImplementation()!;
  const allowance = (await import("@mezo-dev-kit/contracts"))
    .getTokenInterface()
    .find((e) => e.name === "allowance")!;
  f.source.transport.read.mockImplementation(async (call) =>
    call.data.startsWith(
      createAbiCodec()
        .encodeFunction(allowance, [f.input.account, f.source.manager.address])
        .slice(0, 10),
    )
      ? nttReturn(allowance, [0n])
      : base(call),
  );
  const prepared = await f.writer.prepare({ operationId: "approval", quote: f.input });
  expect(prepared.approval).toMatchObject({
    token: f.route.source.token,
    spender: f.source.manager.address,
    requiredAmount: f.input.amount,
    required: true,
  });
  await expect(f.writer.simulate(prepared)).rejects.toMatchObject({ code: "ApprovalRequired" });
  expect(f.source.transport.simulate).not.toHaveBeenCalled();
  expect(f.sent).toHaveLength(0);
});
test("configuration changed after simulation prevents signing", async () => {
  const f = await nttTransferFixture(),
    prepared = await f.writer.prepare({ operationId: "changed", quote: f.input }),
    simulation = await f.writer.simulate(prepared);
  f.destination.transport.getCode.mockResolvedValue(parseHexData("0x01"));
  await expect(f.writer.submit(prepared, simulation)).rejects.toMatchObject({
    code: "RuntimeMismatch",
  });
  expect(f.sent).toHaveLength(0);
});
test("source receipt proves exact intent but never destination completion", async () => {
  const f = await nttTransferFixture(),
    quote = await f.reader.quote(f.input),
    message = nttExpectedMessage(quote, 42n);
  const pad = (a: string) => parseHexData(`0x${"0".repeat(24)}${a.slice(2)}`);
  const log = event(
    f.route.source.networkId,
    "SendTransceiverMessage",
    [
      BigInt(f.route.destination.wormholeChainId),
      [pad(quote.source.manager), pad(quote.destination.manager), message, "0x"],
    ],
    sourceHash,
  );
  const receipt = {
    transactionHash: sourceHash,
    blockNumber: f.source.blockNumber,
    blockHash: f.source.blockHash,
    logs: [
      {
        ...log,
        blockNumber: `0x${f.source.blockNumber.toString(16)}`,
        blockHash: f.source.blockHash,
      },
    ],
  };
  const result = reconcileNttSource(quote, receipt);
  expect(result.state).toBe("source-sent");
  expect(result.sequence).toBe(42n);
  expect(result.digest).not.toBeNull();
  expect(() =>
    reconcileNttSource({ ...quote, recipient: parseAddress(`0x${"c".repeat(40)}`) }, receipt),
  ).toThrow(expect.objectContaining({ code: "InvalidEvidence" }));
});
test("an unknown route is rejected before transport access", async () => {
  const f = await nttTransferFixture();
  expect(() =>
    createNttTransferReader({ ...f.config, routeId: "unregistered" as typeof f.config.routeId }),
  ).toThrow(expect.objectContaining({ code: "UnknownRoute" }));
});
test("approval target resolution validates the source token without destination reads", async () => {
  const f = await nttTransferFixture(),
    quote = await f.reader.quote(f.input),
    resolveTarget = createNttTokenTargetResolver(f.config);
  f.destination.transport.read.mockClear();
  const target = {
    contractId: "bridge.musd-ntt-manager" as const,
    role: "ntt-source-token",
    coordinate: quote.source.coordinate,
  };
  await expect(resolveTarget(target)).resolves.toBe(quote.source.token);
  expect(f.destination.transport.read).not.toHaveBeenCalled();
  await expect(resolveTarget({ ...target, role: "unrelated-token" })).rejects.toMatchObject({
    code: "InvalidInput",
  });
  await expect(
    resolveTarget({ ...target, coordinate: quote.destination.coordinate }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
});
test("a delivery fee change after simulation stops the wallet even within the maximum", async () => {
  const f = await nttTransferFixture();
  const transceiver = resolveContract({
    contractId: f.route.source.transceiverId,
    networkId: f.route.source.networkId,
    blockNumber: f.source.blockNumber,
  });
  const entry = transceiver.readAbi.find((e) => e.name === "quoteDeliveryPrice")!;
  const base = f.source.transport.read.getMockImplementation()!;
  let fee = 1n;
  f.source.transport.read.mockImplementation(async (call) =>
    call.address === transceiver.address &&
    call.data.startsWith(
      createAbiCodec()
        .encodeFunction(entry, [BigInt(f.route.destination.wormholeChainId), [1n, "0x01"]])
        .slice(0, 10),
    )
      ? nttReturn(entry, [fee])
      : base(call),
  );
  const prepared = await f.writer.prepare({ operationId: "fee-change", quote: f.input });
  expect(prepared.transaction.value).toBe(1n);
  const simulation = await f.writer.simulate(prepared);
  fee = 2n;
  await expect(f.writer.submit(prepared, simulation)).rejects.toMatchObject({
    code: "InvalidConfiguration",
  });
  expect(f.sent).toHaveLength(0);
  await expect(
    f.writer.prepare({ operationId: "fee-bound", quote: { ...f.input, maxNativeFee: 1n } }),
  ).rejects.toMatchObject({ code: "BoundExceeded" });
});
test("a paused destination remains visible in quotes but prevents source custody", async () => {
  const f = await nttTransferFixture(),
    entry = f.destination.manager.readAbi.find((e) => e.name === "isPaused")!;
  const data = createAbiCodec().encodeFunction(entry, []),
    base = f.destination.transport.read.getMockImplementation()!;
  f.destination.transport.read.mockImplementation(async (call) =>
    call.address === f.destination.manager.address && call.data === data
      ? nttReturn(entry, [true])
      : base(call),
  );
  await expect(f.reader.quote(f.input)).resolves.toMatchObject({
    destination: { managerPaused: true },
  });
  await expect(f.writer.prepare({ operationId: "paused", quote: f.input })).rejects.toMatchObject({
    code: "InvalidConfiguration",
  });
  expect(f.sent).toHaveLength(0);
});
