import { resolveOperation } from "@mezo-dev-kit/contracts";
import { getReceiptExecutionFee, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import type {
  VotingRewardReadInput,
  VotingRewardReader,
  VotingRewardSnapshot,
} from "./voting-reward-reader.ts";
import {
  validateVotingRewardClaim,
  verifyVotingRewardSettlement,
} from "./voting-reward-settlement.ts";
export interface VotingRewardBounds {
  /** Minimum token base units in requested token order. Checked policy, not an on-chain argument. */
  readonly minAmounts: readonly bigint[];
  readonly maxBlockAge: bigint;
}
export interface PreparedVotingReward {
  readonly snapshot: Readonly<VotingRewardSnapshot>;
  readonly bounds: Readonly<VotingRewardBounds>;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface VotingRewardOutcome {
  readonly snapshot: Readonly<VotingRewardSnapshot>;
  readonly paid: readonly bigint[];
  readonly gasFee: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledVotingReward {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<VotingRewardOutcome>;
}
export interface VotingRewardWriter {
  prepare(
    input: Omit<VotingRewardReadInput, "blockNumber"> & {
      readonly operationId: string;
      readonly bounds: VotingRewardBounds;
    },
  ): Promise<Readonly<PreparedVotingReward>>;
  simulate(prepared: PreparedVotingReward): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedVotingReward,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedVotingReward,
    record: unknown,
  ): Promise<Readonly<ReconciledVotingReward>>;
}
const codec = createAbiCodec();
function data(snapshot: VotingRewardSnapshot) {
  const abi = resolveOperation({
    contractId: snapshot.voting.contract.contractId,
    networkId: snapshot.voting.escrow.coordinate.networkId,
    blockNumber: snapshot.voting.escrow.coordinate.blockNumber,
    functionName: snapshot.reward.role === "fees" ? "claimFees" : "claimBribes",
  }).functionAbi;
  return codec.encodeFunction(abi, [
    [snapshot.reward.address],
    [snapshot.tokens.map((row) => row.token)],
    snapshot.voting.tokenId,
  ]);
}
function boundShape(bounds: VotingRewardBounds, count: number) {
  parseUint(bounds.maxBlockAge);
  incentiveRequire(
    Array.isArray(bounds.minAmounts) && bounds.minAmounts.length === count,
    "InvalidInput",
    "one minimum per reward token required",
  );
  bounds.minAmounts.forEach((value) => parseUint(value));
}
function satisfies(amounts: readonly bigint[], bounds: VotingRewardBounds) {
  return (
    amounts.length === bounds.minAmounts.length &&
    bounds.minAmounts.every((min, i) => amounts[i] !== undefined && amounts[i] >= min)
  );
}
function readInput(snapshot: VotingRewardSnapshot, blockNumber?: bigint): VotingRewardReadInput {
  return {
    account: snapshot.voting.escrow.account,
    tokenId: snapshot.voting.tokenId,
    target: snapshot.target,
    role: snapshot.reward.role,
    tokens: snapshot.tokens.map((row) => row.token),
    ...(blockNumber === undefined ? {} : { blockNumber }),
  };
}
export function createVotingRewardWriter(config: {
  readonly reader: VotingRewardReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<VotingRewardWriter> {
  const owned = new WeakSet<PreparedVotingReward>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedVotingReward>();
  function assertOwned(prepared: PreparedVotingReward) {
    incentiveRequire(owned.has(prepared), "InvalidInput", "prepare with this reward writer");
  }
  async function fresh(prepared: PreparedVotingReward, blockNumber?: bigint) {
    const snapshot = await config.reader.read(readInput(prepared.snapshot, blockNumber)),
      previous = prepared.snapshot;
    validateVotingRewardClaim(snapshot);
    const age =
      snapshot.voting.escrow.coordinate.blockNumber - previous.voting.escrow.coordinate.blockNumber;
    incentiveRequire(
      age >= 0n &&
        age <= prepared.bounds.maxBlockAge &&
        snapshot.voting.escrow.epoch.start === previous.voting.escrow.epoch.start &&
        snapshot.voting.contract.address === prepared.transaction.to &&
        snapshot.voting.contract.contractId === prepared.transaction.contractId &&
        snapshot.voting.escrow.contract.address === previous.voting.escrow.contract.address &&
        snapshot.voting.escrow.account === prepared.transaction.from &&
        snapshot.voting.tokenId === previous.voting.tokenId &&
        snapshot.voting.domain === previous.voting.domain &&
        data(snapshot) === prepared.transaction.data &&
        satisfies(
          snapshot.tokens.map((row) => row.earned),
          prepared.bounds,
        ),
      "BoundExceeded",
      "reward identity, epoch, lifetime or amount changed",
    );
    return snapshot;
  }
  return Object.freeze({
    async prepare(input) {
      incentiveRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      boundShape(input.bounds, input.tokens.length);
      const bounds = Object.freeze({
        ...input.bounds,
        minAmounts: Object.freeze([...input.bounds.minAmounts]),
      });
      const snapshot = await config.reader.read({ ...input, tokens: [...input.tokens] });
      validateVotingRewardClaim(snapshot);
      incentiveRequire(
        satisfies(
          snapshot.tokens.map((row) => row.earned),
          bounds,
        ),
        "BoundExceeded",
        "reward payout below requested minimum",
      );
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: snapshot.voting.contract.contractId,
        coordinate: snapshot.voting.escrow.coordinate,
        from: snapshot.voting.escrow.account,
        to: snapshot.voting.contract.address,
        data: data(snapshot),
        value: 0n,
      });
      const prepared = Object.freeze({ snapshot, bounds, transaction });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (output, coordinate) => {
          const snapshot = await fresh(prepared, coordinate.blockNumber);
          incentiveRequire(
            output === "0x" &&
              snapshot.voting.escrow.coordinate.blockHash === coordinate.blockHash &&
              snapshot.voting.escrow.coordinate.chainId === coordinate.chainId &&
              snapshot.voting.escrow.coordinate.networkId === coordinate.networkId,
            "IdentityMismatch",
            "exact reward simulation differs",
          );
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      incentiveRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "reward simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        await fresh(prepared);
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        call = prepared.transaction,
        initial = prepared.snapshot;
      boundShape(prepared.bounds, initial.tokens.length);
      incentiveRequire(
        record.operationId === call.operationId &&
          record.contractId === initial.voting.contract.contractId &&
          call.contractId === record.contractId &&
          record.targetRole === undefined &&
          call.targetRole === undefined &&
          record.call.from === call.from &&
          call.from === initial.voting.escrow.account &&
          record.call.to === call.to &&
          call.to === initial.voting.contract.address &&
          record.call.data === call.data &&
          call.data === data(initial) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          record.networkId === call.coordinate.networkId &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "reward intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        incentiveRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor required",
        );
        const [before, after, raw] = await Promise.all([
          config.reader.read(readInput(initial, receipt.blockNumber - 1n)),
          config.reader.read(readInput(initial, receipt.blockNumber)),
          config.transport.getReceipt(receipt.transactionHash),
        ]);
        incentiveRequire(
          data(before) === call.data &&
            before.voting.contract.address === call.to &&
            before.voting.contract.contractId === call.contractId &&
            before.voting.escrow.contract.address === initial.voting.escrow.contract.address,
          "ReconciliationMismatch",
          "reward settlement call differs",
        );
        const gasFee = getReceiptExecutionFee({ receipt, raw, from: call.from, to: call.to }),
          paid = verifyVotingRewardSettlement({ before, after, receipt, gasFee });
        return Object.freeze({
          snapshot: after,
          paid,
          gasFee,
          boundsSatisfied:
            satisfies(paid, prepared.bounds) &&
            after.voting.escrow.epoch.start === initial.voting.escrow.epoch.start,
        });
      });
    },
  } satisfies VotingRewardWriter);
}
