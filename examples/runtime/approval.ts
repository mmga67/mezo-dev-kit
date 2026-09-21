import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { ExecutionClient } from "@mezo-dev-kit/core";
import type { ExampleRuntime } from "./example-runtime.ts";
import { approveTokenAmount } from "../tokens/approve.ts";

/** Complete one independent exact approval or reset; the recipe must then reprepare. */
export async function approveToken(
  runtime: ExampleRuntime,
  execution: ExecutionClient,
  step: string,
  token: TokenSnapshot,
  plan: ApprovalPlan,
): Promise<void> {
  if (plan.kind === "sufficient") return;
  runtime.report(`${step}: ${plan.kind}`, {
    token: token.target.address,
    spender: token.spender,
    amount: plan.amount,
    previousAllowance: token.allowance,
  });
  await approveTokenAmount(
    { transport: runtime.transport, execution },
    { token, plan, operationId: runtime.operationId(step) },
    runtime.polling,
  );
}
