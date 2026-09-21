import { createExecutionClient } from "@mezo-dev-kit/core";
import {
  createLendingRpcReader,
  createLendingTargetResolver,
  createLendingWriter,
} from "@mezo-dev-kit/musdc-lending";
import type { LendingBounds, LendingOutcome } from "@mezo-dev-kit/musdc-lending";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Supply loan-token base units and return actual assets and supply shares. */
export async function supplyMusdc(
  { network, registry, transport, signer, store, account }: Connection,
  input: { readonly operationId: string; readonly assets: bigint; readonly bounds: LendingBounds },
  polling = confirmationPolicy,
): Promise<Readonly<LendingOutcome>> {
  const reader = createLendingRpcReader({ networkId: network.id, registry, transport });
  // Market token addresses are discovered through the registered protocol root.
  // The resolver lets Core verify that an approval/action targets that same market.
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
  const preparation = {
    operationId: input.operationId,
    account,
    action: { kind: "supply" as const, quantity: { assets: input.assets } },
    bounds: input.bounds,
  };
  let prepared = await writer.prepare(preparation);
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "Market allowance changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: prepared.token,
        plan: prepared.approval,
      },
      polling,
    );
    // Refresh the market and allowance after each confirmed approval; keep caller bounds.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  // Shares have their own units and rounding; use actual settlement when later withdrawing.
  invariant(outcome.boundsSatisfied, "Supply settled outside the requested asset/share bounds");
  return outcome;
}
