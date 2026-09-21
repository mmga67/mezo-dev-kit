import { createExecutionClient, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type { ExecutionTargetResolver, ExecutionObservation } from "@mezo-dev-kit/core";
import type { Connection } from "../setup.ts";

/** Observe a saved submission once. Use the owning writer separately to verify the protocol outcome. */
export async function observeSubmission(
  { network, registry, transport, signer, store }: Connection,
  savedRecord: unknown,
  policy: {
    readonly maxBlockAge: bigint;
    readonly confirmations: bigint;
    readonly resolveTarget?: ExecutionTargetResolver;
  },
): Promise<ExecutionObservation> {
  // Persisted JSON is untrusted input. The parser checks its version and exact-call fields.
  const record = parseSubmissionRecord(savedRecord);
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    ...policy,
  });
  // Observation checks transaction/receipt identity and canonicality. It never resubmits.
  const observation = await execution.observe(record);
  // Persist observation.record to retain its inclusion anchor across restarts. A confirmed
  // receipt still needs domain reconciliation, using preparation owned by that writer instance.
  return observation;
}
