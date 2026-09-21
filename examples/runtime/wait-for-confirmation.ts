import type { ExecutionClient, SubmissionRecord } from "@mezo-dev-kit/core";

/** Timeout leaves a trackable submission; it never retries a value-bearing call. */
export async function waitForConfirmation(
  execution: Pick<ExecutionClient, "observe">,
  record: SubmissionRecord,
  policy: { readonly attempts: number; readonly pause: () => Promise<void> },
): Promise<SubmissionRecord> {
  if (!Number.isSafeInteger(policy.attempts) || policy.attempts < 1 || policy.attempts > 120)
    throw new TypeError("Confirmation attempts must be 1–120");
  let current = record;
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    const observation = await execution.observe(current);
    current = observation.record;
    switch (observation.state) {
      case "confirmed":
        return current;
      case "execution-reverted":
        throw new Error(`Execution reverted: ${current.operationId}`);
      case "submission-uncertain":
        throw new Error(`Recover the reserved hash/nonce: ${current.operationId}`);
      case "reorged":
        throw new Error(`Recheck the inclusion anchor: ${current.operationId}`);
      case "included":
      case "submitted":
        break;
    }
    if (attempt + 1 < policy.attempts) await policy.pause();
  }
  throw new Error(`Confirmation pending; resume observation of ${current.operationId}`);
}
