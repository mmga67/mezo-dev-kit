import { expect, test } from "vitest";
import { createContractRegistry, resolveOperation } from "@mezo-dev-kit/contracts";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { ExactTransaction, RpcRequest } from "@mezo-dev-kit/core";
import { createAbiCodec, toRpcQuantity } from "@mezo-dev-kit/evm";
import { createRedemptionTraceSimulator } from "../src/index.ts";
const coordinate = {
  networkId: "mezo-mainnet",
  chainId: 31612n,
  blockNumber: 11703359n,
  blockHash: `0x${"ab".repeat(32)}`,
} as const;
const registry = createContractRegistry(),
  root = registry.resolve({
    contractId: "musd.trove-manager",
    networkId: coordinate.networkId,
    blockNumber: coordinate.blockNumber,
  });
const account = `0x${"11".repeat(20)}` as const,
  zero = `0x${"00".repeat(20)}` as const;
const abi = resolveOperation({
  contractId: root.contractId,
  networkId: coordinate.networkId,
  blockNumber: coordinate.blockNumber,
  functionName: "redeemCollateral",
}).functionAbi;
const call: ExactTransaction = {
  chainId: coordinate.chainId,
  from: account,
  to: root.address,
  data: createAbiCodec().encodeFunction(abi, [100n, zero, zero, zero, 0n, 1n]),
  value: 0n,
  nonce: 7n,
};
// Independently derived from the canonical four-uint Redemption signature using cast keccak.
const topic = "0x43a3f4082a4dbc33d78e317d2497d3a730bc7fc3574159dcea1056e62e5d9ad8";
const data = (actual = 80n) =>
  `0x${[100n, actual, 50n, 5n].map((value) => value.toString(16).padStart(64, "0")).join("")}`;
function fixture() {
  const frame = {
    type: "CALL",
    from: call.from,
    to: call.to,
    input: call.data,
    output: "0x",
    value: "0x0",
    logs: [{ address: call.to, topics: [topic], data: data() }],
    calls: [] as unknown[],
    error: undefined as string | undefined,
  };
  const state = { frame, unsupported: false, reorg: false, traceCalls: 0 };
  const request: RpcRequest = ({ method, params }) => {
    if (method === "eth_chainId") return Promise.resolve(toRpcQuantity(coordinate.chainId));
    if (method === "eth_getBlockByNumber")
      return Promise.resolve({
        number: toRpcQuantity(coordinate.blockNumber),
        timestamp: "0x1",
        hash: state.reorg && state.traceCalls > 0 ? `0x${"cd".repeat(32)}` : coordinate.blockHash,
      });
    if (method === "debug_traceCall") {
      state.traceCalls++;
      if (state.unsupported) return Promise.reject(new Error("method not found"));
      expect(params[0]).toMatchObject({ nonce: "0x7", from: account, data: call.data });
      return Promise.resolve(frame);
    }
    throw new Error("unexpected RPC");
  };
  const transport = createRpcTransport({ id: "trace-fixture", request });
  const simulator = createRedemptionTraceSimulator({
    request,
    transport,
    providerId: "trace-fixture",
    timeoutMs: 1000,
    maxFrames: 8,
    maxLogs: 8,
    maxDepth: 3,
    maxDataBytes: 8192,
  });
  return { state, simulator };
}
test("exact call trace preserves partial fill and aggregate fee without a write", async () => {
  const { simulator } = fixture();
  await expect(simulator.simulate({ call, coordinate })).resolves.toEqual({
    attemptedAmount: 100n,
    actualAmount: 80n,
    grossCollateral: 50n,
    collateralFee: 5n,
    netCollateral: 45n,
  });
});
test("reverted subtrees cannot contribute redemption logs", async () => {
  const { state, simulator } = fixture();
  state.frame.calls = [
    {
      error: "execution reverted",
      logs: [{ address: call.to, topics: [topic], data: data(1n) }],
      calls: [],
    },
  ];
  expect((await simulator.simulate({ call, coordinate })).actualAmount).toBe(80n);
});
test("missing or reverted output and unavailable tracing fail closed", async () => {
  const { state, simulator } = fixture();
  state.unsupported = true;
  await expect(simulator.simulate({ call, coordinate })).rejects.toMatchObject({
    code: "SimulationUnavailable",
  });
  state.unsupported = false;
  state.frame.error = "reverted";
  await expect(simulator.simulate({ call, coordinate })).rejects.toMatchObject({
    code: "SimulationFailed",
  });
  state.frame.error = undefined;
  state.frame.logs = [];
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("one Redemption");
});
test("wrong call identity, duplicate events, impossible amounts and changed anchors reject", async () => {
  const { state, simulator } = fixture();
  state.frame.from = zero;
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("root identity");
  state.frame.from = account;
  state.frame.logs.push({ address: call.to, topics: [topic], data: data() });
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("one Redemption");
  state.frame.logs.pop();
  state.frame.logs[0]!.data = data(101n);
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("relationships");
  state.frame.logs[0]!.data = data();
  state.reorg = true;
  state.traceCalls = 0;
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("anchor changed");
});
test("unbounded iterations and excessive trace depth reject", async () => {
  const { state, simulator } = fixture();
  const unbounded = {
    ...call,
    data: createAbiCodec().encodeFunction(abi, [100n, zero, zero, zero, 0n, 0n]),
  };
  await expect(simulator.simulate({ call: unbounded, coordinate })).rejects.toThrow(
    "bounded canonical",
  );
  expect(state.traceCalls).toBe(0);
  const nested = { calls: [{ calls: [{ calls: [{ calls: [{}] }] }] }] };
  state.frame.calls = [nested];
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("depth budget");
});

test("callTracer may omit void output, but null or nonempty output is invalid", async () => {
  const { state, simulator } = fixture();
  Reflect.deleteProperty(state.frame, "output");
  expect((await simulator.simulate({ call, coordinate })).actualAmount).toBe(80n);
  Reflect.set(state.frame, "output", null);
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow();
  state.frame.output = "0x01";
  await expect(simulator.simulate({ call, coordinate })).rejects.toThrow("root identity");
});
