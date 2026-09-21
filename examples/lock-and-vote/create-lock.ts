import { createExecutionClient } from "@mezo-dev-kit/core";
import {
  createLockReader,
  createLockTargetResolver,
  createLockWriter,
} from "@mezo-dev-kit/incentives";
import type { LockBounds, LockOutcome } from "@mezo-dev-kit/incentives";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Create a veBTC lock. amount uses underlying token base units; duration uses seconds. */
export async function createBtcLock(
  { network, registry, transport, signer, store, account }: Connection,
  input: {
    readonly operationId: string;
    readonly amount: bigint;
    readonly duration: bigint;
    readonly bounds: LockBounds;
  },
  polling = confirmationPolicy,
): Promise<Readonly<LockOutcome>> {
  const reader = createLockReader({
    role: "vebtc-current",
    networkId: "mezo-mainnet",
    registry,
    transport,
  });
  const resolveTarget = createLockTargetResolver({ reader, account });
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
  const writer = createLockWriter({ reader, execution, transport });
  const preparation = {
    operationId: input.operationId,
    account,
    action: { kind: "create" as const, amount: input.amount, duration: input.duration },
    bounds: input.bounds,
  };
  let prepared = await writer.prepare(preparation);
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "Lock allowance changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: prepared.snapshot.token,
        plan: prepared.approval,
      },
      polling,
    );
    // Lock-end rounding and eligibility are recalculated from the newly observed timestamp.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Lock settled outside the requested bounds");
  // Voting has its own epoch/eligibility checks; creating the NFT completes this operation.
  return outcome;
}
