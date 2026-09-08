import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry, resolveRoleInterface } from "@mezo-dev-kit/contracts";
import { createGaugeReader, createGaugeWriter } from "@mezo-dev-kit/incentives";
import type { GaugeAction } from "@mezo-dev-kit/incentives";
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
  createVaultRpcReader,
  createVaultWriter,
  createVaultTargetResolver,
} from "@mezo-dev-kit/usdc-lending-vault";
import type { VaultAction, VaultBounds } from "@mezo-dev-kit/usdc-lending-vault";

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
const reader = createVaultRpcReader({ networkId: network.id, registry, transport });
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request: (input) => request(input) }),
  store: createMemorySubmissionStore(),
  maxBlockAge: 100n,
  confirmations: 1n,
  resolveTarget: createVaultTargetResolver({ reader, account, maxPriceAgeSeconds: 300n }),
});
const writer = createVaultWriter({ reader, registry, transport, execution });
const approvals = createApprovalWriter({
  reader: createTokenReader({ transport }),
  execution,
  transport,
});
const codec = createAbiCodec();
const bounds: VaultBounds = {
  maxBlockAge: 100n,
  maxPriceAgeSeconds: 300n,
  minOutput: 1n,
  maxInput: 10n ** 30n,
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

  const snapshot = await reader.read({
    account,
    maxPriceAgeSeconds: 300n,
    previewAssets: 0n,
    previewShares: 0n,
  });
  const tuple = codec.decodeFunction(
    params,
    await transport.read({
      ...snapshot.coordinate,
      contractId: morpho.contractId,
      address: morpho.address,
      data: codec.encodeFunction(params, [snapshot.underlyingMarket.marketId]),
    }),
  );
  const token = parseAddress(tuple[0]);
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
  async function mined(input: Parameters<RpcRequest>[0]) {
    const hash = parseHash32(await request(input));
    assert.equal(
      object(await request({ method: "eth_getTransactionReceipt", params: [hash] })).status,
      "0x1",
    );
  }
  await request({ method: "anvil_impersonateAccount", params: [morpho.address] });
  try {
    await request({
      method: "anvil_setBalance",
      params: [morpho.address, toRpcQuantity(10n ** 18n)],
    });
    await mined({
      method: "eth_sendTransaction",
      params: [
        {
          from: morpho.address,
          to: token,
          data: codec.encodeFunction(transfer, [account, 1000n * 10n ** 6n]),
        },
      ],
    });
  } finally {
    await request({ method: "anvil_stopImpersonatingAccount", params: [morpho.address] });
  }
  async function run(action: VaultAction) {
    let prepared = await writer.prepare({
      operationId: `vault-${++sequence}`,
      account,
      action,
      bounds,
    });
    for (let step = 0; prepared.approval.kind !== "sufficient"; step++) {
      assert(step < 2, "approval did not converge");
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
        operationId: `vault-${++sequence}`,
        account,
        action,
        bounds,
      });
    }
    const outcome = await writer.reconcile(
      prepared,
      await writer.submit(prepared, await writer.simulate(prepared)),
    );
    assert(outcome.outcome.boundsSatisfied);
    process.stdout.write(`${action.kind}: ${outcome.state}\n`);
    return outcome.outcome;
  }
  await run({ kind: "deposit", assets: 100n * 10n ** 6n });
  await run({ kind: "mint", shares: 10n ** 12n });
  await run({ kind: "withdraw", assets: 25n * 10n ** 6n });
  let current = await reader.read({
    account,
    maxPriceAgeSeconds: 300n,
    previewAssets: 0n,
    previewShares: 0n,
  });
  assert(current.walletVaultShares.status === "available");
  await run({ kind: "wrap-and-stake", shares: current.walletVaultShares.value.baseUnits / 2n });
  current = await reader.read({
    account,
    maxPriceAgeSeconds: 300n,
    previewAssets: 0n,
    previewShares: 0n,
  });
  assert(current.gauge.status === "available");
  const gaugeAddress = current.gauge.value.address;
  const rewardAbi = resolveRoleInterface({ role: "vault-gauge", networkId: network.id }).abi.find(
    (entry) => entry.name === "rewardToken",
  );
  const rewardToken = parseAddress(
    codec.decodeFunction(
      rewardAbi,
      await transport.read({
        ...current.coordinate,
        contractId: "vaults.usdc-lending-wrapper",
        address: gaugeAddress,
        data: codec.encodeFunction(rewardAbi),
      }),
    )[0],
  );
  // The native MEZO token also requires an explicit local dispatch fixture.
  const artifact = object(JSON.parse(readFileSync(nativeArtifact, "utf8")));
  const nativeAbi = artifact.abi;
  assert(Array.isArray(nativeAbi));
  await request({
    method: "anvil_setCode",
    params: [rewardToken, parseHexData(object(artifact.deployedBytecode).object)],
  });
  const seed: unknown = nativeAbi.find((entry: unknown) => object(entry).name === "seed");
  await mined({
    method: "eth_sendTransaction",
    params: [
      {
        from: account,
        to: rewardToken,
        data: codec.encodeFunction(seed, [gaugeAddress, 10n ** 30n]),
      },
    ],
  });
  const gaugeReader = createGaugeReader({
    networkId: network.id,
    role: "vault-gauge",
    registry,
    transport,
  });
  const gaugeWriter = createGaugeWriter({ reader: gaugeReader, execution });
  async function gaugeAction(action: GaugeAction) {
    let prepared = await gaugeWriter.prepare({
      operationId: `gauge-${++sequence}`,
      account,
      action,
      bounds: { maxBlockAge: 100n, minReward: 0n },
    });
    if (prepared.approval.kind !== "sufficient") {
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
      prepared = await gaugeWriter.prepare({
        operationId: `gauge-${++sequence}`,
        account,
        action,
        bounds: { maxBlockAge: 100n, minReward: 0n },
      });
    }
    const result = await gaugeWriter.reconcile(
      prepared,
      await gaugeWriter.submit(prepared, await gaugeWriter.simulate(prepared)),
    );
    process.stdout.write(`${action.kind}: ${result.state}, rewards ${result.outcome.rewardPaid}\n`);
    return result.outcome;
  }
  const staked = (await gaugeReader.read({ account })).stake;
  assert(staked > 0n);
  await gaugeAction({ kind: "unstake", amount: staked });
  await gaugeAction({ kind: "stake", amount: staked });
  await gaugeAction({ kind: "claim-reward" });
  await gaugeAction({ kind: "unstake", amount: staked });
  await run({ kind: "unwrap", receipts: staked });
  current = await reader.read({
    account,
    maxPriceAgeSeconds: 300n,
    previewAssets: 0n,
    previewShares: 0n,
  });
  assert(current.walletVaultShares.status === "available");
  await run({ kind: "redeem", shares: current.walletVaultShares.value.baseUnits });
  process.stdout.write(
    `Vault deposit/mint/withdraw/wrap/gauge/unwrap/redeem passed at parent ${blockNumber} ${parseHash32(parent.hash)}. Funding, oracle and native reward-token execution were explicit local fixtures; vault, wrapper, adapter and gauge code were unchanged.\n`,
  );
} finally {
  await request({ method: "evm_setAutomine", params: [true] });
  assert.equal(await request({ method: "evm_revert", params: [checkpoint] }), true);
}
