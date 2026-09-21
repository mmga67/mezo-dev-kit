import { createNttRecoveryWriter } from "@mezo-dev-kit/bridges";
import type {
  NttRecoveryConfig,
  NttRecoveryInput,
  NttRecoveryOutcome,
} from "@mezo-dev-kit/bridges";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Supply an exact saved queue/message and, when needed, a real guardian attestation. */
export async function recoverNtt(
  runtime: ExampleRuntime,
  config: NttRecoveryConfig,
  input: NttRecoveryInput,
): Promise<NttRecoveryOutcome> {
  const writer = createNttRecoveryWriter(config);
  const prepared = await writer.prepare(input);
  const execution = prepared.sourceTransaction
    ? config.sourceExecution
    : config.destinationExecution;
  invariant(execution, "Configure execution for the chain hosting this recovery action");
  runtime.report("NTT recovery preparation", {
    kind: input.kind,
    sourceTransaction: prepared.sourceTransaction,
    digest: prepared.digest,
    sequence: prepared.sequence,
    recipient: prepared.recipient,
    amount: prepared.amount,
  });
  // Matching a VAA body is insufficient: exact transceiver simulation checks acceptance.
  const simulation = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulation);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  runtime.report("NTT recovery settlement", outcome);
  return outcome;
}
