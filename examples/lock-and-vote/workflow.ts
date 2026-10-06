import {
  createLockReader,
  createLockTargetResolver,
  createLockWriter,
  createVotingReader,
  createVotingWriter,
} from "@mezo-dev-kit/incentives";
import type {
  LockBounds,
  LockOutcome,
  VotingAction,
  VotingBounds,
  VotingOutcome,
} from "@mezo-dev-kit/incentives";
import type { WorkflowConnection } from "../runtime/workflow-connection.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/**
 * Use the tokenId returned by createBtcLock. Voting and resetting are separate
 * user actions: real epoch gates apply, and this recipe never advances chain time.
 */
export async function voteWithLock(
  connection: WorkflowConnection,
  input: {
    readonly tokenId: bigint;
    readonly action: VotingAction;
    readonly bounds: VotingBounds;
    readonly step: string;
  },
): Promise<Readonly<VotingOutcome>> {
  const reader = createVotingReader({
    domain: "pools",
    networkId: "mezo-mainnet",
    registry: connection.registry,
    transport: connection.transport,
  });
  const execution = connection.createExecution();
  const writer = createVotingWriter({ reader, execution, transport: connection.transport });
  // The caller selects targets and relative weights. Preparation verifies current
  // liveness, ownership, power and voting eligibility; a failed gate stops here.
  const prepared = await writer.prepare({
    ...input,
    account: connection.account,
    operationId: connection.operationId(input.step),
  });
  const simulated = await writer.simulate(prepared);
  await connection.review(simulated);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, connection.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Inspect the settled vote before continuing outside policy");
  return outcome;
}

/** Call later, after actual expiry and any required vote reset. This does not wait for expiry. */
export async function withdrawExpiredLock(
  connection: WorkflowConnection,
  input: { readonly tokenId: bigint; readonly bounds: LockBounds },
): Promise<Readonly<LockOutcome>> {
  const reader = createLockReader({
    role: "vebtc-current",
    networkId: "mezo-mainnet",
    registry: connection.registry,
    transport: connection.transport,
  });
  const execution = connection.createExecution(
    createLockTargetResolver({ reader, account: connection.account }),
  );
  const writer = createLockWriter({ reader, execution, transport: connection.transport });
  const prepared = await writer.prepare({
    operationId: connection.operationId("withdraw-expired-lock"),
    account: connection.account,
    action: { kind: "withdraw", tokenId: input.tokenId },
    bounds: input.bounds,
  });
  const simulated = await writer.simulate(prepared);
  await connection.review(simulated);
  const submitted = await writer.submit(prepared, simulated);
  const confirmed = await waitForConfirmation(execution, submitted, connection.polling);
  const { outcome } = await writer.reconcile(prepared, confirmed);
  invariant(outcome.boundsSatisfied, "Inspect the settled withdrawal before continuing");
  return outcome;
}
