import { createExecutionClient } from "@mezo-dev-kit/core";
import {
  createBasicPoolReader,
  createBasicPoolTargetResolver,
  createBasicLiquidityWriter,
} from "@mezo-dev-kit/pools";
import type {
  BasicPoolKey,
  BasicLiquidityBounds,
  BasicLiquidityOutcome,
} from "@mezo-dev-kit/pools";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Add to an existing pool. Desired amounts follow the sorted key's token0/token1 base units. */
export async function addLiquidity(
  { network, registry, transport, signer, store, account }: Connection,
  input: {
    readonly operationId: string;
    readonly key: BasicPoolKey;
    readonly amount0Desired: bigint;
    readonly amount1Desired: bigint;
    readonly bounds: BasicLiquidityBounds;
  },
  polling = confirmationPolicy,
): Promise<Readonly<BasicLiquidityOutcome>> {
  const reader = createBasicPoolReader({ networkId: "mezo-mainnet", registry, transport });
  const resolveTarget = createBasicPoolTargetResolver({ reader, key: input.key, account });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    resolveTarget,
    maxBlockAge: input.bounds.maxBlockAge,
    confirmations: 1n,
  });
  const writer = createBasicLiquidityWriter({ reader, execution });
  const preparation = {
    operationId: input.operationId,
    key: input.key,
    account,
    action: {
      kind: "add" as const,
      amount0Desired: input.amount0Desired,
      amount1Desired: input.amount1Desired,
    },
    bounds: input.bounds,
  };
  let prepared = await writer.prepare(preparation);
  // Two assets can each require a reset and an approval. Confirm one at a time.
  for (let attempt = 0; ; attempt++) {
    const approval = prepared.approvals.find(({ plan }) => plan.kind !== "sufficient");
    if (!approval) break;
    invariant(attempt < 4, "Pool token allowances changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: approval.token,
        plan: approval.plan,
      },
      polling,
    );
    // Re-read reserves and allowances without loosening the user's token/LP minimums.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  // Desired amounts are caps; the pool ratio determines actual deposits and LP issuance.
  return outcome;
}
