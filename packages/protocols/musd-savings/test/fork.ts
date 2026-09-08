import {
  createGaugeReader,
  createGaugeWriter,
  createGaugeTargetResolver,
} from "@mezo-dev-kit/incentives";
import type { GaugeAction } from "@mezo-dev-kit/incentives";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry, resolveRoleInterface } from "@mezo-dev-kit/contracts";
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
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import { createSavingsRpcReader, createSavingsWriter } from "@mezo-dev-kit/musd-savings";
import type { SavingsAction } from "@mezo-dev-kit/musd-savings";

const [url, nativeArtifact] = process.argv.slice(2);
if (!url || !nativeArtifact || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
  throw new Error(
    "usage: node test/fork.ts <localhost-anvil-url> <compiled-native-token-fixture.json>",
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
  id: "savings-local-fork",
  request: (input) => request(input),
});
assert.equal(await transport.getChainId(), network.evmChainId);
const account = parseAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
const gaugeReader = createGaugeReader({
  networkId: network.id,
  role: "savings-gauge",
  registry,
  transport,
});
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request: (input) => request(input) }),
  store: createMemorySubmissionStore(),
  maxBlockAge: 100n,
  confirmations: 1n,
  resolveTarget: createGaugeTargetResolver({ reader: gaugeReader, account }),
});
const reader = createSavingsRpcReader({ networkId: network.id, registry, transport });
const writer = createSavingsWriter({ reader, registry, transport, execution });
const approvals = createApprovalWriter({
  reader: createTokenReader({ transport }),
  execution,
  transport,
});
const codec = createAbiCodec();
let sequence = 0;
async function mined(hash: unknown) {
  const receipt = object(
    await request({ method: "eth_getTransactionReceipt", params: [parseHash32(hash)] }),
  );
  assert.equal(receipt.status, "0x1");
}
try {
  const blockNumber = parseUint(await transport.getBlockNumber());
  const parent = await transport.getBlock(blockNumber);
  assert(parent);
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
  const token = registry.resolve({ contractId: "musd.token", networkId: network.id, blockNumber });
  const gasPool = registry.resolve({
    contractId: "musd.gas-pool",
    networkId: network.id,
    blockNumber,
  });
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
  await request({ method: "anvil_impersonateAccount", params: [gasPool.address] });
  try {
    await request({
      method: "anvil_setBalance",
      params: [gasPool.address, toRpcQuantity(10n ** 18n)],
    });
    await mined(
      await request({
        method: "eth_sendTransaction",
        params: [
          {
            from: gasPool.address,
            to: token.address,
            data: codec.encodeFunction(transfer, [account, 1000n * 10n ** 18n]),
          },
        ],
      }),
    );
  } finally {
    await request({ method: "anvil_stopImpersonatingAccount", params: [gasPool.address] });
  }
  async function action(action: SavingsAction) {
    let prepared = await writer.prepare({
      operationId: `savings-${++sequence}`,
      account,
      action,
      bounds: { maxBlockAge: 100n, minYield: 0n },
    });
    if (prepared.approval.kind !== "sufficient") {
      const approval = await approvals.prepare({
        ...prepared.token,
        operationId: `approval-${sequence}`,
        amount: prepared.approval.amount,
        expectedAllowance: prepared.token.allowance,
      });
      const record = await approvals.submit(approval, await approvals.simulate(approval));
      await approvals.reconcile(approval, record);
      prepared = await writer.prepare({
        operationId: `savings-${++sequence}`,
        account,
        action,
        bounds: { maxBlockAge: 100n, minYield: 0n },
      });
      assert.equal(prepared.approval.kind, "sufficient");
    }
    const record = await writer.submit(prepared, await writer.simulate(prepared));
    const outcome = await writer.reconcile(prepared, record);
    assert(outcome.outcome.boundsSatisfied);
    process.stdout.write(`${action.kind}: ${outcome.state}\n`);
    return outcome;
  }
  await action({ kind: "deposit", amount: 100n * 10n ** 18n });
  await action({ kind: "withdraw", amount: 25n * 10n ** 18n });
  const beforeClaim = await reader.read({ account });
  assert.equal(beforeClaim.wallet.status, "available");
  if (beforeClaim.wallet.status !== "available") throw new Error("missing wallet");
  // Seed yield through the real permissionless protocol entrypoint, using locally funded MUSD.
  const source: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../../../knowledge/contracts/artifacts/dynamic-interfaces/savings-current-explorer.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const abi = object(source).abi;
  assert(Array.isArray(abi));
  const receive: unknown = abi.find(
    (value: unknown) =>
      object(value).type === "function" && object(value).name === "receiveProtocolYield",
  );
  const state = await createTokenReader({ transport }).read({
    target: { contractId: token.contractId, address: token.address },
    account,
    spender: beforeClaim.savings,
    coordinate: beforeClaim.coordinate,
  });
  const approval = await approvals.prepare({
    ...state,
    operationId: "seed-yield-approval",
    amount: 10n * 10n ** 18n,
    expectedAllowance: 0n,
  });
  await approvals.reconcile(
    approval,
    await approvals.submit(approval, await approvals.simulate(approval)),
  );
  await mined(
    await request({
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: beforeClaim.savings,
          data: codec.encodeFunction(receive, [10n * 10n ** 18n]),
        },
      ],
    }),
  );
  const claim = await action({ kind: "claim-yield" });
  assert(claim.outcome.yieldPaid > 0n);
  const current = await reader.read({ account });
  assert(current.gauge.status === "available");
  const gaugeAddress = current.gauge.value.address;
  const rewardAbi = resolveRoleInterface({ role: "savings-gauge", networkId: network.id }).abi.find(
    (entry) => entry.name === "rewardToken",
  );
  const rewardToken = parseAddress(
    codec.decodeFunction(
      rewardAbi,
      await transport.read({
        ...current.coordinate,
        contractId: "musd.savings-rate",
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
  await mined(
    await request({
      method: "eth_sendTransaction",
      params: [
        {
          from: account,
          to: rewardToken,
          data: codec.encodeFunction(seed, [gaugeAddress, 10n ** 30n]),
        },
      ],
    }),
  );
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
  const staked = 50n * 10n ** 18n;
  await gaugeAction({ kind: "stake", amount: staked });
  await gaugeAction({ kind: "claim-reward" });
  await gaugeAction({ kind: "unstake", amount: staked });
  await action({ kind: "withdraw", amount: 75n * 10n ** 18n });
  process.stdout.write(
    `Savings enter/partial exit/yield/full exit passed at parent ${blockNumber} ${parseHash32(parent.hash)}. Funding, yield setup and native reward-token execution were local fixtures; Savings, MUSD and gauge code were unchanged.\n`,
  );
} finally {
  await request({ method: "evm_setAutomine", params: [true] });
  assert.equal(await request({ method: "evm_revert", params: [checkpoint] }), true);
}
