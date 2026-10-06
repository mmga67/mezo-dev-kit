import type { ExecutionClient } from "@mezo-dev-kit/core";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import type { WorkflowConnection } from "./workflow-connection.ts";
import { approveTokenAmount } from "../tokens/approve.ts";

/** The plan names the exact spender and amount; consent is separate from the protocol action. */
export async function approveToken(
  connection: WorkflowConnection,
  execution: ExecutionClient,
  step: string,
  token: TokenSnapshot,
  plan: ApprovalPlan,
): Promise<void> {
  if (plan.kind === "sufficient") return;
  await approveTokenAmount(
    { transport: connection.transport, execution, review: connection.review },
    { token, plan, operationId: connection.operationId(step) },
    connection.polling,
  );
}
