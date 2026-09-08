/** Opt-in public-entrypoint loop: real basic Router/Pool and MUSD/mUSDC on a local fork. */
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
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseRpcQuantity,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import {
  createBasicLiquidityWriter,
  createBasicPoolReader,
  createBasicPoolTargetResolver,
  sortBasicPoolKey,
} from "@mezo-dev-kit/pools";
import type { BasicLiquidityAction } from "@mezo-dev-kit/pools";
import { verifyLocalForkParent } from "../../../../scripts/lib/local-native-fixture.ts";
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
const [localUrl, sourceUrl] = process.argv.slice(2);
if (
  !localUrl ||
  !sourceUrl ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(localUrl).hostname)
)
  throw new Error("usage: node test/fork.ts <localhost-anvil-url> <read-only-source-rpc>");
let id = 0;
let request: RpcRequest = async (input) => {
  const callId = ++id;
  const response = await fetch(localUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: callId, ...input }),
    signal: AbortSignal.timeout(30000),
  });
  assert(response.ok);
  const raw = object(await response.json());
  assert.equal(raw.id, callId);
  assert.equal(raw.jsonrpc, "2.0");
  if (raw.error) throw new Error(JSON.stringify(raw.error));
  return raw.result;
};
const version = await request({ method: "web3_clientVersion", params: [] });
assert(typeof version === "string" && version.toLowerCase().includes("anvil"));
const network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry(),
  codec = createAbiCodec();
