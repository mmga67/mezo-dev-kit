import { addLiquidity } from "./add.ts";
import {
  createBasicPoolReader,
  createBasicPoolTargetResolver,
  createBasicLiquidityWriter,
  createBasicPoolFeeWriter,
  forecastBasicLiquidity,
} from "@mezo-dev-kit/pools";
import type {
  BasicLiquidityAction,
  BasicPoolKey,
  BasicPoolSnapshot,
  BasicPoolFeeOutcome,
} from "@mezo-dev-kit/pools";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { approveToken } from "../runtime/approval.ts";
import { minimumAfterSlippage } from "../runtime/bounds.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Add LP liquidity, exit, then collect any fees already earned. No fee generation is assumed. */
export async function provideBasicLiquidity(
  runtime: WorkflowConnection,
  key: BasicPoolKey,
  input: {
    readonly amount0: bigint;
    readonly amount1: bigint;
    readonly slippageBps: bigint;
    readonly deadlineSeconds: bigint;
  },
): Promise<Readonly<BasicPoolFeeOutcome>> {
  const reader = createBasicPoolReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution(
    createBasicPoolTargetResolver({ reader, key, account: runtime.account }),
  );
  const writer = createBasicLiquidityWriter({ reader, execution });
  const before = await reader.read({ key, account: runtime.account });
  invariant(
    before.lp.balance === 0n,
    "Use an account without existing LP shares for the exit demonstration",
  );

  async function perform(
    step: string,
    action: BasicLiquidityAction,
  ): Promise<Readonly<BasicPoolSnapshot>> {
    const snapshot = await reader.read({ key, account: runtime.account });
    const timeBounds = {
      deadline: snapshot.timestamp + input.deadlineSeconds,
      maxDeadlineSeconds: input.deadlineSeconds,
      maxBlockAge: 2n,
    };
    // Derive user minimums from the public forecast; the preliminary one-unit
    // thresholds below are used only for calculation, never for submission.
    const estimate = forecastBasicLiquidity(snapshot, action, {
      ...timeBounds,
      minAmount0: 1n,
      minAmount1: 1n,
      minLiquidity: action.kind === "add" ? 1n : 0n,
    });
    const bounds = {
      ...timeBounds,
      minAmount0: minimumAfterSlippage(estimate.amount0, input.slippageBps),
      minAmount1: minimumAfterSlippage(estimate.amount1, input.slippageBps),
      minLiquidity:
        action.kind === "add" ? minimumAfterSlippage(estimate.liquidity, input.slippageBps) : 0n,
    };
    if (action.kind === "add") {
      const result = await addLiquidity(
        runtime,
        { operationId: runtime.operationId(step), key, ...action, bounds },
        runtime.polling,
      );

      return result.snapshot;
    }
    const preparation = {
      operationId: runtime.operationId(step),
      key,
      account: runtime.account,
      action,
      bounds,
    };
    let prepared = await writer.prepare(preparation);
    for (let attempt = 0; ; attempt++) {
      const approval = prepared.approvals.find((entry) => entry.plan.kind !== "sufficient");
      if (!approval) break;
      invariant(attempt < 4, "Token allowances kept changing; inspect the wallet");
      await approveToken(
        runtime,
        execution,
        `${step}-approval-${attempt}`,
        approval.token,
        approval.plan,
      );
      prepared = await writer.prepare(preparation);
    }

    const simulated = await writer.simulate(prepared);
    await runtime.review(simulated);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const result = await writer.reconcile(prepared, confirmed);

    return result.outcome.snapshot;
  }

  // Sorting a pair changes token0/token1. Read each precision after discovery.
  const added = await perform("add-liquidity", {
    kind: "add",
    amount0Desired: input.amount0,
    amount1Desired: input.amount1,
  });
  const partial = await perform("remove-half", {
    kind: "remove",
    liquidity: added.lp.balance / 2n,
  });
  const exited = await perform("remove-rest", { kind: "remove", liquidity: partial.lp.balance });
  invariant(exited.lp.balance === 0n, "LP exit must leave no wallet shares");

  // Wallet fees can remain claimable after all LP tokens have been removed.
  const fees = createBasicPoolFeeWriter({ reader, execution });
  const prepared = await fees.prepare({
    operationId: runtime.operationId("claim-lp-fees"),
    key,
    account: runtime.account,
    bounds: { minAmount0: 0n, minAmount1: 0n, maxBlockAge: 2n },
  });
  const simulated = await fees.simulate(prepared);
  await runtime.review(simulated);
  const submitted = await fees.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const result = await fees.reconcile(prepared, confirmed);
  // A zero fee outcome is valid when no fees accrued during ownership.

  return result.outcome;
}
