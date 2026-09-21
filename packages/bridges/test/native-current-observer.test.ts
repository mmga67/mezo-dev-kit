import { expect, test, vi } from "vitest";
import { getNetwork } from "@mezo-dev-kit/chains";
import { getNativeBridgeCalldataAbi } from "@mezo-dev-kit/contracts";
import { createAbiCodec, parseAddress, parseHexData, toRpcQuantity } from "@mezo-dev-kit/evm";
import {
  createNativeCurrentDeliveryObserver,
  createNativeTransferReader,
  createNativeTransferWriter,
} from "../src/index.ts";
import { nativeReturn, nativeTransferFixture } from "./native-transfer-fixture.ts";
import { object } from "../../../scripts/lib/json.ts";

async function fixture(inbound = false) {
  const f = await nativeTransferFixture(inbound);
  const reader = createNativeTransferReader(f.config),
    writer = createNativeTransferWriter({ ...f.config, reader, execution: f.execution });
  const prepared = await writer.prepare({ operationId: "observe-native", quote: f.input });
  await writer.submit(prepared, await writer.simulate(prepared));
  f.source.state.mined = true;
  f.source.state.receiptLogs = f.sourceLogs();
  f.destination.state.mined = true;
  f.destination.state.transaction = {
    hash: f.destination.transactionHash,
    from: f.input.account,
    to: f.destination.contract.address,
    chainId: toRpcQuantity(getNetwork(f.destination.networkId).evmChainId),
    value: "0x0",
    blockNumber: toRpcQuantity(f.destination.blockNumber),
    blockHash: f.destination.blockHash,
    transactionIndex: "0x0",
    input: "0x",
  };
  if (!inbound) f.destination.state.receiptLogs = f.outboundLogs();
  const input = {
    sourceTransactionHash: f.source.transactionHash,
    destinationTransactionHashes: [f.destination.transactionHash],
  };
  const config = { ...f.config, sourceConfirmations: 1n, destinationConfirmations: 1n };
  return { ...f, observationInput: input, observerConfig: config };
}
test.for([0n, 27_000_000_000_000n])(
  "current outbound proves actual payout with fee %s without requiring individual attestation logs",
  async (fee) => {
    const f = await fixture();
    f.destination.state.receiptLogs = f.outboundLogs(fee);
    const result = await createNativeCurrentDeliveryObserver(f.observerConfig).observe(
      f.observationInput,
    );
    expect(result.state).toBe("completed");
    expect(result.coverage).toBe("provided-receipts-and-current-runtime-only");
    expect(result.destinations[0]?.settlement).toEqual({
      gross: f.input.amount,
      net: f.input.amount - fee,
      fee,
    });
  },
);
test("exposes governance recovery only after the full confirmed tuple and failed payout agree", async () => {
  const f = await fixture();
  f.destination.state.receiptLogs = f.outboundLogs(27_000_000_000_000n, true);
  const result = await createNativeCurrentDeliveryObserver(f.observerConfig).observe(
    f.observationInput,
  );
  expect(result.state).toBe("governance-recovery-required");
  expect(result.completionTransactions).toEqual([]);
  expect(result.destinations[0]).toMatchObject({
    state: "confirmed",
    proof: "governance-recovery-required",
    settlement: { gross: f.input.amount, net: 0n, fee: 27_000_000_000_000n },
  });
  expect(f.sent).toHaveLength(1);
});
test.for([
  "missing-payout",
  "wrong-failure",
  "fee-without-transfer",
  "failure-with-payout",
  "multiple-confirmations",
  "source-reorg",
  "destination-reorg",
  "changed-client",
] as const)("does not complete or authorize recovery from %s", async (kind) => {
  const f = await fixture();
  if (kind === "missing-payout") f.destination.state.receiptLogs = f.outboundLogs().slice(0, -1);
  if (kind === "wrong-failure")
    f.destination.state.receiptLogs = [
      ...f.outboundLogs().slice(0, -1),
      f.log(
        f.destination,
        "WithdrawalFailed",
        [43n, f.destination.token, f.input.recipient, f.input.amount - 27_000_000_000_000n],
        3,
      ),
    ];
  if (kind === "fee-without-transfer")
    f.destination.state.receiptLogs = f.outboundLogs().filter((_, i) => i !== 2);
  if (kind === "failure-with-payout")
    f.destination.state.receiptLogs = [
      ...f.outboundLogs(),
      f.log(
        f.destination,
        "WithdrawalFailed",
        [42n, f.destination.token, f.input.recipient, f.input.amount - 27_000_000_000_000n],
        4,
      ),
    ];
  if (kind === "multiple-confirmations")
    f.destination.state.receiptLogs = [
      ...f.outboundLogs(),
      f.log(
        f.destination,
        "AssetsUnlockConfirmed",
        [43n, f.input.recipient, f.destination.token, f.input.amount, 0n],
        4,
      ),
    ];
  if (kind === "source-reorg") f.source.state.reorg = true;
  if (kind === "destination-reorg") f.destination.state.reorg = true;
  if (kind === "changed-client") f.client.version = "Mezod/14.0.0/amd64/go1.24.0";
  const result = await createNativeCurrentDeliveryObserver(f.observerConfig).observe(
    f.observationInput,
  );
  expect(["completed", "governance-recovery-required"]).not.toContain(result.state);
  expect(result.completionTransactions).toEqual([]);
});
test("a pending source or destination confirmation does not trigger governance recovery", async () => {
  const f = await fixture();
  f.destination.state.receiptLogs = f.outboundLogs(0n, true);
  const result = await createNativeCurrentDeliveryObserver({
    ...f.observerConfig,
    destinationConfirmations: 2n,
  }).observe(f.observationInput);
  expect(result.state).toBe("destination-progress");
  const pending = await createNativeCurrentDeliveryObserver({
    ...f.observerConfig,
    sourceConfirmations: 2n,
  }).observe(f.observationInput);
  expect(pending.state).toBe("source-pending");
});
test("separates fee and net transfers even when the recipient is also the collector", async () => {
  const f = await fixture();
  f.destination.state.receiptLogs = f.outboundLogs(27_000_000_000_000n, false, f.input.recipient);
  const result = await createNativeCurrentDeliveryObserver(f.observerConfig).observe(
    f.observationInput,
  );
  expect(result.state).toBe("completed");
});
test.for([false, true])(
  "current inbound requires recipient mint attribution, skipped=%s",
  async (skipped) => {
    const f = await fixture(true),
      codec = createAbiCodec();
    const system = getNativeBridgeCalldataAbi({
      contractId: f.destination.contract.contractId,
      networkId: f.destination.networkId,
      blockNumber: f.destination.blockNumber,
    }).find((e) => e.name === "bridge");
    expect(system).toBeDefined();
    f.destination.state.transaction = {
      ...f.destination.state.transaction,
      from: parseAddress(`0x${"0".repeat(40)}`),
      gas: "0x0",
      gasPrice: "0x0",
      input: codec.encodeFunction(system, [
        [[42n, f.input.recipient, f.input.amount, f.source.token]],
      ]),
    };
    const base = f.destination.transport.read;
    vi.spyOn(f.destination.transport, "read").mockImplementation(async (call) => {
      const before = call.blockNumber === f.destination.blockNumber - 1n;
      const seq = f.destination.contract.readAbi.find((e) => e.name === "getCurrentSequenceTip");
      expect(seq).toBeDefined();
      if (
        call.address === f.destination.contract.address &&
        call.data === codec.encodeFunction(seq, [])
      )
        return nativeReturn(seq!, [before ? 41n : 42n]);
      // ERC20 balanceOf(address), sourced from the token interface used by the fixture.
      const raw = await base(call);
      if (call.address === f.destination.token) {
        const balance = 10n ** 24n + (before || skipped ? 0n : f.input.amount);
        return parseHexData(`0x${balance.toString(16).padStart(64, "0")}`);
      }
      return raw;
    });
    const consensus = {
      block_id: { hash: f.destination.blockHash.slice(2) },
      block: {
        header: {
          height: f.destination.blockNumber.toString(),
          chain_id: getNetwork(f.destination.networkId).cosmosChainId,
          last_block_id: { hash: f.destination.blockHash.slice(2) },
        },
        data: { txs: ["YQ=="] },
      },
    };
    const result = await createNativeCurrentDeliveryObserver({
      ...f.observerConfig,
      getMezoConsensusBlock: async () => consensus,
    }).observe(f.observationInput);
    expect(result.state).toBe(skipped ? "destination-progress" : "completed");
    if (skipped) expect(result.destinations[0]?.issue?.code).toBe("DeliveryUnproven");
    object(consensus.block.data, "data").txs = ["YQ==", "Yg=="];
    const ambiguous = await createNativeCurrentDeliveryObserver({
      ...f.observerConfig,
      getMezoConsensusBlock: async () => consensus,
    }).observe(f.observationInput);
    expect(ambiguous.state).not.toBe("completed");
  },
);
