import { redeemCollateral } from "./redeem.ts";
import {
  createRedemptionReader,
  createRedemptionWriter,
  createRedemptionTraceSimulator,
} from "@mezo-dev-kit/musd-redemptions";
import type { RedemptionOutcome } from "@mezo-dev-kit/musd-redemptions";
import type { RpcRequest } from "@mezo-dev-kit/core";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { minimumAfterSlippage } from "../runtime/bounds.ts";

import { invariant } from "../runtime/validation.ts";

/** Exchange MUSD for collateral from the ordered trove queue, with bounded discovery. */
export async function redeemMusd(
  runtime: WorkflowConnection,
  request: RpcRequest,
  input: {
    readonly requestedAmount: bigint;
    readonly maxRedemptionRate: bigint;
    readonly slippageBps: bigint;
  },
): Promise<Readonly<RedemptionOutcome>> {
  const reader = createRedemptionReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const quoteInput = {
    account: runtime.account,
    requestedAmount: input.requestedAmount,
    amountMode: "truncate" as const,
    maxIterations: 10n,
    maxTailScan: 32,
    trials: 3n,
    seed: 42n,
  };
  const execution = runtime.createExecution();
  const simulator = createRedemptionTraceSimulator({
    request,
    transport: runtime.transport,
    providerId: runtime.transport.id,
    timeoutMs: 30000,
    maxFrames: 1024,
    maxLogs: 1024,
    maxDepth: 64,
    maxDataBytes: 262144,
  });
  const writer = createRedemptionWriter({
    reader,
    execution,
    simulator,
    transport: runtime.transport,
  });
  // The trace must expose the Redemption event from the exact call. A successful
  // eth_call with empty return data cannot establish the collateral output.
  const preliminary = await writer.prepare({
    operationId: runtime.operationId("redeem"),
    quote: quoteInput,
    bounds: {
      minActualAmount: 1n,
      minNetCollateral: 1n,
      maxRedemptionRate: input.maxRedemptionRate,
      maxBlockAge: 2n,
    },
  });
  const preview = await writer.simulate(preliminary);
  const estimated = await simulator.simulate({
    call: preview.call,
    coordinate: preview.prepared.coordinate,
  });
  const redemptionInput = {
    operationId: runtime.operationId("redeem"),
    quote: quoteInput,
    bounds: {
      ...preliminary.bounds,
      minActualAmount: minimumAfterSlippage(estimated.actualAmount, input.slippageBps),
      minNetCollateral: minimumAfterSlippage(estimated.netCollateral, input.slippageBps),
    },
  };

  // TroveManager burns MUSD directly; this action has no token approval.
  const outcome = await redeemCollateral(runtime, simulator, redemptionInput, runtime.polling);

  invariant(
    outcome.boundsSatisfied,
    "Redemption settled outside bounds; do not automatically redeem again",
  );
  return outcome;
}
