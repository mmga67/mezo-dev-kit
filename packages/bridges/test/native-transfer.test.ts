import { expect, test, vi } from "vitest";
import { createAbiCodec, parseAddress, parseHexData, parseUint } from "@mezo-dev-kit/evm";
import {
  createNativeTransferReader,
  createNativeTransferWriter,
  createNativeTokenTargetResolver,
} from "../src/index.ts";
import { nativeWithdrawalFee } from "../src/native-transfer-reader.ts";
import { nativeTransferFixture } from "./native-transfer-fixture.ts";
import { nativeFixture } from "./native-fixture.ts";
import { object, values } from "../../../scripts/lib/json.ts";

async function fixture(inbound = true) {
  const f = await nativeTransferFixture(inbound);
  const reader = createNativeTransferReader(f.config);
  const writer = createNativeTransferWriter({ ...f.config, reader, execution: f.execution });
  return { ...f, reader, writer };
}
test.for([true, false])(
  "current Native preparation reproduces retained on-chain source calldata, inbound=%s",
  async (inbound) => {
    const historical = await nativeFixture(inbound);
    const probe = historical.probes.find((p) => {
      const request = object(p.request, "request");
      return (
        request.method === "eth_getTransactionByHash" &&
        values(request.params, "params")[0] === historical.input.sourceTransactionHash
      );
    });
    expect(probe).toBeDefined();
    if (!probe) throw new Error("retained source transaction unavailable");
    const transaction = object(object(probe.response, "response").result, "transaction");
    const f = await fixture(inbound),
      decoded = createAbiCodec().decodeCalldata(f.source.operation, transaction.input);
    const prepared = await f.writer.prepare({
      operationId: "retained-call",
      quote: {
        ...f.input,
        account: parseAddress(transaction.from),
        amount: parseUint(decoded[1]),
        recipient: parseAddress(decoded[inbound ? 2 : 3]),
      },
    });
    expect(prepared.transaction.data).toBe(transaction.input);
    expect(prepared.transaction.to).toBe(transaction.to);
    expect(prepared.transaction.value).toBe(0n);
    expect(f.sent).toHaveLength(0);
  },
);
test.for([true, false])(
  "prepares, simulates, submits and reconciles a modeled Native source, inbound=%s",
  async (inbound) => {
    const f = await fixture(inbound),
      prepared = await f.writer.prepare({ operationId: "native", quote: f.input });
    const calldata = createAbiCodec().decodeCalldata(f.source.operation, prepared.transaction.data);
    expect(calldata).toEqual(
      inbound
        ? [f.source.token, f.input.amount, f.input.recipient]
        : [f.source.token, f.input.amount, 0n, f.input.recipient],
    );
    expect(prepared.transaction.value).toBe(0n);
    expect(prepared.quote.estimatedDestinationFee).toBe(inbound ? 0n : 27_000_000_000_000n);
    const simulation = await f.writer.simulate(prepared),
      record = await f.writer.submit(prepared, simulation);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]?.data).toBe(prepared.transaction.data);
    await expect(f.writer.submit(prepared, simulation)).rejects.toMatchObject({
      code: "DuplicateSubmission",
    });
    f.source.state.mined = true;
    f.source.state.receiptLogs = f.sourceLogs();
    const reconciled = await f.writer.reconcile(prepared, record);
    expect(reconciled.outcome).toMatchObject({
      state: "source-confirmed",
      tuple: { sequence: 42n, amount: f.input.amount, recipient: f.input.recipient },
    });
  },
);
test("BTC authorization is a separate exact token/spender approval", async () => {
  const f = await fixture(false);
  f.source.state.allowance = 0n;
  const prepared = await f.writer.prepare({ operationId: "approval", quote: f.input });
  expect(prepared.approval).toMatchObject({
    token: f.source.token,
    spender: f.source.contract.address,
    requiredAmount: f.input.amount,
    required: true,
  });
  await expect(f.writer.simulate(prepared)).rejects.toMatchObject({ code: "ApprovalRequired" });
  const resolve = createNativeTokenTargetResolver(f.config);
  await expect(
    resolve({
      contractId: f.source.contract.contractId,
      role: "native-source-token",
      coordinate: prepared.quote.source.coordinate,
    }),
  ).resolves.toBe(f.source.token);
  await expect(
    resolve({
      contractId: f.source.contract.contractId,
      role: "other",
      coordinate: prepared.quote.source.coordinate,
    }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  expect(f.sent).toHaveLength(0);
});
test.for(["token", "proxy", "client", "mapping", "minter", "chain"] as const)(
  "rejects changed %s before source preparation",
  async (kind) => {
    const f = await fixture();
    if (kind === "token")
      vi.spyOn(f.source.transport, "getCode").mockResolvedValue(parseHexData("0x01"));
    if (kind === "proxy")
      vi.spyOn(f.source.transport, "getStorage").mockResolvedValue(`0x${"0".repeat(64)}`);
    if (kind === "client") f.client.version = "Mezod/14.0.0/amd64/go1.24.0";
    if (kind === "mapping")
      f.destination.overrides.set("getERC20TokenMapping", [[f.source.token, f.input.account]]);
    if (kind === "minter") f.destination.overrides.set("minter", [f.input.account]);
    if (kind === "chain") vi.spyOn(f.source.transport, "getChainId").mockResolvedValue(31612n);
    await expect(f.reader.quote(f.input)).rejects.toThrow();
    expect(f.sent).toHaveLength(0);
  },
);
test.for(["capacity", "disabled", "balance", "gas", "fee"] as const)(
  "rejects outbound %s bound",
  async (kind) => {
    const f = await fixture(false);
    if (kind === "capacity")
      f.source.overrides.set("getOutflowCapacity", [0n, f.source.blockNumber + 1n]);
    if (kind === "disabled") f.source.overrides.set("getBridgeOutChains", [[1n]]);
    if (kind === "balance") f.source.state.tokenBalance = f.input.amount - 1n;
    if (kind === "gas") f.source.state.nativeBalance = f.input.amount;
    if (kind === "fee")
      f.destination.overrides.set("flatWithdrawalFees", [f.input.maxEstimatedDestinationFee + 1n]);
    await expect(f.reader.quote(f.input)).rejects.toThrow();
  },
);
test.for(["allowance", "fee"] as const)("revalidates %s before wallet submission", async (kind) => {
  const f = await fixture(false),
    prepared = await f.writer.prepare({ operationId: "fresh", quote: f.input }),
    simulated = await f.writer.simulate(prepared);
  if (kind === "allowance") f.source.state.allowance = 0n;
  else f.destination.overrides.set("flatWithdrawalFees", [f.input.maxEstimatedDestinationFee + 1n]);
  await expect(f.writer.submit(prepared, simulated)).rejects.toMatchObject({
    code: kind === "allowance" ? "ApprovalRequired" : "BoundExceeded",
  });
  expect(f.sent).toHaveLength(0);
});
test.for(["source-age", "destination-age", "source-reorg", "destination-reorg"] as const)(
  "rejects %s after preparation",
  async (kind) => {
    const f = await fixture(),
      prepared = await f.writer.prepare({ operationId: kind, quote: f.input });
    const endpoint = kind.startsWith("source") ? f.source : f.destination;
    if (kind.endsWith("age")) endpoint.state.head += 3n;
    else endpoint.state.reorg = true;
    const failure = kind.startsWith("destination")
      ? {
          code: "SimulationFailed",
          cause: { code: kind.endsWith("age") ? "StaleQuote" : "ReorgDetected" },
        }
      : { code: kind.endsWith("age") ? "StaleSimulation" : "ReorgDetected" };
    await expect(f.writer.simulate(prepared)).rejects.toMatchObject(failure);
    expect(f.sent).toHaveLength(0);
  },
);
test("rejects a false native simulation and foreign preparations", async () => {
  const f = await fixture(false),
    prepared = await f.writer.prepare({ operationId: "false", quote: f.input });
  f.source.state.simulateSuccess = false;
  await expect(f.writer.simulate(prepared)).rejects.toMatchObject({
    code: "SimulationFailed",
    cause: { code: "InvalidEvidence" },
  });
  await expect(f.writer.simulate({ ...prepared })).rejects.toMatchObject({ code: "InvalidInput" });
});
test("missing source custody cannot be reconciled as a successful inbound", async () => {
  const f = await fixture(),
    prepared = await f.writer.prepare({ operationId: "custody", quote: f.input }),
    simulation = await f.writer.simulate(prepared),
    record = await f.writer.submit(prepared, simulation);
  f.source.state.mined = true;
  f.source.state.receiptLogs = f.sourceLogs().slice(0, 1);
  await expect(f.writer.reconcile(prepared, record)).rejects.toMatchObject({
    code: "InvalidEvidence",
  });
});
test("uncertain submission preserves the source reservation and never automatically resends", async () => {
  const f = await fixture(),
    prepared = await f.writer.prepare({ operationId: "uncertain", quote: f.input }),
    simulation = await f.writer.simulate(prepared);
  f.source.state.uncertain = true;
  await expect(f.writer.submit(prepared, simulation)).rejects.toThrow();
  await expect(f.writer.submit(prepared, simulation)).rejects.toThrow();
  expect(f.sent).toHaveLength(1);
});
test("fee math preserves Solidity rounding, exemptions, disabled collector and uint256 overflow", () => {
  const input = {
    amount: 101n,
    percent: 333n,
    denominator: 10000n,
    flat: 2n,
    exempt: false,
    collectorEnabled: true,
  };
  expect(nativeWithdrawalFee(input)).toBe(5n);
  expect(nativeWithdrawalFee({ ...input, exempt: true })).toBe(2n);
  expect(nativeWithdrawalFee({ ...input, collectorEnabled: false })).toBe(0n);
  expect(() => nativeWithdrawalFee({ ...input, flat: 101n })).toThrow();
  expect(() => nativeWithdrawalFee({ ...input, amount: (1n << 256n) - 1n, percent: 2n })).toThrow();
});
test("rejects zero and module-account recipients and cancels before reads", async () => {
  const f = await fixture();
  await expect(
    f.reader.quote({ ...f.input, recipient: parseAddress(`0x${"0".repeat(40)}`) }),
  ).rejects.toMatchObject({ code: "InvalidInput" });
  await expect(f.reader.quote({ ...f.input, recipient: f.mintAuthority })).rejects.toMatchObject({
    code: "InvalidInput",
  });
  f.source.calls.length = 0;
  const controller = new AbortController();
  controller.abort(new Error("stop Native"));
  await expect(f.reader.quote({ ...f.input, signal: controller.signal })).rejects.toThrow(
    "stop Native",
  );
  expect(f.source.calls).toHaveLength(0);
});
