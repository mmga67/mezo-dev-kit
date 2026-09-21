import { createExecutionClient } from "@mezo-dev-kit/core";
import { createRedemptionReader, createRedemptionWriter } from "@mezo-dev-kit/musd-redemptions";
import type {
  RedemptionBounds,
  RedemptionOutputSimulator,
  RedemptionOutcome,
  RedemptionQuoteInput,
} from "@mezo-dev-kit/musd-redemptions";
import type { Connection } from "../setup.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Redeem with explicit MUSD/BTC output bounds and a provider-backed exact-output simulator. */
export async function redeemCollateral(
  { network, registry, transport, signer, store, account }: Connection,
  simulator: RedemptionOutputSimulator,
  input: {
    readonly operationId: string;
    readonly quote: Omit<RedemptionQuoteInput, "account">;
    readonly bounds: RedemptionBounds;
  },
  polling = confirmationPolicy,
): Promise<Readonly<RedemptionOutcome>> {
  const reader = createRedemptionReader({ networkId: "mezo-mainnet", registry, transport });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    maxBlockAge: input.bounds.maxBlockAge,
    confirmations: 1n,
  });
  // This operation returns no useful eth_call output. The injected simulator must
  // recover the exact call's Redemption event to establish actual MUSD/BTC amounts.
  const writer = createRedemptionWriter({ reader, execution, simulator, transport });
  const prepared = await writer.prepare({
    operationId: input.operationId,
    quote: { ...input.quote, account },
    bounds: input.bounds,
  });
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  // The queue can produce a partial fill. Inspect actual burned MUSD and net BTC, not requested MUSD alone.
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Redemption settled outside the requested output bounds");
  return outcome;
}
