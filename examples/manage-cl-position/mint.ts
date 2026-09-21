import { createExecutionClient } from "@mezo-dev-kit/core";
import {
  createCLPoolReader,
  createCLPositionTargetResolver,
  createCLPositionWriter,
} from "@mezo-dev-kit/pools";
import type { CLPoolKey, CLPositionBounds, CLPositionOutcome } from "@mezo-dev-kit/pools";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Mint one position in an existing pool. Ticks must align with the key's spacing; amounts use sorted token units. */
export async function mintPosition(
  { network, registry, transport, signer, store, account }: Connection,
  input: {
    readonly operationId: string;
    readonly key: CLPoolKey;
    readonly tickLower: number;
    readonly tickUpper: number;
    readonly amount0Desired: bigint;
    readonly amount1Desired: bigint;
    readonly bounds: CLPositionBounds;
  },
  polling = confirmationPolicy,
): Promise<Readonly<CLPositionOutcome>> {
  const reader = createCLPoolReader({ networkId: "mezo-mainnet", registry, transport });
  const resolveTarget = createCLPositionTargetResolver({ reader, key: input.key, account });
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
  const writer = createCLPositionWriter({ reader, execution, transport });
  const preparation = {
    operationId: input.operationId,
    key: input.key,
    account,
    action: {
      kind: "mint" as const,
      tickLower: input.tickLower,
      tickUpper: input.tickUpper,
      amount0Desired: input.amount0Desired,
      amount1Desired: input.amount1Desired,
    },
    bounds: input.bounds,
  };
  let prepared = await writer.prepare(preparation);
  for (let attempt = 0; ; attempt++) {
    const approval = prepared.approvals.find(({ plan }) => plan.kind !== "sufficient");
    if (!approval) break;
    invariant(attempt < 4, "Position token allowances changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: approval.token,
        plan: approval.plan,
      },
      polling,
    );
    // The pool price may move during approval; recheck the range and original price bounds.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Position mint settled outside the requested bounds");
  // Save the minted tokenId from settlement; predicting the manager's next NFT ID is unsafe.
  return outcome;
}
