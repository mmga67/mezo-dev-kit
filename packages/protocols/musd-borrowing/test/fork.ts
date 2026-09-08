/** Explicit integration harness: Anvil fork + captured native-oracle response fixture. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcSigner,
  createRpcTransport,
} from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { createBorrowingReader, createBorrowingWriter } from "@mezo-dev-kit/musd-borrowing";
import type { BorrowingAction } from "@mezo-dev-kit/musd-borrowing";

const [localUrl, sourceUrl] = process.argv.slice(2);
if (
  !localUrl ||
  !sourceUrl ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(localUrl).hostname)
)
  throw new Error("usage: node test/fork.ts <localhost-anvil-url> <read-only-source-rpc>");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid RPC object");
  return value as Record<string, unknown>;
}
function fixtureAbi(id: "token" | "coll-surplus-pool", name: string): unknown {
  const entries: unknown = JSON.parse(
    readFileSync(
      new URL(`../../../../knowledge/contracts/artifacts/abis/musd/${id}.json`, import.meta.url),
      "utf8",
    ),
  );
  if (!Array.isArray(entries)) throw new Error("canonical fixture ABI must be an array");
  const matches = entries.filter((entry: unknown) => {
    const value = object(entry);
    return value.type === "function" && value.name === name;
  });
  if (matches.length !== 1) throw new Error(`missing or overloaded fixture ABI ${name}`);
  return matches[0];
}
function rpc(url: string, readOnly: boolean): RpcRequest {
  let id = 0;
  return async (input) => {
    if (readOnly && !["eth_chainId", "eth_getBlockByNumber", "eth_call"].includes(input.method))
      throw new Error("source RPC is read-only");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, ...input }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = object(await response.json());
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  };
}
const request = rpc(localUrl, false);
const source = rpc(sourceUrl, true);
const version = await request({ method: "web3_clientVersion", params: [] });
if (typeof version !== "string" || !version.toLowerCase().includes("anvil"))
  throw new Error("fixture mutations require Anvil");
const network = getNetwork("mezo-mainnet");
const registry = createContractRegistry();
assert.equal(
  parseRpcQuantity(await source({ method: "eth_chainId", params: [] })),
  network.evmChainId,
);
assert.equal(
  parseRpcQuantity(await request({ method: "eth_chainId", params: [] })),
  network.evmChainId,
);
const initial = object(
  await request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
);
const blockNumber = parseRpcQuantity(initial.number);
const blockHash = parseHash32(initial.hash);
const canonical = object(
  await source({ method: "eth_getBlockByNumber", params: [toRpcQuantity(blockNumber), false] }),
);
assert.equal(parseHash32(canonical.hash), blockHash, "start a fresh fork at a source block");
const oracle = registry.resolve({
  contractId: "oracle.skip-btc-usd",
  networkId: network.id,
  blockNumber,
});
const responses: { selector: `0x${string}`; data: `0x${string}` }[] = [];
for (const name of ["decimals", "latestRoundData"]) {
  const abi = oracle.readAbi.find((e) => e.type === "function" && e.name === name);
  if (!abi) throw new Error(`missing oracle ${name}`);
  const selector = encodeFunctionData(abi);
  const data = parseHexData(
    await source({
      method: "eth_call",
      params: [{ to: oracle.address, data: selector }, toRpcQuantity(blockNumber)],
    }),
  );
  decodeFunctionResult(abi, data);
  responses.push({ selector, data });
}
// Anvil does not implement Mezo's native oracle. This fixture returns only the
// two exact responses captured above, and reverts for every other selector.
// It is deliberately confined to localhost and never changes borrowing code.
function oracleFixture(): `0x${string}` {
  const parts: string[] = [];
  const jumps: number[] = [];
  const offsets: number[] = [];
  const push2 = (n: number) => `61${n.toString(16).padStart(4, "0")}`;
  let size = 0;
  const emit = (code: string) => {
    parts.push(code);
    size += code.length / 2;
  };
  for (const response of responses) {
    emit(`5f3560e01c63${response.selector.slice(2)}14`);
    jumps.push(parts.length);
    emit("61000057");
  }
  emit("5f5ffd");
  for (const [i, response] of responses.entries()) {
    const jump = jumps[i];
    if (jump === undefined) throw new Error("missing jump");
    parts[jump] = `${push2(size)}57`;
    emit("5b");
    emit(push2((response.data.length - 2) / 2));
    offsets.push(parts.length);
    emit("610000");
    emit(`5f39${push2((response.data.length - 2) / 2)}5ff3`);
  }
  for (const [i, response] of responses.entries()) {
    const offset = offsets[i];
    if (offset === undefined) throw new Error("missing data offset");
    parts[offset] = push2(size);
    emit(response.data.slice(2));
  }
  return parseHexData(`0x${parts.join("")}`);
}
assert.equal(await request({ method: "anvil_getAutomine", params: [] }), true);
const snapshotId = await request({ method: "evm_snapshot", params: [] });
try {
  await request({ method: "evm_setAutomine", params: [false] });
  await request({ method: "anvil_setCode", params: [oracle.address, oracleFixture()] });
  const accounts = await request({ method: "eth_accounts", params: [] });
  if (!Array.isArray(accounts)) throw new Error("missing fork accounts");
  const account = parseAddress(accounts[0]);
  const transport = createRpcTransport({ id: "anvil-borrowing-fixture", request });
  const reader = createBorrowingReader({ networkId: "mezo-mainnet", registry, transport });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer: createRpcSigner({ account, request }),
    store: createMemorySubmissionStore(),
    maxBlockAge: 2n,
    confirmations: 1n,
  });
  const writer = createBorrowingWriter({ reader, execution });
  const W = 10n ** 18n;
  let timestamp = parseRpcQuantity(initial.timestamp);
  let sequence = 0;
  async function execute(action: BorrowingAction) {
    const prepared = await writer.prepare({
      operationId: `fork-${++sequence}`,
      account,
      action,
      bounds: {
        maxFee: 100n * W,
        maxAnnualRateBps: 65535n,
        minCollateralRatio: (15n * W) / 10n,
        maxBlockAge: 2n,
      },
      trials: 3n,
      seed: 42n,
    });
    const simulated = await writer.simulate(prepared);
    await request({ method: "evm_setNextBlockTimestamp", params: [Number(++timestamp)] });
    const record = await writer.submit(prepared, simulated);
    await request({ method: "evm_mine", params: [] });
    const outcome = await writer.reconcile(prepared, record);
    assert.equal(outcome.state, "reconciled");
    process.stdout.write(`${action.kind}: reconciled ${record.hash}\n`);
    return prepared;
  }
  const before = await reader.read({ account });
  assert.equal(before.position.status, "nonexistent");
  await execute({ kind: "open", collateral: W, borrow: 3000n * W });
  await execute({ kind: "add-collateral", collateral: W / 10n });
  await execute({ kind: "withdraw-collateral", collateral: W / 20n });
  await execute({ kind: "borrow", amount: 100n * W });
  await execute({ kind: "repay", amount: 50n * W });
  await execute({
    kind: "adjust",
    depositCollateral: W / 100n,
    withdrawCollateral: 0n,
    debtChange: 10n * W,
    increaseDebt: false,
  });
  await execute({ kind: "refinance" });
  // Closing requires fees/interest in addition to the originally minted amount.
  // Transfer additional MUSD from a funded protocol address impersonated only
  // inside the local fork. No token or borrowing storage is patched.
  const token = registry.resolve({ contractId: "musd.token", networkId: network.id, blockNumber });
  const holder = registry.resolve({
    contractId: "musd.gas-pool",
    networkId: network.id,
    blockNumber,
  }).address;
  await request({ method: "anvil_impersonateAccount", params: [holder] });
  try {
    await request({ method: "anvil_setBalance", params: [holder, toRpcQuantity(W)] });
    const transfer = fixtureAbi("token", "transfer");
    await request({ method: "evm_setNextBlockTimestamp", params: [Number(++timestamp)] });
    const fundingHash = await request({
      method: "eth_sendTransaction",
      params: [
        {
          from: holder,
          to: token.address,
          data: encodeFunctionData(transfer, [account, 100n * W]),
        },
      ],
    });
    await request({ method: "evm_mine", params: [] });
    assert.equal(
      object(await request({ method: "eth_getTransactionReceipt", params: [fundingHash] })).status,
      "0x1",
    );
  } finally {
    await request({ method: "anvil_stopImpersonatingAccount", params: [holder] });
  }
  await execute({ kind: "close" });
  assert.equal((await reader.read({ account })).position.status, "closed-by-owner");
  await assert.rejects(
    writer.prepare({
      operationId: "empty-surplus",
      account,
      action: { kind: "claim-surplus" },
      bounds: { maxFee: 0n, maxAnnualRateBps: 65535n, minCollateralRatio: 0n, maxBlockAge: 2n },
      trials: 1n,
      seed: 0n,
    }),
  );
  // Set up a claimable surplus using real pool entrypoints and locally
  // impersonated authorized callers. This does not test a redemption writer.
  const pool = registry.resolve({
    contractId: "musd.coll-surplus-pool",
    networkId: network.id,
    blockNumber,
  });
  const manager = registry.resolve({
    contractId: "musd.trove-manager",
    networkId: network.id,
    blockNumber,
  });
  const activePool = registry.resolve({
    contractId: "musd.active-pool",
    networkId: network.id,
    blockNumber,
  });
  const surplusAmount = W / 100n;
  for (const caller of [manager.address, activePool.address])
    await request({ method: "anvil_impersonateAccount", params: [caller] });
  try {
    const accountSurplus = fixtureAbi("coll-surplus-pool", "accountSurplus");
    await request({ method: "anvil_setBalance", params: [manager.address, toRpcQuantity(W)] });
    await request({ method: "evm_setNextBlockTimestamp", params: [Number(++timestamp)] });
    const accountHash = await request({
      method: "eth_sendTransaction",
      params: [
        {
          from: manager.address,
          to: pool.address,
          data: encodeFunctionData(accountSurplus, [account, surplusAmount]),
        },
      ],
    });
    await request({ method: "evm_mine", params: [] });
    assert.equal(
      object(await request({ method: "eth_getTransactionReceipt", params: [accountHash] })).status,
      "0x1",
    );
    await request({ method: "evm_setNextBlockTimestamp", params: [Number(++timestamp)] });
    const depositHash = await request({
      method: "eth_sendTransaction",
      params: [
        {
          from: activePool.address,
          to: pool.address,
          value: toRpcQuantity(surplusAmount),
          data: "0x",
        },
      ],
    });
    await request({ method: "evm_mine", params: [] });
    assert.equal(
      object(await request({ method: "eth_getTransactionReceipt", params: [depositHash] })).status,
      "0x1",
    );
  } finally {
    for (const caller of [manager.address, activePool.address])
      await request({ method: "anvil_stopImpersonatingAccount", params: [caller] });
  }
  await execute({ kind: "claim-surplus" });
  process.stdout.write(
    `Fork ${blockNumber} ${blockHash}: nine borrower actions reconciled; empty surplus rejected. Native oracle used an explicit captured-response fixture; surplus setup used local caller impersonation.\n`,
  );
} finally {
  try {
    assert.equal(await request({ method: "evm_revert", params: [snapshotId] }), true);
  } finally {
    await request({ method: "evm_setAutomine", params: [true] });
  }
}
