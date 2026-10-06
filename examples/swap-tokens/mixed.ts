import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import type { CLSwapOutcome } from "@mezo-dev-kit/swaps";
import { parseUint } from "@mezo-dev-kit/evm";
import { swapTokens } from "./workflow.ts";
import { swapConcentratedLiquidity } from "./concentrated-liquidity.ts";
import { invariant } from "../runtime/validation.ts";

export interface MixedSwapCheckpoint {
  readonly status: "intermediate-held";
  readonly account: `0x${string}`;
  readonly firstOperationId: string;
  readonly intermediateToken: `0x${string}`;
  /** Decimal string for durable JSON; this is the reconciled output, not the quoted output. */
  readonly realizedAmount: string;
}

/** First transaction only. Persist actual custody before the user decides whether to continue. */
export async function startMixedSwap(
  connection: WorkflowConnection,
  input: Omit<Parameters<typeof swapTokens>[1], "step">,
  persist: (checkpoint: MixedSwapCheckpoint) => Promise<void>,
): Promise<MixedSwapCheckpoint> {
  const outcome = await swapTokens(connection, { ...input, step: "mixed-first" });
  const checkpoint: MixedSwapCheckpoint = {
    status: "intermediate-held",
    account: connection.account,
    firstOperationId: connection.operationId("mixed-first"),
    intermediateToken: input.tokenOut,
    realizedAmount: outcome.amountOut.toString(),
  };
  // Persistence failure does not undo the first swap. Recover its saved submission;
  // do not rerun this function to recreate a checkpoint.
  await persist(checkpoint);
  return checkpoint;
}

/**
 * A separate CL transaction, with a fresh quote and caller-chosen minimum.
 * Load a validated checkpoint from application storage. The application must
 * inspect any existing second-leg submission before invoking this continuation.
 */
export async function continueMixedSwap(
  connection: WorkflowConnection,
  checkpoint: MixedSwapCheckpoint,
  input: {
    readonly tokenOut: `0x${string}`;
    readonly tickSpacing: number;
    readonly minimumOutput: bigint;
  },
): Promise<Readonly<CLSwapOutcome>> {
  invariant(checkpoint.account === connection.account, "Checkpoint belongs to another account");
  invariant(
    checkpoint.firstOperationId === connection.operationId("mixed-first"),
    "Use the original persisted intent ID",
  );
  const amountIn = parseUint(checkpoint.realizedAmount);
  invariant(amountIn > 0n, "A reconciled intermediate amount is required");
  // No catch-and-resend: a timeout can mean submission is uncertain. The first
  // checkpoint stays available, but current custody must be observed again.
  return swapConcentratedLiquidity(connection, {
    route: [
      {
        tokenIn: checkpoint.intermediateToken,
        tokenOut: input.tokenOut,
        tickSpacing: input.tickSpacing,
      },
    ],
    intermediateAssets: [],
    amountIn,
    minimumOutput: input.minimumOutput,
    step: "mixed-second",
  });
}
