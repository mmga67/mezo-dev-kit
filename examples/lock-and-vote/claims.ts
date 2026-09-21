import {
  createVotingReader,
  createVotingRewardReader,
  createVotingRewardWriter,
  createRebaseReader,
  createRebaseWriter,
} from "@mezo-dev-kit/incentives";
import type {
  VotingRewardReadInput,
  VotingRewardOutcome,
  RebaseOutcome,
} from "@mezo-dev-kit/incentives";
import type { VotingDomain } from "@mezo-dev-kit/contracts";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { minimumAfterSlippage } from "../runtime/bounds.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** Advanced entrypoint for an existing eligible NFT and explicitly selected reward tokens. */
export async function claimVotingRewards(
  runtime: ExampleRuntime,
  domain: VotingDomain,
  input: Omit<VotingRewardReadInput, "account" | "blockNumber">,
): Promise<Readonly<VotingRewardOutcome>> {
  const voting = createVotingReader({
    domain,
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const reader = createVotingRewardReader({ voting, transport: runtime.transport, maxEpochs: 4 });
  const request = { ...input, account: runtime.account };
  const snapshot = await reader.read(request);
  invariant(
    snapshot.tokens.some((token) => token.earned > 0n),
    "No claimable reward in the selected tokens and epoch budget",
  );
  const execution = runtime.createExecution();
  const writer = createVotingRewardWriter({ reader, execution, transport: runtime.transport });
  // Token order is part of the bound contract. Keep each minimum beside its token.
  const minAmounts = snapshot.tokens.map((token) =>
    token.earned === 0n ? 0n : minimumAfterSlippage(token.earned, 50n),
  );
  const prepared = await writer.prepare({
    ...request,
    operationId: runtime.operationId("claim-voting-rewards"),
    bounds: { minAmounts, maxBlockAge: 2n },
  });
  runtime.report(
    "Eligible voting rewards",
    snapshot.tokens.map((token, index) => ({
      token: token.token,
      earned: token.earned,
      epochs: token.epochs,
      minimum: minAmounts[index],
    })),
  );
  const simulation = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulation);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  runtime.report("Voting rewards paid", {
    tokens: input.tokens,
    paid: outcome.paid,
    boundsSatisfied: outcome.boundsSatisfied,
  });
  invariant(outcome.boundsSatisfied, "Voting reward settlement fell below the selected minima");
  return outcome;
}

/** veMEZO rebase accounting is independent of the pool-vote fee/bribe claim above. */
export async function claimRebase(
  runtime: ExampleRuntime,
  tokenId: bigint,
): Promise<Readonly<RebaseOutcome>> {
  const reader = createRebaseReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution();
  const writer = createRebaseWriter({ reader, execution, transport: runtime.transport });
  const preliminary = await writer.prepare({
    operationId: runtime.operationId("claim-rebase"),
    account: runtime.account,
    tokenId,
    bounds: { minAmount: 1n, maxBlockAge: 2n },
  });
  const prepared = await writer.prepare({
    operationId: runtime.operationId("claim-rebase"),
    account: runtime.account,
    tokenId,
    bounds: { minAmount: minimumAfterSlippage(preliminary.forecast.amount, 50n), maxBlockAge: 2n },
  });
  // The forecast explains whether the claim increases the lock or pays the wallet.
  // Inspect its bounded cursor progress; one claim need not cover all past epochs.
  runtime.report("Rebase forecast", prepared.forecast);
  const simulation = await writer.simulate(prepared);
  const submitted = await writer.submit(prepared, simulation);
  const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  runtime.report("Rebase settled", {
    ...outcome.forecast,
    boundsSatisfied: outcome.boundsSatisfied,
  });
  invariant(outcome.boundsSatisfied, "Rebase settlement fell below the selected minimum");
  return outcome;
}
