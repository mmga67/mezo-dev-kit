import { createExecutionClient } from "@mezo-dev-kit/core";
import type { RpcTransport } from "@mezo-dev-kit/core";
import {
  createNativeCurrentDeliveryObserver,
  createNativeTokenTargetResolver,
  createNativeTransferReader,
  createNativeTransferWriter,
} from "@mezo-dev-kit/bridges";
import type {
  NativeCurrentObserverConfig,
  NativeDeliveryObservation,
  NativeObserveInput,
  NativeRouteId,
  NativeSourceOutcome,
  NativeTransferQuoteInput,
} from "@mezo-dev-kit/bridges";
import { createTokenReader, planApproval } from "@mezo-dev-kit/tokens";
import { parseHash32 } from "@mezo-dev-kit/evm";
import type { Hash32 } from "@mezo-dev-kit/evm";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Source checkpoint for independent observation; this never claims destination payment. */
export interface NativeCheckpoint {
  readonly sourceTransactionHash: Hash32;
  readonly outcome: NativeSourceOutcome;
}

/** Execute one explicitly requested Native source transfer with separate approval and durable identity. */
export async function sendNative(
  { network, registry, transport, signer, store, account }: Connection,
  destinationTransport: RpcTransport,
  input: {
    readonly routeId: NativeRouteId;
    readonly operationId: string;
    readonly expectedSourceDecimals: number;
    readonly quote: Omit<NativeTransferQuoteInput, "account">;
    /** Read web3_clientVersion through the same Mezo provider used by this route. */
    readonly getMezoClientVersion: () => Promise<unknown>;
  },
  persist: (checkpoint: NativeCheckpoint) => Promise<void>,
  polling = confirmationPolicy,
): Promise<NativeCheckpoint> {
  const config = {
    routeId: input.routeId,
    sourceTransport: transport,
    destinationTransport,
    getMezoClientVersion: input.getMezoClientVersion,
  };
  const reader = createNativeTransferReader(config);
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    resolveTarget: createNativeTokenTargetResolver(config),
    maxBlockAge: input.quote.maxSourceAgeBlocks,
    confirmations: 1n,
  });
  const writer = createNativeTransferWriter({ ...config, reader, execution });
  const preparation = { operationId: input.operationId, quote: { ...input.quote, account } };
  let prepared = await writer.prepare(preparation);
  invariant(
    prepared.quote.source.decimals === input.expectedSourceDecimals,
    "Source precision changed after amount conversion",
  );
  for (let attempt = 0; prepared.approval.required; attempt++) {
    invariant(attempt < 2, "Native allowance changed repeatedly");
    const token = await createTokenReader({ transport }).read({
      target: {
        contractId: prepared.quote.source.contractId,
        address: prepared.approval.token,
        targetRole: "native-source-token",
      },
      account,
      spender: prepared.approval.spender,
      coordinate: prepared.quote.source.coordinate,
    });
    // For BTC this EVM approval updates the native bank authorization.
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
      "Source precision changed during approval",
    );
  }
  const submitted = await writer.submit(prepared, await writer.simulate(prepared));
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(confirmed.hash, "Native source reconciliation requires a transaction hash");
  const checkpoint = { sourceTransactionHash: parseHash32(confirmed.hash), outcome };
  // If persistence fails, recover the existing Core submission; never resend the transfer.
  await persist(checkpoint);
  return checkpoint;
}

/** Observe supplied current-generation candidates, including explicit governance-recovery outcomes. */
export async function observeNative(
  config: NativeCurrentObserverConfig,
  input: NativeObserveInput,
): Promise<Readonly<NativeDeliveryObservation>> {
  return createNativeCurrentDeliveryObserver(config).observe(input);
}
