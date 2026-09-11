import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import {
  createExecutionClient,
  createMemorySubmissionStore,
  createRpcSigner,
} from "@mezo-dev-kit/core";
import type { RpcRequest, RpcTransport } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseHash32,
  parseRpcQuantity,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import {
  createCLPoolReader,
  createCLPositionTargetResolver,
  createCLPositionWriter,
  getCLTickSqrtRatio,
} from "@mezo-dev-kit/pools";
import type { CLPoolKey, CLPositionAction } from "@mezo-dev-kit/pools";
function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
/** Invoked only by cl-fork.ts after localhost/Anvil/source-parent verification. */
export async function clPositionForkWorkflows(config: {
  readonly registry: Readonly<ContractRegistry>;
  readonly transport: RpcTransport;
  readonly request: RpcRequest;
  readonly account: `0x${string}`;
  readonly key: CLPoolKey;
  readonly musd: `0x${string}`;
  readonly musdc: `0x${string}`;
}): Promise<void> {
  const { registry, transport, account, key } = config,
    raw = config.request,
    network = getNetwork("mezo-mainnet"),
    codec = createAbiCodec(),
    blockNumber = parseUint(await transport.getBlockNumber()),
    snapshotId = await raw({ method: "evm_snapshot", params: [] });
  try {
    await raw({ method: "evm_setAutomine", params: [false] });
    const request: RpcRequest = async (input) => {
      if (input.method === "eth_sendTransaction")
        await raw({ method: "anvil_setNextBlockBaseFeePerGas", params: ["0x0"] });
      const result = await raw(
        input.method === "eth_sendTransaction"
          ? { ...input, params: [{ ...object(input.params[0]), gas: "0x7a1200", gasPrice: "0x1" }] }
          : input,
      );
      if (input.method === "eth_sendTransaction") {
        const block = object(
          await raw({ method: "eth_getBlockByNumber", params: ["latest", false] }),
        );
        await raw({
          method: "evm_setNextBlockTimestamp",
          params: [Number(parseRpcQuantity(block.timestamp) + 1n)],
        });
        await raw({ method: "evm_mine", params: [] });
      }
      return result;
    };
    const gasPool = registry.resolve({
        contractId: "musd.gas-pool",
        networkId: network.id,
        blockNumber,
      }),
      morpho = registry.resolve({
        contractId: "lending.morpho",
        networkId: network.id,
        blockNumber,
      });
    const tokenAbi: unknown = JSON.parse(
      readFileSync(
        new URL("../../../../knowledge/contracts/artifacts/abis/musd/token.json", import.meta.url),
        "utf8",
      ),
    );
    assert(Array.isArray(tokenAbi));
    const transfer: unknown = tokenAbi.find((row: unknown) => object(row).name === "transfer");
    assert(transfer);
    for (const [holder, token, amount] of [
      [gasPool.address, config.musd, 1000n * 10n ** 18n],
      [morpho.address, config.musdc, 1000n * 10n ** 6n],
    ] as const) {
      await raw({ method: "anvil_impersonateAccount", params: [holder] });
      try {
        await raw({ method: "anvil_setBalance", params: [holder, toRpcQuantity(10n ** 18n)] });
        const hash = parseHash32(
          await request({
            method: "eth_sendTransaction",
            params: [
              { from: holder, to: token, data: codec.encodeFunction(transfer, [account, amount]) },
            ],
          }),
        );
        assert.equal(object(await transport.getReceipt(hash)).status, "0x1");
      } finally {
        await raw({ method: "anvil_stopImpersonatingAccount", params: [holder] });
      }
    }
    const reader = createCLPoolReader({ networkId: "mezo-mainnet", registry, transport }),
      execution = createExecutionClient({
        network,
        registry,
        transport,
        signer: createRpcSigner({ account, request }),
        store: createMemorySubmissionStore(),
        maxBlockAge: 10n,
        confirmations: 1n,
        resolveTarget: createCLPositionTargetResolver({ reader, key, account }),
      }),
      writer = createCLPositionWriter({ reader, execution, transport }),
      approvals = createApprovalWriter({
        reader: createTokenReader({ transport }),
        transport,
        execution,
      });
    let sequence = 0;
    async function run(action: CLPositionAction, empty = false) {
      const state = await reader.read({
          account,
          key,
          tokenIds: action.kind === "mint" ? [] : [action.tokenId],
        }),
        operationId = `cl-position-${++sequence}`,
        bounds = {
          minAmount0: empty || action.kind === "burn" ? 0n : 1n,
          minAmount1: empty || action.kind === "burn" ? 0n : 1n,
          minLiquidity: action.kind === "mint" || action.kind === "increase" ? 1n : 0n,
          sqrtPriceMinX96: getCLTickSqrtRatio(state.tick - 100),
          sqrtPriceMaxX96: getCLTickSqrtRatio(state.tick + 100),
          deadline: state.timestamp + 600n,
          maxDeadlineSeconds: 600n,
          maxBlockAge: 10n,
        };
      let prepared = await writer.prepare({ key, account, operationId, action, bounds });
      for (
        let attempt = 0;
        prepared.approvals.some((item) => item.plan.kind !== "sufficient");
        attempt++
      ) {
        assert(attempt < 8, "bounded CL approvals");
        const item = prepared.approvals.find((item) => item.plan.kind !== "sufficient");
        assert(item && item.plan.kind !== "sufficient");
        const approval = await approvals.prepare({
            ...item.token,
            operationId: `${operationId}-approval-${attempt}`,
            amount: item.plan.amount,
            expectedAllowance: item.token.allowance,
          }),
          record = await approvals.submit(approval, await approvals.simulate(approval));
        await approvals.reconcile(approval, record);
        prepared = await writer.prepare({ key, account, operationId, action, bounds });
      }
      const record = await writer.submit(prepared, await writer.simulate(prepared)),
        result = await writer.reconcile(prepared, record);
      assert(result.outcome.boundsSatisfied);
      assert(result.outcome.gasFee > 0n, "nonzero BTC gas fixture");
      process.stdout.write(
        `CL ${action.kind}: id=${result.outcome.tokenId} amount=${result.outcome.amount0}/${result.outcome.amount1} wallet=${result.outcome.walletDelta0}/${result.outcome.walletDelta1} liquidity=${result.outcome.forecast.liquidityAfter} gas=${result.outcome.gasFee}\n`,
      );
      return result.outcome;
    }
    const initial = await reader.read({ account, key }),
      center = Math.floor(initial.tick / key.tickSpacing) * key.tickSpacing,
      amount0Desired = 50n * 10n ** initial.token0.decimals,
      amount1Desired = 50n * 10n ** initial.token1.decimals;
    const minted = await run({
        kind: "mint",
        tickLower: center - 100 * key.tickSpacing,
        tickUpper: center + 100 * key.tickSpacing,
        amount0Desired,
        amount1Desired,
      }),
      tokenId = minted.tokenId;
    const increased = await run({
      kind: "increase",
      tokenId,
      amount0Desired: amount0Desired / 10n,
      amount1Desired: amount1Desired / 10n,
    });
    const partial = await run({
      kind: "decrease",
      tokenId,
      liquidity: increased.forecast.liquidityAfter / 3n,
    });
    assert.equal(partial.walletDelta0, 0n);
    assert.equal(partial.walletDelta1, 0n);
    const cap = (1n << 128n) - 1n;
    await run({ kind: "collect", tokenId, amount0Max: cap, amount1Max: cap });
    await run({ kind: "collect", tokenId, amount0Max: cap, amount1Max: cap }, true);
    await run({ kind: "decrease", tokenId, liquidity: partial.forecast.liquidityAfter });
    await run({ kind: "collect", tokenId, amount0Max: cap, amount1Max: cap });
    const burned = await run({ kind: "burn", tokenId });
    assert.equal(burned.snapshot.ownedCount, initial.ownedCount);
    process.stdout.write(
      "CL position lifecycle reconciled; real token/manager/pool code, local funding and 1-wei gas-price fixture, snapshot restored.\n",
    );
  } finally {
    try {
      assert.equal(await raw({ method: "evm_revert", params: [snapshotId] }), true);
    } finally {
      await raw({ method: "evm_setAutomine", params: [true] });
    }
  }
}
