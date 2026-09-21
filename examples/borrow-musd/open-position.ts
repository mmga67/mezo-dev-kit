import { createExecutionClient } from "@mezo-dev-kit/core";
import { createBorrowingReader, createBorrowingWriter } from "@mezo-dev-kit/musd-borrowing";
import type { BorrowingBounds, BorrowingOutcome } from "@mezo-dev-kit/musd-borrowing";
import type { Connection } from "../setup.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Open one position. Collateral is native BTC base units; borrowing and maxFee use MUSD base units. */
export async function openPosition(
  { network, registry, transport, signer, store, account }: Connection,
  input: {
    readonly operationId: string;
    readonly collateral: bigint;
    readonly borrow: bigint;
    readonly bounds: BorrowingBounds;
  },
  polling = confirmationPolicy,
): Promise<Readonly<BorrowingOutcome>> {
  const reader = createBorrowingReader({ networkId: "mezo-mainnet", registry, transport });
  // Core owns signing and submission tracking. These policies are explicit application choices.
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    maxBlockAge: input.bounds.maxBlockAge,
    confirmations: 1n,
  });
  const writer = createBorrowingWriter({ reader, execution });
  // Preparation reads current debt, price and system mode and finds bounded sorted-list hints.
  const prepared = await writer.prepare({
    operationId: input.operationId,
    account,
    action: { kind: "open", collateral: input.collateral, borrow: input.borrow },
    bounds: input.bounds,
    trials: 3n,
    seed: 42n,
  });
  // Simulation checks this exact call; it does not sign or submit it.
  const simulated = await writer.simulate(prepared);
  // Submission reserves the operation/nonce in the supplied store before asking the signer.
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  // Fee and risk policy must also be checked against the actual protocol outcome.
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Position settled outside the requested borrowing bounds");
  return outcome;
}
