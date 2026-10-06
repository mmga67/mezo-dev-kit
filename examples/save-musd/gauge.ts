import {
  createGaugeReader,
  createGaugeTargetResolver,
  createGaugeWriter,
} from "@mezo-dev-kit/incentives";
import type { GaugeAction, GaugeOutcome, GaugeRole } from "@mezo-dev-kit/incentives";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { approveToken } from "../runtime/approval.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Gauge custody and rewards are owned by Incentives, separately from Savings/vault accounting. */
export async function gaugeOperation(
  runtime: WorkflowConnection,
  role: GaugeRole,
  step: string,
  action: GaugeAction,
): Promise<Readonly<GaugeOutcome>> {
  const reader = createGaugeReader({
    networkId: runtime.network.id,
    role,
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution(
    createGaugeTargetResolver({ reader, account: runtime.account }),
  );
  const writer = createGaugeWriter({ reader, execution });
  const input = {
    operationId: runtime.operationId(step),
    account: runtime.account,
    action,
    bounds: { maxBlockAge: 2n, minReward: 0n },
  };
  let prepared = await writer.prepare(input);
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "Gauge allowance changed repeatedly");
    await approveToken(
      runtime,
      execution,
      `${step}-approval-${attempt}`,
      prepared.token,
      prepared.approval,
    );
    prepared = await writer.prepare(input);
  }
  const simulated = await writer.simulate(prepared);
  await runtime.review(simulated);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const result = await writer.reconcile(prepared, confirmed);

  invariant(result.outcome.boundsSatisfied, "Inspect the gauge settlement before continuing");
  return result.outcome;
}
