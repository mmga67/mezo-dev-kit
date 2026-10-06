import { openPosition } from "./open-position.ts";
import { createBorrowingReader, createBorrowingWriter } from "@mezo-dev-kit/musd-borrowing";
import type {
  BorrowingAction,
  BorrowingBounds,
  BorrowingOutcome,
} from "@mezo-dev-kit/musd-borrowing";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Advanced composition: open, add collateral, repay and close. Each step requests consent. */
export async function borrowMusd(
  runtime: WorkflowConnection,
  input: {
    /** Native BTC base units, not a decimal display string. */
    readonly collateral: bigint;
    readonly additionalCollateral: bigint;
    /** MUSD base units. Fees and interest need extra wallet funding before closure. */
    readonly borrow: bigint;
    readonly repay: bigint;
    readonly bounds: BorrowingBounds;
  },
): Promise<Readonly<BorrowingOutcome>> {
  const reader = createBorrowingReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution();
  const writer = createBorrowingWriter({ reader, execution });
  const before = await reader.read({ account: runtime.account });
  invariant(
    before.position.status === "nonexistent",
    "This lifecycle requires an account without an existing trove",
  );

  async function perform(
    step: string,
    action: BorrowingAction,
  ): Promise<Readonly<BorrowingOutcome>> {
    // Current governed parameters, debt, price and mode are read for every action.
    const prepared = await writer.prepare({
      operationId: runtime.operationId(step),
      account: runtime.account,
      action,
      bounds: input.bounds,
      trials: 3n,
      seed: 42n,
    });
    const simulated = await writer.simulate(prepared);
    await runtime.review(simulated);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const { outcome } = await writer.reconcile(prepared, confirmed);
    // These policy bounds are checked before and after execution; some have no matching contract argument.
    invariant(
      outcome.boundsSatisfied,
      "Inspect the settled position before continuing outside policy",
    );
    return outcome;
  }

  await openPosition(
    runtime,
    {
      operationId: runtime.operationId("open"),
      bounds: input.bounds,
      collateral: input.collateral,
      borrow: input.borrow,
    },
    runtime.polling,
  );
  await perform("add-collateral", {
    kind: "add-collateral",
    collateral: input.additionalCollateral,
  });
  // BorrowerOperations burns MUSD directly: repayment does not need ERC-20 approval.
  await perform("repay", { kind: "repay", amount: input.repay });
  const closing = await reader.read({ account: runtime.account });
  invariant(
    closing.musdBalance >= closing.position.netDebt,
    "Closing needs enough MUSD for current net debt, including fees and interest",
  );
  const outcome = await perform("close", { kind: "close" });
  invariant(
    outcome.snapshot.position.status === "closed-by-owner",
    "Expected a fully closed position",
  );
  return outcome;
}
