import { createExecutionClient } from "@mezo-dev-kit/core";
import type { ExecutionClient, ExecutionTargetResolver } from "@mezo-dev-kit/core";
import type { Connection } from "../setup.ts";

/** Application connections and policies shared by the advanced lifecycle recipes. */
export interface WorkflowConnection extends Connection {
  /** Persist the intent ID before starting. Keep it when recovering that same intent. */
  readonly operationId: (step: string) => string;
  readonly createExecution: (resolveTarget?: ExecutionTargetResolver) => ExecutionClient;
  readonly polling: { readonly attempts: number; readonly pause: () => Promise<void> };
}

/** No I/O on construction; the application chooses confirmation and polling policy. */
export function createWorkflowConnection(
  connection: Connection,
  policy: {
    readonly intentId: string;
    readonly maxBlockAge: bigint;
    readonly confirmations: bigint;
    readonly polling: WorkflowConnection["polling"];
  },
): WorkflowConnection {
  if (policy.intentId.trim() === "") throw new TypeError("A persisted intent ID is required");
  return {
    ...connection,
    operationId: (step) => `${policy.intentId}:${step}`,
    createExecution: (resolveTarget) =>
      createExecutionClient({
        ...connection,
        maxBlockAge: policy.maxBlockAge,
        confirmations: policy.confirmations,
        ...(resolveTarget ? { resolveTarget } : {}),
      }),
    polling: policy.polling,
  };
}
