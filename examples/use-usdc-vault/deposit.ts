import { createExecutionClient } from "@mezo-dev-kit/core";
import {
  createVaultRpcReader,
  createVaultTargetResolver,
  createVaultWriter,
} from "@mezo-dev-kit/usdc-lending-vault";
import type { VaultBounds, VaultOutcome } from "@mezo-dev-kit/usdc-lending-vault";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Deposit underlying asset base units. minOutput bounds minted vault shares, not assets. */
export async function depositIntoVault(
  { network, registry, transport, signer, store, account }: Connection,
  input: { readonly operationId: string; readonly assets: bigint; readonly bounds: VaultBounds },
  polling = confirmationPolicy,
): Promise<Readonly<VaultOutcome>> {
  const reader = createVaultRpcReader({ networkId: network.id, registry, transport });
  const resolveTarget = createVaultTargetResolver({
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
  const writer = createVaultWriter({ reader, registry, transport, execution });
  const preparation = {
    operationId: input.operationId,
    account,
    action: { kind: "deposit" as const, assets: input.assets },
    bounds: input.bounds,
  };
  let prepared = await writer.prepare(preparation);
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "Vault allowance changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: prepared.token,
        plan: prepared.approval,
      },
      polling,
    );
    // Share conversion may change while approval is mined; retain the user's minimum.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Vault deposit settled outside the requested bounds");
  // Wrapping or staking these shares is a separate operation with different custody.
  return outcome;
}
