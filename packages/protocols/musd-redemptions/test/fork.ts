/** Opt-in local-fork writer proof; real MUSD/TroveManager, captured native oracle responses. */
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
  createRedemptionReader,
  createRedemptionTraceSimulator,
  createRedemptionWriter,
} from "@mezo-dev-kit/musd-redemptions";
import type { RedemptionQuoteInput } from "@mezo-dev-kit/musd-redemptions";
import {
  installLocalNativeFixture,
  verifyLocalForkParent,
} from "../../../../scripts/lib/local-native-fixture.ts";
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
function rpc(url: string, readOnly: boolean): RpcRequest {
  let id = 0;
  return async (input) => {
    assert(!readOnly || ["eth_call", "eth_chainId", "eth_getBlockByNumber"].includes(input.method));
    const callId = ++id,
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: callId, ...input }),
        signal: AbortSignal.timeout(120000),
      });
    assert(response.ok);
    const body = object(await response.json());
    assert.equal(body.id, callId);
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  };
}
let request = rpc(localUrl, false);
const source = rpc(sourceUrl, true),
  network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry(),
  codec = createAbiCodec(),
  W = 10n ** 18n;
const version = await request({ method: "web3_clientVersion", params: [] });
assert(typeof version === "string" && version.toLowerCase().includes("anvil"));
const transport = createRpcTransport({
    id: "local-redemption-fork",
    request: (input) => request(input),
  }),
  blockNumber = parseUint(await transport.getBlockNumber()),
  parent = await transport.getBlock(blockNumber);
