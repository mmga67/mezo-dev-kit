import { createBtcLock } from "./create-lock.ts";
import {
  calculateVotingEpoch,
  createLockReader,
  createLockTargetResolver,
  createLockWriter,
  createVotingReader,
  createVotingWriter,
} from "@mezo-dev-kit/incentives";
import type { LockAction, LockOutcome, VotingAction } from "@mezo-dev-kit/incentives";
import { createAbiCodec, parseAddress, parseUnitsExact, parseUint } from "@mezo-dev-kit/evm";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { approveToken } from "../runtime/approval.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";

/** A veBTC lock votes on pool incentives. Clock advancement is an explicit local fixture port. */
export async function lockAndVote(
  runtime: ExampleRuntime,
  advanceTo: (timestamp: bigint) => Promise<void>,
): Promise<Readonly<LockOutcome>> {
  const reader = createLockReader({
    role: "vebtc-current",
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution(
    createLockTargetResolver({ reader, account: runtime.account }),
  );
  const writer = createLockWriter({ reader, execution, transport: runtime.transport });
  const initial = await reader.read({ account: runtime.account, tokenIds: [] });
  invariant(initial.ownedCount === 0n, "Use an account without existing locks for this example");
  const amount = parseUnitsExact("0.1", Number(initial.token.decimals));
  async function lock(step: string, action: LockAction): Promise<Readonly<LockOutcome>> {
    const snapshot = await reader.read({
      account: runtime.account,
      tokenIds: action.kind === "create" ? [] : [action.tokenId],
    });
    const input = {
      operationId: runtime.operationId(step),
      account: runtime.account,
      action,
      bounds: {
        minLockedAmount: action.kind === "withdraw" ? 0n : amount,
        minUnboostedPower: 0n,
        maxLockEnd: snapshot.timestamp + snapshot.maxLockSeconds,
        maxBlockAge: 2n,
      },
    };
    if (action.kind === "create")
      return createBtcLock(
        runtime,
        {
          operationId: input.operationId,
          amount: action.amount,
          duration: action.duration,
          bounds: input.bounds,
        },
        runtime.polling,
      );
    let prepared = await writer.prepare(input);
    for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
      invariant(attempt < 2, "Lock approval did not converge");
      await approveToken(
        runtime,
        execution,
        `${step}-approval-${attempt}`,
        prepared.snapshot.token,
        prepared.approval,
      );
      prepared = await writer.prepare(input);
    }
    const simulation = await writer.simulate(prepared);
    const submitted = await writer.submit(prepared, simulation);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const { outcome } = await writer.reconcile(prepared, confirmed);
    runtime.report(step, {
      tokenId: outcome.tokenId,
      ...outcome.forecast,
      boundsSatisfied: outcome.boundsSatisfied,
    });
    invariant(outcome.boundsSatisfied, "Lock settled outside policy");
    return outcome;
  }
  const created = await lock("create-lock", {
    kind: "create",
    amount,
    duration: 28n * 24n * 60n * 60n,
  });
  const tokenId = created.tokenId;
  const voting = createVotingReader({
    domain: "pools",
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const votingExecution = runtime.createExecution();
  const votes = createVotingWriter({
    reader: voting,
    execution: votingExecution,
    transport: runtime.transport,
  });
  let state = await voting.read({ account: runtime.account, tokenId, targets: [] });
  // A new NFT may have same-block power suppression. Move into the next open voting window.
  await advanceTo(calculateVotingEpoch(state.escrow.epoch.next).voteStart + 1n);
  state = await voting.read({ account: runtime.account, tokenId, targets: [] });
  const codec = createAbiCodec();
  async function getter(name: string, args: readonly bigint[] = []): Promise<unknown> {
    const abi = state.contract.readAbi.find(
      (entry) => entry.type === "function" && entry.name === name,
    );
    invariant(abi, `Missing canonical voter getter ${name}`);
    return codec.decodeFunction(
      abi,
      await runtime.transport.read({
        ...state.escrow.coordinate,
        contractId: state.contract.contractId,
        address: state.contract.address,
        data: codec.encodeFunction(abi, args),
      }),
    )[0];
  }
  const count = parseUint(await getter("length"));
  let target: `0x${string}` | undefined;
  for (let index = 0n; index < count && index < 16n; index++) {
    const candidate = parseAddress(await getter("pools", [index]));
    const snapshot = await voting.read({ account: runtime.account, tokenId, targets: [candidate] });
    if (snapshot.targets.some((row) => row.target === candidate && row.registered && row.alive)) {
      target = candidate;
      break;
    }
  }
  invariant(
    target,
    "No live voting target in the first 16 pools; choose a bounded target set explicitly",
  );
  async function vote(step: string, action: VotingAction): Promise<void> {
    const prepared = await votes.prepare({
      operationId: runtime.operationId(step),
      account: runtime.account,
      tokenId,
      action,
      bounds: { minAllocations: action.kind === "vote" ? [1n] : [], maxBlockAge: 2n },
    });
    const simulation = await votes.simulate(prepared);
    const submitted = await votes.submit(prepared, simulation);
    const confirmed = await waitForConfirmation(votingExecution, submitted, runtime.polling);
    const { outcome } = await votes.reconcile(prepared, confirmed);
    runtime.report(step, {
      tokenId,
      ...outcome.forecast,
      boundsSatisfied: outcome.boundsSatisfied,
    });
    invariant(outcome.boundsSatisfied, "Vote allocation fell below policy");
  }
  await vote("vote", { kind: "vote", targets: [target], relativeWeights: [1n] });
  state = await voting.read({ account: runtime.account, tokenId, targets: [target] });
  // Reset is epoch-gated too; a same-epoch retry would not make it eligible.
  await advanceTo(calculateVotingEpoch(state.escrow.epoch.next).voteStart + 1n);
  await vote("reset", { kind: "reset" });
  await advanceTo(created.forecast.end + 1n);
  return lock("withdraw-expired-lock", { kind: "withdraw", tokenId });
}
