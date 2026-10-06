import { createNttRecoveryWriter } from "@mezo-dev-kit/bridges";
import type {
  NttRecoveryConfig,
  NttRecoveryInput,
  NttRecoveryOutcome,
} from "@mezo-dev-kit/bridges";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Supply an exact saved queue/message and, when needed, a real guardian attestation. */
export async function recoverNtt(
  runtime: WorkflowConnection,
  config: NttRecoveryConfig,
  input: NttRecoveryInput,
): Promise<NttRecoveryOutcome> {
  const writer = createNttRecoveryWriter(config);
  const prepared = await writer.prepare(input);
  const execution = prepared.sourceTransaction
    ? config.sourceExecution
    : config.destinationExecution;
  invariant(execution, "Configure execution for the chain hosting this recovery action");

  // Matching a VAA body is insufficient: exact transceiver simulation checks acceptance.
  const simulation = await writer.simulate(prepared);
  await runtime.review(simulation);
  const submitted = await writer.submit(prepared, simulation);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);

  return outcome;
}
