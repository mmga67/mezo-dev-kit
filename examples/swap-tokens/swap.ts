import { createExecutionClient } from "@mezo-dev-kit/core";
import { createBasicPoolReader, createBasicPoolTargetResolver } from "@mezo-dev-kit/pools";
import { createBasicSwapReader, createBasicSwapWriter } from "@mezo-dev-kit/swaps";
import type { BasicSwapBounds, BasicSwapOutcome, BasicSwapQuoteInput } from "@mezo-dev-kit/swaps";
import type { Connection } from "../setup.ts";
import { approveTokenAmount } from "../tokens/approve.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { confirmationPolicy } from "../runtime/confirmation-policy.ts";
import { invariant } from "../runtime/validation.ts";

/** Execute one caller-selected route. amountIn and amountOutMinimum use their respective token base units. */
export async function swapExactInput(
  { network, registry, transport, signer, store, account }: Connection,
  input: {
    readonly operationId: string;
    readonly quote: Omit<BasicSwapQuoteInput, "account">;
    readonly bounds: BasicSwapBounds;
  },
  polling = confirmationPolicy,
): Promise<Readonly<BasicSwapOutcome>> {
  const config = { networkId: "mezo-mainnet", registry, transport } as const;
  const pools = createBasicPoolReader(config);
  const reader = createBasicSwapReader({ ...config, pools });
  const quote = { ...input.quote, account };
  // The reader quotes supplied hops. Comparing alternative routes is a separate example.
  const observed = await reader.quote(quote);
  const firstPool = observed.pools[0];
  invariant(firstPool, "The selected route has no verified pool");
  const resolveTarget = createBasicPoolTargetResolver({
    reader: pools,
    key: firstPool.key,
    account,
  });
  const execution = createExecutionClient({
    network,
    registry,
    transport,
    signer,
    store,
    resolveTarget,
    maxBlockAge: quote.maxAgeBlocks,
    confirmations: 1n,
  });
  const writer = createBasicSwapWriter({ reader, pools, execution });
  const preparation = { operationId: input.operationId, quote, bounds: input.bounds };
  let prepared = await writer.prepare(preparation);
  for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
    invariant(attempt < 2, "Swap allowance changed repeatedly");
    await approveTokenAmount(
      { transport, execution },
      {
        operationId: `${input.operationId}:approval:${attempt}`,
        token: prepared.quote.inputToken,
        plan: prepared.approval,
      },
      polling,
    );
    // Preserve the original output minimum and deadline while refreshing the quote.
    prepared = await writer.prepare(preparation);
  }
  const simulated = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, polling);
  // The writer verifies hop events and actual wallet output, including the requested minimum.
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(
    outcome.amountOut >= input.bounds.amountOutMinimum,
    "Swap settled below the requested output minimum",
  );
  return outcome;
}
