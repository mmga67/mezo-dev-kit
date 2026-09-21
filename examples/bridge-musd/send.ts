import { createExecutionClient } from "@mezo-dev-kit/core";
import type { RpcTransport } from "@mezo-dev-kit/core";
import {
  createNttTransferReader,
  createNttTransferWriter,
  createNttTokenTargetResolver,
} from "@mezo-dev-kit/bridges";
import type { NttTransferQuoteInput } from "@mezo-dev-kit/bridges";
import { createTokenReader, planApproval } from "@mezo-dev-kit/tokens";
import { parseHash32 } from "@mezo-dev-kit/evm";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";
import type { BridgeCheckpoint } from "./checkpoint.ts";

/** Send MUSD from Mezo to Ethereum and persist source identity for independent delivery observation. */
export async function sendMusd(
  { network, registry, transport, signer, store, account }: Connection,
  destinationTransport: RpcTransport,
  input: {
    readonly operationId: string;
    /** Precision used to convert the user's amount before preparing this transfer. */
    readonly expectedSourceDecimals: number;
    readonly quote: Omit<NttTransferQuoteInput, "account">;
  },
  persist: (checkpoint: BridgeCheckpoint) => Promise<void>,
  polling = confirmationPolicy,
): Promise<BridgeCheckpoint> {
  const routeId = "wormhole-ntt-musd-mezo-to-ethereum";
  // Each chain has its own RPC and block coordinate; destination access here is read-only.
  const reader = createNttTransferReader({
    routeId,
    sourceTransport: transport,
    destinationTransport,
  });
  const resolveTarget = createNttTokenTargetResolver({ routeId, sourceTransport: transport });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    resolveTarget,
    maxBlockAge: input.quote.maxSourceAgeBlocks,
    confirmations: 1n,
  });
  const writer = createNttTransferWriter({ reader, execution, sourceTransport: transport });
  const preparation = { operationId: input.operationId, quote: { ...input.quote, account } };
  let prepared = await writer.prepare(preparation);
  invariant(
    prepared.quote.source.decimals === input.expectedSourceDecimals,
    "Source token precision changed after amount conversion",
  );
  for (let attempt = 0; prepared.approval.required; attempt++) {
    invariant(attempt < 2, "NTT allowance changed repeatedly");
    // Derive the approval from verified NTT endpoints, including token precision and spender.
    const token = await createTokenReader({ transport }).read({
      target: {
        contractId: "bridge.musd-ntt-manager",
        address: prepared.approval.token,
        targetRole: "ntt-source-token",
      },
      account,
      spender: prepared.approval.spender,
      coordinate: prepared.quote.source.coordinate,
    });
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token,
        plan: planApproval({
          allowance: token.allowance,
          requiredAmount: prepared.approval.requiredAmount,
        }),
      },
      polling,
    );
    prepared = await writer.prepare(preparation);
    invariant(
      prepared.quote.source.decimals === input.expectedSourceDecimals,
      "Source token precision changed during approval",
    );
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(confirmed.hash, "Reconciled source transfer needs its transaction hash");
  const checkpoint = { sourceTransactionHash: parseHash32(confirmed.hash), outcome };
  // Persist before any destination polling. A source transfer can be queued or still in transit.
  // If this write fails, recover the source hash from the submission store before doing anything else.
  await persist(checkpoint);
  return checkpoint;
}
