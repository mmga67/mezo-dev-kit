import { depositMusd } from "./deposit.ts";
import { createSavingsRpcReader, createSavingsWriter } from "@mezo-dev-kit/musd-savings";
import type { SavingsAction, SavingsOutcome } from "@mezo-dev-kit/musd-savings";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { approveToken } from "../runtime/approval.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";
import { gaugeOperation } from "./gauge.ts";

/** Enter Savings, optionally stake receipts, claim available yield and withdraw the principal. */
export async function saveMusd(
  runtime: WorkflowConnection,
  options: {
    readonly stake?: boolean;
    /** MUSD base units chosen by the application. */
    readonly amount: bigint;
  },
): Promise<Readonly<SavingsOutcome>> {
  const reader = createSavingsRpcReader({
    networkId: runtime.network.id,
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution();
  const writer = createSavingsWriter({
    reader,
    registry: runtime.registry,
    transport: runtime.transport,
    execution,
  });
  const snapshot = await reader.read({ account: runtime.account });
  invariant(
    snapshot.wallet.status === "available" &&
      snapshot.wallet.value.principalReceipts.baseUnits === 0n &&
      snapshot.beneficialPrincipal.status === "available" &&
      snapshot.beneficialPrincipal.value.baseUnits === 0n,
    "Use an account with no wallet or staked Savings principal for the full exit demonstration",
  );
  const amount = options.amount;

  async function perform(step: string, action: SavingsAction): Promise<Readonly<SavingsOutcome>> {
    const input = {
      operationId: runtime.operationId(step),
      account: runtime.account,
      action,
      bounds: { maxBlockAge: 2n, minYield: action.kind === "claim-yield" ? 1n : 0n },
    };
    let prepared = await writer.prepare(input);
    for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
      invariant(attempt < 2, "Savings allowance changed repeatedly");
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
    invariant(result.outcome.boundsSatisfied, "Inspect the settled yield before continuing");
    return result.outcome;
  }

  await depositMusd(
    runtime,
    {
      operationId: runtime.operationId("deposit"),
      amount,
      bounds: { maxBlockAge: 2n, minYield: 0n },
    },
    runtime.polling,
  );
  if (options.stake) {
    // Staking moves sMUSD into gauge custody; it does not create another principal deposit.
    await gaugeOperation(runtime, "savings-gauge", "stake-savings", { kind: "stake", amount });
    await gaugeOperation(runtime, "savings-gauge", "claim-gauge-rewards", { kind: "claim-reward" });
    await gaugeOperation(runtime, "savings-gauge", "unstake-savings", { kind: "unstake", amount });
  }
  const earned = await reader.read({ account: runtime.account });
  invariant(earned.wallet.status === "available", "Savings wallet data unavailable");
  // Principal receipts and indexed MUSD yield are separate. An empty claim is not an error to hide.
  if (earned.wallet.value.yield.claimable.baseUnits > 0n)
    await perform("claim-yield", { kind: "claim-yield" });
  const result = await perform("withdraw", { kind: "withdraw", amount });
  invariant(
    result.snapshot.wallet.status === "available" &&
      result.snapshot.wallet.value.principalReceipts.baseUnits === 0n,
    "Savings exit left wallet principal receipts",
  );
  return result;
}
