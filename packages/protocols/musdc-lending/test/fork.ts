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
  parseHexData,
  parseRpcQuantity,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import {
  installLocalNativeFixture,
  verifyLocalForkParent,
} from "../../../../scripts/lib/local-native-fixture.ts";
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import {
  createLendingRpcReader,
  createLendingWriter,
  createLendingTargetResolver,
} from "@mezo-dev-kit/musdc-lending";
import type { LendingAction, LendingBounds } from "@mezo-dev-kit/musdc-lending";

const [url, sourceUrl, nativeArtifact] = process.argv.slice(2);
if (
  !url ||
  !sourceUrl ||
  !nativeArtifact ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)
)
  throw new Error(
    "usage: node test/fork.ts <localhost-anvil-url> <read-only-source-url> <compiled-native-token-fixture.json>",
  );
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid RPC response");
  return value as Record<string, unknown>;
}
let request: RpcRequest = async (input) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...input }),
    signal: AbortSignal.timeout(120000),
  });
  const body = object(await response.json());
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
};
const version = await request({ method: "web3_clientVersion", params: [] });
assert(typeof version === "string" && version.toLowerCase().includes("anvil"));
const checkpoint = await request({ method: "evm_snapshot", params: [] });
const network = getNetwork("mezo-mainnet");
const registry = createContractRegistry();
const transport = createRpcTransport({
  id: "lending-local-fork-native-fixture",
  request: (input) => request(input),
});
assert.equal(await transport.getChainId(), network.evmChainId);
const account = parseAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
const reader = createLendingRpcReader({ networkId: network.id, registry, transport });
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request: (input) => request(input) }),
  store: createMemorySubmissionStore(),
  maxBlockAge: 100n,
  confirmations: 1n,
  resolveTarget: createLendingTargetResolver({ reader, account, maxPriceAgeSeconds: 300n }),
});
const writer = createLendingWriter({ reader, registry, transport, execution });
const approvals = createApprovalWriter({
  reader: createTokenReader({ transport }),
  execution,
  transport,
});
const codec = createAbiCodec();
const bounds: LendingBounds = {
  maxBlockAge: 100n,
  maxPriceAgeSeconds: 300n,
  minAssets: 1n,
  maxAssets: 10_000n * 10n ** 6n,
  minShares: 1n,
  maxShares: 10n ** 30n,
  minBorrowHeadroom: 0n,
};
let sequence = 0;
try {
  const blockNumber = parseUint(await transport.getBlockNumber());
  const parent = await transport.getBlock(blockNumber);
  assert(parent);
  await verifyLocalForkParent({
    sourceUrl,
    blockNumber,
    blockHash: parseHash32(parent.hash),
    chainId: network.evmChainId,
  });
  const oracle = registry.resolve({
    contractId: "oracle.skip-btc-usd",
    networkId: network.id,
    blockNumber,
  });
  const responses: { selector: `0x${string}`; data: `0x${string}` }[] = [];
  for (const name of ["decimals", "latestRoundData"]) {
    const abi = oracle.readAbi.find((entry) => entry.name === name);
    const selector = codec.encodeFunction(abi);
    const response = await fetch(sourceUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: oracle.address, data: selector }, toRpcQuantity(blockNumber)],
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = object(await response.json());
    assert(!result.error);
    const data = parseHexData(result.result);
    codec.decodeFunction(abi, data);
    responses.push({ selector, data });
  }
  request = await installLocalNativeFixture({ request, address: oracle.address, responses });
  await request({ method: "evm_setAutomine", params: [false] });
  const rawRequest = request;
  request = async (input) => {
    // The local wallet uses an explicit gas budget so next-block accrual is covered.
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
  const morpho = registry.resolve({
    contractId: "lending.morpho",
    networkId: network.id,
    blockNumber,
  });
  const params = morpho.readAbi.find((entry) => entry.name === "idToMarketParams");
  const snapshot = await reader.read({ account, maxPriceAgeSeconds: 300n });
  const tuple = codec.decodeFunction(
    params,
    await transport.read({
      ...snapshot.coordinate,
      contractId: morpho.contractId,
      address: morpho.address,
      data: codec.encodeFunction(params, [snapshot.marketId]),
    }),
  );
  const token = parseAddress(tuple[0]);
  const collateral = parseAddress(tuple[1]);
  const artifact = object(JSON.parse(readFileSync(nativeArtifact, "utf8")));
  await request({
    method: "anvil_setCode",
    params: [collateral, parseHexData(object(artifact.deployedBytecode).object)],
  });
  const nativeAbi = artifact.abi;
  assert(Array.isArray(nativeAbi));
  const seed: unknown = nativeAbi.find((entry: unknown) => object(entry).name === "seed");
  const seeded = parseHash32(
    await request({
      method: "eth_sendTransaction",
      params: [
        { from: account, to: collateral, data: codec.encodeFunction(seed, [account, 10n ** 18n]) },
      ],
    }),
  );
  assert.equal(
    object(await request({ method: "eth_getTransactionReceipt", params: [seeded] })).status,
    "0x1",
  );
  const fullAbi: unknown = JSON.parse(
    readFileSync(
      new URL("../../../../knowledge/contracts/artifacts/abis/musd/token.json", import.meta.url),
      "utf8",
    ),
  );
  assert(Array.isArray(fullAbi));
  const transfer: unknown = fullAbi.find(
    (value: unknown) => object(value).type === "function" && object(value).name === "transfer",
  );
  await request({ method: "anvil_impersonateAccount", params: [morpho.address] });
  try {
    await request({
      method: "anvil_setBalance",
      params: [morpho.address, toRpcQuantity(10n ** 18n)],
    });
    const hash = parseHash32(
      await request({
        method: "eth_sendTransaction",
        params: [
          {
            from: morpho.address,
            to: token,
            data: codec.encodeFunction(transfer, [account, 1000n * 10n ** 6n]),
          },
        ],
      }),
    );
    assert.equal(
      object(await request({ method: "eth_getTransactionReceipt", params: [hash] })).status,
      "0x1",
    );
  } finally {
    await request({ method: "anvil_stopImpersonatingAccount", params: [morpho.address] });
  }
  async function run(action: LendingAction) {
    const actionBounds =
      action.kind === "supply-collateral" || action.kind === "withdraw-collateral"
        ? { ...bounds, maxAssets: 10n ** 18n, minShares: 0n }
        : bounds;
    let prepared = await writer.prepare({
      operationId: `lending-${++sequence}`,
      account,
      action,
      bounds: actionBounds,
    });
    while (prepared.approval.kind !== "sufficient") {
      const approval = await approvals.prepare({
        ...prepared.token,
        operationId: `approval-${sequence}`,
        amount: prepared.approval.amount,
        expectedAllowance: prepared.token.allowance,
      });
      await approvals.reconcile(
        approval,
        await approvals.submit(approval, await approvals.simulate(approval)),
      );
      prepared = await writer.prepare({
        operationId: `lending-${++sequence}`,
        account,
        action,
        bounds: actionBounds,
      });
      assert(sequence < 30, "approval flow did not converge");
    }
    const outcome = await writer.reconcile(
      prepared,
      await writer.submit(prepared, await writer.simulate(prepared)),
    );
    assert(outcome.outcome.boundsSatisfied);
    process.stdout.write(`${action.kind}: ${outcome.state}\n`);
    return outcome.outcome;
  }
  await run({ kind: "supply", quantity: { assets: 100n * 10n ** 6n } });
  await run({ kind: "withdraw", quantity: { assets: 25n * 10n ** 6n } });
  const position = (await reader.read({ account, maxPriceAgeSeconds: 300n })).position;
  assert.equal(position.status, "available");
  if (position.status !== "available") throw new Error("position unavailable");
  await run({ kind: "withdraw", quantity: { shares: position.value.supplyShares.baseUnits } });
  await run({ kind: "supply-collateral", assets: 10n ** 18n });
  await run({ kind: "borrow", quantity: { assets: 100n * 10n ** 6n } });
  await run({ kind: "repay", quantity: { assets: 25n * 10n ** 6n } });
  const debt = (await reader.read({ account, maxPriceAgeSeconds: 300n })).position;
  assert(debt.status === "available");
  await run({ kind: "repay", quantity: { shares: debt.value.borrowShares.baseUnits } });
  await run({ kind: "withdraw-collateral", assets: 10n ** 18n });
  process.stdout.write(
    `Lending supply/withdraw/collateral/borrow/repay/full exit passed at parent ${blockNumber} ${parseHash32(parent.hash)}. Loan funding, captured oracle dispatch and native BTC ERC-20 accounting were explicit local fixtures. Morpho and mUSDC token contracts were unchanged; mezod native execution remains unverified by Anvil.\n`,
  );
} finally {
  await request({ method: "evm_setAutomine", params: [true] });
  assert.equal(await request({ method: "evm_revert", params: [checkpoint] }), true);
}