assert(parent);
await verifyLocalForkParent({
  sourceUrl,
  blockNumber,
  blockHash: parseHash32(parent.hash),
  chainId: network.evmChainId,
});
const snapshotId = await request({ method: "evm_snapshot", params: [] });
try {
  await request({ method: "evm_setAutomine", params: [false] });
  const oracle = registry.resolve({
      contractId: "oracle.skip-btc-usd",
      networkId: network.id,
      blockNumber,
    }),
    responses: { selector: `0x${string}`; data: `0x${string}` }[] = [];
  for (const name of ["decimals", "latestRoundData"]) {
    const abi = oracle.readAbi.find((entry) => entry.type === "function" && entry.name === name);
    assert(abi);
    const selector = codec.encodeFunction(abi, []),
      data = parseHexData(
        await source({
          method: "eth_call",
          params: [{ to: oracle.address, data: selector }, toRpcQuantity(blockNumber)],
        }),
      );
    codec.decodeFunction(abi, data);
    responses.push({ selector, data });
  }
  request = await installLocalNativeFixture({ request, address: oracle.address, responses });
  const rawRequest = request;
  let sendCount = 0,
    traceCount = 0;
  request = async (input) => {
    if (input.method === "debug_traceCall") traceCount++;
    const result = await rawRequest(
      input.method === "eth_sendTransaction"
        ? { ...input, params: [{ ...object(input.params[0]), gas: "0x989680" }] }
        : input,
    );
    if (input.method === "eth_sendTransaction") {
      sendCount++;
      const header = object(
        await rawRequest({ method: "eth_getBlockByNumber", params: ["latest", false] }),
      );
      await rawRequest({
        method: "evm_setNextBlockTimestamp",
        params: [Number(parseRpcQuantity(header.timestamp) + 1n)],
      });
      await rawRequest({ method: "evm_mine", params: [] });
    }
    return result;
  };
  const accounts = await request({ method: "eth_accounts", params: [] });
  assert(Array.isArray(accounts));
  const account = parseAddress(accounts[0]);
  const reader = createRedemptionReader({ networkId: "mezo-mainnet", registry, transport }),
    simulator = createRedemptionTraceSimulator({
      request: (input) => request(input),
      transport,
      providerId: "local-anvil-callTracer",
      timeoutMs: 60000,
      maxFrames: 4096,
      maxLogs: 4096,
      maxDepth: 64,
      maxDataBytes: 4 * 1024 * 1024,
    });
  const execution = createExecutionClient({
      network,
      registry,
      transport,
      signer: createRpcSigner({ account, request: (input) => request(input) }),
      store: createMemorySubmissionStore(),
      maxBlockAge: 2n,
      confirmations: 1n,
    }),
    writer = createRedemptionWriter({ reader, simulator, execution, transport });
  const token = registry.resolve({ contractId: "musd.token", networkId: network.id, blockNumber }),
    holder = registry.resolve({
      contractId: "musd.borrower-operations",
      networkId: network.id,
      blockNumber,
    }).address;
  const abi: unknown = JSON.parse(
    readFileSync(
      new URL("../../../../knowledge/contracts/artifacts/abis/musd/token.json", import.meta.url),
      "utf8",
    ),
  );
  assert(Array.isArray(abi));
  const transfer: unknown = abi.find((entry: unknown) => object(entry).name === "mint");
  // Local fixture funding through the real token mint entrypoint and locally impersonated authority.
  // No production authority, protocol storage patch or source-chain write.
  const funding = 1000000n * W;
  await request({ method: "anvil_impersonateAccount", params: [holder] });
  try {
    await request({ method: "anvil_setBalance", params: [holder, toRpcQuantity(W)] });
    const hash = parseHash32(
      await request({
        method: "eth_sendTransaction",
        params: [
          {
            from: holder,
            to: token.address,
            data: codec.encodeFunction(transfer, [account, funding]),
          },
        ],
      }),
    );
    assert.equal(object(await transport.getReceipt(hash)).status, "0x1");
  } finally {
    await request({ method: "anvil_stopImpersonatingAccount", params: [holder] });
  }
  const inputs: RedemptionQuoteInput = {
    account,
    requestedAmount: 100n * W,
    maxIterations: 1n,
    maxTailScan: 64,
    trials: 5n,
    seed: 42n,
  };
  const first = await reader.quote(inputs);
  assert(first.snapshot.positions[0]);
  process.stdout.write(
    `First eligible ${first.first}: net debt ${first.snapshot.positions[0].position.netDebt}, minimum ${first.snapshot.borrowing.minimumNetDebt}, hint truncated ${first.helperTruncatedAmount}\n`,
  );
  let sequence = 0;
  async function execute(input: RedemptionQuoteInput, label: string) {
    const prepared = await writer.prepare({
      operationId: `redemption-${++sequence}`,
      quote: input,
      bounds: {
        minActualAmount: 1n,
        minNetCollateral: 1n,
        maxRedemptionRate: W / 100n,
        maxBlockAge: 2n,
      },
    });
    const simulated = await writer.simulate(prepared),
      record = await writer.submit(prepared, simulated),
      result = await writer.reconcile(prepared, record);
    assert(result.outcome.boundsSatisfied);
    if (label === "partial") {
      const badFeeTransport = {
        ...transport,
        getReceipt: async (hash: `0x${string}`) => ({
          ...object(await transport.getReceipt(hash)),
          effectiveGasPrice: "0x0",
        }),
      };
      const badFeeWriter = createRedemptionWriter({
        reader,
        simulator,
        execution,
        transport: badFeeTransport,
      });
      await assert.rejects(badFeeWriter.reconcile(prepared, record), {
        code: "ReconciliationMismatch",
      });
    }
    process.stdout.write(
      `${label}: attempted=${result.outcome.amounts.attemptedAmount} actual=${result.outcome.amounts.actualAmount} netBTC=${result.outcome.amounts.netCollateral} feeBTC=${result.outcome.amounts.collateralFee} gas=${result.outcome.gasFee} closed=${result.outcome.closedBorrowers.length} partial=${result.outcome.partialBorrowers.length}\n`,
    );
    return result;
  }
  const partial = await execute(inputs, "partial");
  assert.equal(partial.outcome.partialBorrowers.length, 1);
  const second = await reader.quote({ ...inputs, requestedAmount: W });
  assert(second.snapshot.positions[0]);
  const full = await execute(
    {
      ...inputs,
      requestedAmount: second.snapshot.positions[0].position.netDebt + W,
      amountMode: "requested",
    },
    "full with bounded remainder",
  );
  assert.equal(full.outcome.closedBorrowers.length, 1);
  assert(full.outcome.amounts.actualAmount < full.outcome.amounts.attemptedAmount);
  assert(full.outcome.snapshot.positions.some((row) => row.surplus > 0n));
  const failing = await writer.prepare({
      operationId: "minimum-failure",
      quote: inputs,
      bounds: {
        minActualAmount: 1n,
        minNetCollateral: W,
        maxRedemptionRate: W / 100n,
        maxBlockAge: 2n,
      },
    }),
    beforeSends = sendCount;
  await assert.rejects(writer.simulate(failing), { code: "SimulationFailed" });
  assert.equal(sendCount, beforeSends);
  assert(traceCount >= 5, "initial and final output traces plus minimum rejection required");
  process.stdout.write(
    `Fork ${blockNumber} ${parseHash32(parent.hash)}: full/partial reconciled; impossible output minimum prevented submission. Native oracle fixture only; no live writes.\n`,
  );
} finally {
  try {
    assert.equal(await request({ method: "evm_revert", params: [snapshotId] }), true);
  } finally {
    await request({ method: "evm_setAutomine", params: [true] });
  }
}
