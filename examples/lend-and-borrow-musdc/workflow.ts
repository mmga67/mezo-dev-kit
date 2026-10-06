import { supplyMusdc } from "./supply.ts";
import { borrowMusdc } from "./borrow.ts";
import {
  createLendingRpcReader,
  createLendingWriter,
  createLendingTargetResolver,
} from "@mezo-dev-kit/musdc-lending";
import type { LendingAction, LendingOutcome } from "@mezo-dev-kit/musdc-lending";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { approveToken } from "../runtime/approval.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Choose a supplier or borrower lifecycle for the verified BTC/mUSDC market. */
export async function lendAndBorrowMusdc(
  runtime: WorkflowConnection,
  input: {
    readonly role: "supplier" | "borrower";
    /** mUSDC loan-token base units. The market reader resolves its token identity. */
    readonly loanAmount: bigint;
    /** BTC market collateral-token base units; used only by the borrower path. */
    readonly collateralAmount: bigint;
  },
): Promise<Readonly<LendingOutcome>> {
  const reader = createLendingRpcReader({
    networkId: runtime.network.id,
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution(
    createLendingTargetResolver({ reader, account: runtime.account, maxPriceAgeSeconds: 300n }),
  );
  const writer = createLendingWriter({
    reader,
    registry: runtime.registry,
    transport: runtime.transport,
    execution,
  });
  const { loanAmount, collateralAmount } = input;
  const before = await reader.read({ account: runtime.account, maxPriceAgeSeconds: 300n });
  invariant(before.position.status === "available", "Position read unavailable");
  invariant(
    before.position.value.supplyShares.baseUnits === 0n &&
      before.position.value.borrowShares.baseUnits === 0n &&
      before.position.value.collateral.baseUnits === 0n,
    "Use an empty market position for this lifecycle",
  );

  async function perform(step: string, action: LendingAction): Promise<Readonly<LendingOutcome>> {
    // Bounds use the action's asset units. Collateral calls do not create supply/borrow shares.
    const collateralAction =
      action.kind === "supply-collateral" || action.kind === "withdraw-collateral";
    const bounds = {
      maxBlockAge: 2n,
      maxPriceAgeSeconds: 300n,
      maxAssets: collateralAction ? collateralAmount : loanAmount * 2n,
      minAssets: 1n,
      maxShares: 10n ** 30n,
      minShares: collateralAction ? 0n : 1n,
      minBorrowHeadroom: 0n,
    };
    if (
      action.kind === "supply" &&
      "assets" in action.quantity &&
      action.quantity.assets !== undefined
    )
      return supplyMusdc(
        runtime,
        { operationId: runtime.operationId(step), assets: action.quantity.assets, bounds },
        runtime.polling,
      );
    if (
      action.kind === "borrow" &&
      "assets" in action.quantity &&
      action.quantity.assets !== undefined
    )
      return borrowMusdc(
        runtime,
        { operationId: runtime.operationId(step), assets: action.quantity.assets, bounds },
        runtime.polling,
      );
    const preparation = {
      operationId: runtime.operationId(step),
      account: runtime.account,
      action,
      bounds,
    };
    let prepared = await writer.prepare(preparation);

    for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
      invariant(attempt < 2, "Market allowance changed repeatedly");
      await approveToken(
        runtime,
        execution,
        `${step}-approval-${attempt}`,
        prepared.token,
        prepared.approval,
      );
      prepared = await writer.prepare(preparation);
    }
    const simulated = await writer.simulate(prepared);
    await runtime.review(simulated);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const result = await writer.reconcile(prepared, confirmed);

    invariant(
      result.outcome.boundsSatisfied,
      "Inspect market settlement outside the requested bounds",
    );
    return result.outcome;
  }

  if (input.role === "supplier") {
    const supplied = await perform("supply", { kind: "supply", quantity: { assets: loanAmount } });
    invariant(supplied.snapshot.position.status === "available", "Supply position unavailable");
    // Redeem the actual shares, rather than assuming original assets equal the current balance.
    const exited = await perform("withdraw-all", {
      kind: "withdraw",
      quantity: { shares: supplied.snapshot.position.value.supplyShares.baseUnits },
    });
    invariant(
      exited.snapshot.position.status === "available" &&
        exited.snapshot.position.value.supplyShares.baseUnits === 0n,
      "Supplier exit left market shares",
    );
    return exited;
  }
  await perform("supply-collateral", { kind: "supply-collateral", assets: collateralAmount });
  await perform("borrow", { kind: "borrow", quantity: { assets: loanAmount } });
  const debt = await reader.read({ account: runtime.account, maxPriceAgeSeconds: 300n });
  invariant(debt.position.status === "available", "Borrow shares unavailable");
  // Repaying all borrow shares accounts for accrued interest and upward asset rounding.
  await perform("repay-all", {
    kind: "repay",
    quantity: { shares: debt.position.value.borrowShares.baseUnits },
  });
  const exited = await perform("withdraw-collateral", {
    kind: "withdraw-collateral",
    assets: collateralAmount,
  });
  invariant(
    exited.snapshot.position.status === "available" &&
      exited.snapshot.position.value.borrowShares.baseUnits === 0n &&
      exited.snapshot.position.value.collateral.baseUnits === 0n,
    "Borrower exit left debt or collateral",
  );
  return exited;
}
