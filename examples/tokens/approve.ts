import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";

/**
 * Complete one exact token approval or reset. The calling protocol operation
 * must prepare again afterward: a confirmed approval changes its input state.
 */
export async function approveTokenAmount(
  {
    transport,
    execution,
  }: { readonly transport: RpcTransport; readonly execution: ExecutionClient },
  input: {
    readonly operationId: string;
    readonly token: TokenSnapshot;
    readonly plan: ApprovalPlan;
  },
  polling = confirmationPolicy,
): Promise<void> {
  // A sufficient allowance needs no wallet request. A reset is its own transaction.
  if (input.plan.kind === "sufficient") return;
  const reader = createTokenReader({ transport });
  const writer = createApprovalWriter({ reader, transport, execution });
  const prepared = await writer.prepare({
    ...input.token,
    operationId: input.operationId,
    amount: input.plan.amount,
    expectedAllowance: input.token.allowance,
  });
  // Pin the observed allowance and the exact spender/amount before requesting a signature.
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  // Receipt success alone does not prove that the resulting allowance is the one requested.
  await writer.reconcile(prepared, confirmed);
}
