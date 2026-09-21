import { createExecutionClient } from "@mezo-dev-kit/core";
import {
  createLendingRpcReader,
  createLendingTargetResolver,
  createLendingWriter,
} from "@mezo-dev-kit/musdc-lending";
import type { LendingBounds, LendingOutcome } from "@mezo-dev-kit/musdc-lending";
import type { Connection } from "../setup.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Borrow loan-token base units against an existing collateralized market position. */
export async function borrowMusdc(
  { network, registry, transport, signer, store, account }: Connection,
  input: { readonly operationId: string; readonly assets: bigint; readonly bounds: LendingBounds },
  polling = confirmationPolicy,
): Promise<Readonly<LendingOutcome>> {
  const reader = createLendingRpcReader({ networkId: network.id, registry, transport });
  const resolveTarget = createLendingTargetResolver({
    reader,
    account,
    maxPriceAgeSeconds: input.bounds.maxPriceAgeSeconds,
  });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    resolveTarget,
    maxBlockAge: input.bounds.maxBlockAge,
    confirmations: 1n,
  });
  const writer = createLendingWriter({ reader, registry, transport, execution });
  // Preparation checks collateral, oracle freshness, liquidity and resulting borrowing headroom.
  const prepared = await writer.prepare({
    operationId: input.operationId,
    account,
    action: { kind: "borrow", quantity: { assets: input.assets } },
    bounds: input.bounds,
  });
  // Borrowing sends loan tokens to the account. Supplying collateral is a separate prior operation.
  invariant(
    prepared.approval.kind === "sufficient",
    "Borrowing unexpectedly requested a token approval",
  );
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Borrowing settled outside the requested debt/health bounds");
  // Retain debt shares as well as assets: future repayment must account for accrued interest.
  return outcome;
}
