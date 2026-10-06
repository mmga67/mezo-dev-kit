import { createCLPoolReader } from "@mezo-dev-kit/pools";
import {
  createCLSwapReader,
  createCLSwapTargetResolver,
  createCLSwapWriter,
} from "@mezo-dev-kit/swaps";
import type { CLSwapHop, CLSwapOutcome } from "@mezo-dev-kit/swaps";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { approveToken } from "../runtime/approval.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** One transaction for a bounded CL route; each intermediate asset is explicitly authorized. */
export async function swapConcentratedLiquidity(
  runtime: WorkflowConnection,
  input: {
    readonly route: readonly CLSwapHop[];
    readonly intermediateAssets: readonly `0x${string}`[];
    readonly amountIn: bigint;
    readonly minimumOutput: bigint;
    readonly step?: string;
  },
): Promise<Readonly<CLSwapOutcome>> {
  const config = {
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  } as const;
  const pools = createCLPoolReader(config);
  const reader = createCLSwapReader({ ...config, pools });
  const quoteInput = {
    route: input.route,
    intermediateAssets: input.intermediateAssets,
    account: runtime.account,
    amountIn: input.amountIn,
    maxAgeBlocks: 2n,
    budget: { maxSteps: 64, maxBitmapWords: 16, maxCrossedTicks: 16 },
  };
  const quote = await reader.quote(quoteInput);
  const execution = runtime.createExecution(
    createCLSwapTargetResolver({ reader, input: quoteInput }),
  );
  const writer = createCLSwapWriter({ reader, pools, execution, transport: runtime.transport });
  const step = input.step ?? "cl-swap";
  const preparation = {
    ...quoteInput,
    operationId: runtime.operationId(step),
    bounds: {
      minAmountOut: input.minimumOutput,
      deadline: quote.timestamp + 300n,
      maxDeadlineSeconds: 300n,
      maxBlockAge: 2n,
    },
  };
  // A traversal-budget failure stops quotation; a partial route is never sent.
  let prepared = await writer.prepare(preparation);
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "CL approval did not converge");
    await approveToken(
      runtime,
      execution,
      `${step}-approval-${attempt}`,
      prepared.quote.inputToken,
      prepared.approval,
    );
    prepared = await writer.prepare(preparation);
  }

  const simulation = await writer.simulate(prepared);
  await runtime.review(simulation);
  const submitted = await writer.submit(prepared, simulation);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);

  invariant(outcome.boundsSatisfied, "CL output settled outside policy");
  return outcome;
}
