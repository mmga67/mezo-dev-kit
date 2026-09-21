import type { ExecutionClient, ExecutionTargetResolver } from "@mezo-dev-kit/core";
import type { Connection } from "../setup.ts";
import type { Report } from "./output.ts";

/**
 * Convenience wiring for the composed lifecycle demonstrations. This belongs to
 * examples, not the SDK. Start with setup.ts and the focused action files before
 * following the local runner. Prepared/submitted objects hold transaction state;
 * this runtime holds reusable connections and application policies.
 */
export interface ExampleRuntime extends Connection {
  /** A unique run prefix plus a descriptive step; resume observation using its saved submission record. */
  readonly operationId: (step: string) => string;
  /** Each client shares the signer/store. Dynamic destinations need their domain resolver. */
  readonly createExecution: (resolveTarget?: ExecutionTargetResolver) => ExecutionClient;
  /** Bounded observation, separate from the number of blocks required for confirmation. */
  readonly polling: { readonly attempts: number; readonly pause: () => Promise<void> };
  /** CLI presentation only; focused operations return their domain outcome to the caller. */
  readonly report: Report;
}
