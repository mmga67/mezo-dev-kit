import { expect, test } from "vitest";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { toRpcQuantity } from "@mezo-dev-kit/evm";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcSigner,
  createRpcTransport,
  ExecutionError,
  parseSubmissionRecord,
} from "../src/index.ts";
import type { PreparedTransaction, RpcRequest, ExecutionTargetResolver } from "../src/index.ts";

const account = "0x0000000000000000000000000000000000000001";
const hash = `0x${"a".repeat(64)}` as const;
const blockHash = `0x${"b".repeat(64)}` as const;
const blockNumber = 11703359n;
function harness(resolveTarget?: ExecutionTargetResolver) {
  const network = getNetwork("mezo-mainnet");
  const registry = createContractRegistry();
  const target = registry.resolve({
    contractId: "musd.borrower-operations",
    networkId: network.id,
    blockNumber,
  });
  const state = {
    sends: 0,
    nonce: 0n,
    head: blockNumber,
    chain: network.evmChainId,
    accounts: [account] as string[],
    uncertain: false,
    mined: false,
    reverted: false,
    reorg: false,
    transactionValue: 0n,
    lastCall: undefined as unknown,
    returnData: "0x" as `0x${string}`,
  };
  const request: RpcRequest = ({ method, params }) => {
    switch (method) {
      case "eth_chainId":
        return Promise.resolve(toRpcQuantity(state.chain));
      case "eth_accounts":
        return Promise.resolve(state.accounts);
      case "eth_blockNumber":
        return Promise.resolve(toRpcQuantity(state.head));
      case "eth_getBlockByNumber":
        return Promise.resolve({
          number: params[0],
          hash: state.reorg ? hash : blockHash,
          timestamp: "0x1000",
        });
      case "eth_getCode":
        return Promise.resolve("0x");
      case "eth_getTransactionCount":
        return Promise.resolve(toRpcQuantity(state.nonce));
      case "eth_call":
        state.lastCall = params[0];
        return Promise.resolve(state.returnData);
      case "eth_sendTransaction":
        state.sends++;
        if (state.uncertain) return Promise.reject(new Error("lost connection"));
        expect(params[0]).toEqual(state.lastCall);
        return Promise.resolve(hash);
      case "eth_getTransactionByHash":
        return Promise.resolve({
          hash,
          from: account,
          to: target.address,
          nonce: "0x0",
          input: "0x1234",
          value: toRpcQuantity(state.transactionValue),
          chainId: toRpcQuantity(network.evmChainId),
        });
      case "eth_getTransactionReceipt":
        return Promise.resolve(
          state.mined
            ? {
                transactionHash: hash,
                from: account,
                to: target.address,
                blockNumber: toRpcQuantity(blockNumber),
                blockHash,
                status: state.reverted ? "0x0" : "0x1",
                logs: [],
              }
            : null,
        );
      default:
        return Promise.reject(new Error(`unexpected method ${method}`));
    }
  };
  const client = createExecutionClient({
    network,
    registry,
    transport: createRpcTransport({ id: "test", request }),
    signer: createRpcSigner({ account, request }),
    store: createMemorySubmissionStore(),
    maxBlockAge: 2n,
    confirmations: 2n,
    ...(resolveTarget === undefined ? {} : { resolveTarget }),
  });
  const prepared: PreparedTransaction = {
    operationId: "open-1",
    contractId: target.contractId,
    coordinate: { networkId: network.id, chainId: network.evmChainId, blockNumber, blockHash },
    from: account,
    to: target.address,
    value: 0n,
    data: "0x1234",
  };
  return { client, prepared, state };
}
const revalidate = () => Promise.resolve();
test("role destinations require explicit resolution and are rechecked before wallet submission", async () => {
  const missing = harness();
  await expect(
    missing.client.simulate({ ...missing.prepared, targetRole: "gauge" }),
  ).rejects.toMatchObject({ code: "InvalidExecutionInput" });
  let target = missing.prepared.to;
  const calls: bigint[] = [];
  const h = harness((input) => {
    expect(input.role).toBe("gauge");
    calls.push(input.coordinate.blockNumber);
    return Promise.resolve(target);
  });
  const simulation = await h.client.simulate({ ...h.prepared, targetRole: "gauge" });
  target = account;
  await expect(h.client.submit(simulation, revalidate)).rejects.toMatchObject({
    code: "InvalidExecutionInput",
  });
  expect(h.state.sends).toBe(0);
  expect(calls.length).toBeGreaterThanOrEqual(2);
});
test("persisted target roles survive JSON restart and cannot be observed without their resolver", async () => {
  const base = harness();
  const h = harness(() => Promise.resolve(base.prepared.to));
  const simulated = await h.client.simulate({ ...h.prepared, targetRole: "gauge" });
  const record = await h.client.submit(simulated, revalidate);
  const restored = parseSubmissionRecord(JSON.parse(JSON.stringify(record)));
  expect(restored.targetRole).toBe("gauge");
  await expect(base.client.observe(restored)).rejects.toMatchObject({
    code: "InvalidExecutionInput",
  });
  await expect(h.client.observe(restored)).resolves.toMatchObject({ state: "submitted" });
});
test("concurrent submissions invoke wallet once and preserve exact call", async () => {
  const { client, prepared, state } = harness();
  const simulation = await client.simulate(prepared);
  const results = await Promise.allSettled([
    client.submit(simulation, revalidate),
    client.submit(simulation, revalidate),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(state.sends).toBe(1);
  const again = await client.simulate({ ...prepared, operationId: "another-operation" });
  await expect(client.submit(again, revalidate)).rejects.toMatchObject({
    code: "DuplicateSubmission",
  });
  expect(state.sends).toBe(1);
});
test("uncertain submission exposes durable intent and refuses a retry", async () => {
  const { client, prepared, state } = harness();
  state.uncertain = true;
  const simulation = await client.simulate(prepared);
  try {
    await client.submit(simulation, revalidate);
    throw new Error("expected uncertainty");
  } catch (error) {
    expect(error).toBeInstanceOf(ExecutionError);
    if (!(error instanceof ExecutionError) || !error.record) throw error;
    expect(parseSubmissionRecord(JSON.parse(JSON.stringify(error.record)))).toEqual(error.record);
    expect((await client.observe(error.record)).state).toBe("submission-uncertain");
    expect((await client.inspectHash(error.record, hash)).kind).toBe("same-call");
  }
  state.uncertain = false;
  await expect(client.submit(simulation, revalidate)).rejects.toMatchObject({
    code: "DuplicateSubmission",
  });
  expect(state.sends).toBe(1);
});
test("account, chain, nonce and freshness changes fail before sending", async () => {
  const h = harness();
  const simulated = await h.client.simulate(h.prepared);
  h.state.nonce = 1n;
  await expect(h.client.submit(simulated, revalidate)).rejects.toMatchObject({
    code: "StaleSimulation",
  });
  expect(h.state.sends).toBe(0);
  const a = harness();
  a.state.accounts = [];
  await expect(a.client.simulate(a.prepared)).rejects.toThrow();
  const c = harness();
  c.state.chain = 1n;
  await expect(c.client.simulate(c.prepared)).rejects.toThrow();
  const s = harness();
  s.state.head += 3n;
  await expect(s.client.simulate(s.prepared)).rejects.toMatchObject({ code: "StaleSimulation" });
});
test("receipt, confirmation, exact transaction and reorg boundaries", async () => {
  const { client, prepared, state } = harness();
  const record = await client.submit(await client.simulate(prepared), revalidate);
  expect((await client.observe(record)).state).toBe("submitted");
  state.mined = true;
  expect((await client.observe(record)).state).toBe("included");
  await expect(client.reconcile(record, () => Promise.resolve("ok"))).rejects.toMatchObject({
    code: "NotConfirmed",
  });
  state.head++;
  expect((await client.observe(record)).state).toBe("confirmed");
  const checkpoint = (await client.observe(record)).record;
  state.mined = false;
  expect((await client.observe(checkpoint)).state).toBe("reorged");
  state.mined = true;
  expect((await client.reconcile(record, () => Promise.resolve("domain matched"))).state).toBe(
    "reconciled",
  );
  state.transactionValue = 1n;
  await expect(client.observe(record)).rejects.toMatchObject({ code: "InvalidTransaction" });
  expect((await client.inspectHash(record, hash)).kind).toBe("replacement");
  state.transactionValue = 0n;
  state.reverted = true;
  expect((await client.observe(record)).state).toBe("execution-reverted");
  state.reorg = true;
  expect((await client.observe(record)).state).toBe("reorged");
});
test("versioned resume rejects malformed fields and network mismatch", () => {
  expect(() => parseSubmissionRecord({ schemaVersion: 2 })).toThrow();
  expect(() =>
    parseSubmissionRecord({
      schemaVersion: 1,
      operationId: "x",
      networkId: "mezo-mainnet",
      contractId: "musd.borrower-operations",
      blockNumber: "1",
      blockHash,
      hash: null,
      call: { chainId: "1", from: account, to: account, value: "0", data: "0x", nonce: "0" },
    }),
  ).toThrow();
});
test("a reorged dynamic preparation returns reorged before invoking its stale resolver", async () => {
  let calls = 0;
  const h = harness(() => {
    calls++;
    return Promise.resolve(h.prepared.to);
  });
  const prepared = { ...h.prepared, targetRole: "unit-role" };
  const record = await h.client.submit(await h.client.simulate(prepared), revalidate);
  const before = calls;
  h.state.reorg = true;
  expect((await h.client.observe(record)).state).toBe("reorged");
  expect(calls).toBe(before);
});

test("simulation return verification survives until the final call before wallet submission", async () => {
  const h = harness();
  h.state.returnData = "0x01";
  const coordinates: bigint[] = [];
  const simulated = await h.client.simulate(h.prepared, (result, coordinate, call) => {
    coordinates.push(coordinate.blockNumber);
    expect(call).toMatchObject({
      from: h.prepared.from,
      to: h.prepared.to,
      value: h.prepared.value,
      data: h.prepared.data,
    });
    expect(Object.isFrozen(call)).toBe(true);
    if (result !== "0x01") throw new Error("protocol output below minimum");
  });
  expect(simulated.returnData).toBe("0x01");
  h.state.head++;
  h.state.returnData = "0x00";
  await expect(h.client.submit(simulated, revalidate)).rejects.toMatchObject({
    code: "SimulationFailed",
  });
  expect(h.state.sends).toBe(0);
  expect(coordinates).toEqual([blockNumber, blockNumber + 1n]);
});
test("initial return verification cannot authorize an invalid protocol result", async () => {
  const h = harness();
  await expect(
    h.client.simulate(h.prepared, () => {
      throw new Error("invalid result");
    }),
  ).rejects.toMatchObject({ code: "SimulationFailed" });
  expect(h.state.sends).toBe(0);
});
test("signer changes while the final output verifier waits prevent submission", async () => {
  const h = harness();
  let verifications = 0;
  const simulated = await h.client.simulate(h.prepared, () => {
    if (++verifications === 2) h.state.chain = 1n;
  });
  await expect(h.client.submit(simulated, revalidate)).rejects.toMatchObject({
    code: "ChainMismatch",
  });
  expect(h.state.sends).toBe(0);
});

test("nonce changes during final output verification cannot reach the wallet", async () => {
  const h = harness();
  let verifications = 0;
  const simulated = await h.client.simulate(h.prepared, () => {
    if (++verifications === 2) h.state.nonce++;
  });
  await expect(h.client.submit(simulated, revalidate)).rejects.toMatchObject({
    code: "StaleSimulation",
  });
  expect(h.state.sends).toBe(0);
});
