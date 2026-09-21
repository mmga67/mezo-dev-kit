import { createExecutionClient } from "@mezo-dev-kit/core";
import { createSavingsRpcReader, createSavingsWriter } from "@mezo-dev-kit/musd-savings";
import type { SavingsBounds, SavingsOutcome } from "@mezo-dev-kit/musd-savings";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Deposit MUSD base units and return actual principal settlement. Receipt staking is a separate action. */
export async function depositMusd(
  { network, registry, transport, signer, store, account }: Connection,
  input: { readonly operationId: string; readonly amount: bigint; readonly bounds: SavingsBounds },
  polling = confirmationPolicy,
): Promise<Readonly<SavingsOutcome>> {
  // The RPC factory supplies the ABI adapter; the application supplies connectivity.
  const reader = createSavingsRpcReader({ networkId: network.id, registry, transport });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    maxBlockAge: input.bounds.maxBlockAge,
    confirmations: 1n,
  });
  const writer = createSavingsWriter({ reader, registry, transport, execution });
  const preparation = {
    operationId: input.operationId,
    account,
    action: { kind: "deposit" as const, amount: input.amount },
    bounds: input.bounds,
  };
  let prepared = await writer.prepare(preparation);
  // Some tokens require a reset followed by approval. Each is confirmed independently.
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "Savings allowance changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: prepared.token,
        plan: prepared.approval,
      },
      polling,
    );
    // Refresh state after approval while preserving the user's amount and bounds.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  // Reconciliation verifies principal changes at the receipt block; yield remains separate.
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Savings deposit settled outside the requested bounds");
  return outcome;
}