const transport = createRpcTransport({
  id: "local-basic-pool-fork",
  request: (input) => request(input),
});
const accounts = await request({ method: "eth_accounts", params: [] });
assert(Array.isArray(accounts));
const account = parseAddress(accounts[0]);
const snapshotId = await request({ method: "evm_snapshot", params: [] });
try {
  const blockNumber = parseUint(await transport.getBlockNumber()),
    parent = await transport.getBlock(blockNumber);
  assert(parent);
  await verifyLocalForkParent({
    sourceUrl,
    blockNumber,
    blockHash: parseHash32(parent.hash),
    chainId: network.evmChainId,
  });
  await request({ method: "evm_setAutomine", params: [false] });
  const rawRequest = request;
  request = async (input) => {
    const result = await rawRequest(
      input.method === "eth_sendTransaction"
        ? { ...input, params: [{ ...object(input.params[0]), gas: "0x2dc6c0" }] }
        : input,
    );
    if (input.method === "eth_sendTransaction") {
      const current = object(
        await rawRequest({ method: "eth_getBlockByNumber", params: ["latest", false] }),
      );
      await rawRequest({
        method: "evm_setNextBlockTimestamp",
        params: [Number(parseRpcQuantity(current.timestamp) + 1n)],
      });
      await rawRequest({ method: "evm_mine", params: [] });
    }
    return result;
  };
  const musd = registry.resolve({ contractId: "musd.token", networkId: network.id, blockNumber }),
    gasPool = registry.resolve({ contractId: "musd.gas-pool", networkId: network.id, blockNumber }),
    morpho = registry.resolve({ contractId: "lending.morpho", networkId: network.id, blockNumber });
  // A canonical historical fixture selects the asset; the public reader verifies current code/topology.
  const index = object(
    JSON.parse(
      readFileSync(
        new URL("../../../../knowledge/protocols/lending/musdc/index.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert(Array.isArray(index.resources));
  const resource = object(
    index.resources.find(
      (entry: unknown) => object(entry).id === "musdc-lending-fixed-block-state",
    ),
  );
  assert(typeof resource.path === "string");
  const evidence = object(
    JSON.parse(
      readFileSync(
        new URL(`../../../../knowledge/protocols/lending/musdc/${resource.path}`, import.meta.url),
        "utf8",
      ),
    ),
  );
  const musdc = parseAddress(object(evidence.market).loanToken);
  const tokenAbi: unknown = JSON.parse(
    readFileSync(
      new URL("../../../../knowledge/contracts/artifacts/abis/musd/token.json", import.meta.url),
      "utf8",
    ),
  );
  assert(Array.isArray(tokenAbi));
  const transfer: unknown = tokenAbi.find((entry: unknown) => object(entry).name === "transfer");
  for (const [holder, token, amount] of [
    [gasPool.address, musd.address, 1000n * 10n ** 18n],
    [morpho.address, musdc, 1000n * 10n ** 6n],
  ] as const) {
    await request({ method: "anvil_impersonateAccount", params: [holder] });
    try {
      await request({ method: "anvil_setBalance", params: [holder, toRpcQuantity(10n ** 18n)] });
      const hash = parseHash32(
        await request({
          method: "eth_sendTransaction",
          params: [
            { from: holder, to: token, data: codec.encodeFunction(transfer, [account, amount]) },
          ],
        }),
      );
      assert.equal(
        object(await request({ method: "eth_getTransactionReceipt", params: [hash] })).status,
        "0x1",
      );
    } finally {
      await request({ method: "anvil_stopImpersonatingAccount", params: [holder] });
    }
  }
  const key = sortBasicPoolKey({ tokenA: musd.address, tokenB: musdc, stable: true }),
    reader = createBasicPoolReader({ networkId: "mezo-mainnet", registry, transport });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer: createRpcSigner({ account, request: (input) => request(input) }),
    store: createMemorySubmissionStore(),
    maxBlockAge: 100n,
    confirmations: 1n,
    resolveTarget: createBasicPoolTargetResolver({ reader, key, account }),
  });
  const writer = createBasicLiquidityWriter({ reader, execution }),
    approvals = createApprovalWriter({
      reader: createTokenReader({ transport }),
      transport,
      execution,
    });
  let sequence = 0;
  async function run(action: BasicLiquidityAction) {
    const initial = await reader.read({ key, account });
    const operationId = `pool-${++sequence}`;
    const bounds = {
      minAmount0: 1n,
      minAmount1: 1n,
      minLiquidity: action.kind === "add" ? 1n : 0n,
      deadline: initial.timestamp + 600n,
      maxDeadlineSeconds: 600n,
      maxBlockAge: 100n,
    };
    let prepared = await writer.prepare({ key, account, operationId, action, bounds });
    for (
      let attempt = 0;
      prepared.approvals.some((entry) => entry.plan.kind !== "sufficient");
      attempt++
    ) {
      assert(attempt < 8, "bounded approval loop");
      const item = prepared.approvals.find((entry) => entry.plan.kind !== "sufficient");
      assert(item && item.plan.kind !== "sufficient");
      const approval = await approvals.prepare({
        ...item.token,
        operationId: `${operationId}-approval-${attempt}`,
        amount: item.plan.amount,
        expectedAllowance: item.token.allowance,
      });
      const record = await approvals.submit(approval, await approvals.simulate(approval));
      await approvals.reconcile(approval, record);
      prepared = await writer.prepare({ key, account, operationId, action, bounds });
    }
    const record = await writer.submit(prepared, await writer.simulate(prepared));
    const result = await writer.reconcile(prepared, record);
    assert.equal(result.state, "reconciled");
    process.stdout.write(
      `${action.kind}: ${result.outcome.amount0} / ${result.outcome.amount1}, LP ${result.outcome.liquidity}\n`,
    );
    return result.outcome.snapshot;
  }
  const before = await reader.read({ key, account });
  assert.equal(before.lp.balance, 0n);
  assert.equal(before.writeCompatible, true);
  const added = await run({
    kind: "add",
    amount0Desired: 50n * 10n ** 6n,
    amount1Desired: 50n * 10n ** 18n,
  });
  assert(added.lp.balance > 0n);
  const partial = await run({ kind: "remove", liquidity: added.lp.balance / 2n });
  const exited = await run({ kind: "remove", liquidity: partial.lp.balance });
  assert.equal(exited.lp.balance, 0n);
  process.stdout.write(
    `Basic MUSD/mUSDC enter, partial exit and final exit passed at fork parent ${blockNumber} ${parseHash32(parent.hash)}. Only local funding/impersonation was used; token, router, factory and pool code were unchanged.\n`,
  );
} finally {
  assert.equal(await request({ method: "evm_revert", params: [snapshotId] }), true);
}
