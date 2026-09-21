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
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { incentiveRequire } from "./escrow-errors.ts";
import { forecastVoting } from "./voting-forecast.ts";
import type { VotingAction, VotingForecast } from "./voting-forecast.ts";
import { verifyVotingSettlement } from "./voting-settlement.ts";
import type { VotingReader, VotingSnapshot } from "./voting-types.ts";

/**
 * Per-target minimum power in action order and maximum age in blocks. Reset requires an empty
 * minimum array.
 */
export interface VotingBounds {
  /** Base units of voting power, in action target order; empty for reset. */
  readonly minAllocations: readonly bigint[];
  /**
   * Maximum accepted preparation age in blocks, checked by the owning operation.
   */
  readonly maxBlockAge: bigint;
}
/**
 * Verified NFT/target state, forecast and exact domain vote/reset call; no token approval is
 * required.
 */
export interface PreparedVoting {
  readonly snapshot: Readonly<VotingSnapshot>;
  readonly action: Readonly<VotingAction>;
  readonly bounds: Readonly<VotingBounds>;
  readonly forecast: Readonly<VotingForecast>;
  readonly transaction: Readonly<PreparedTransaction>;
}
/**
 * Actual domain allocations, receipt-block state, gas and caller-policy outcome; other voter
 * domains remain separate.
 */
export interface VotingOutcome {
  readonly snapshot: Readonly<VotingSnapshot>;
  readonly forecast: Readonly<VotingForecast>;
  /**
   * Native currency base units spent on execution; keep separate from token principal and
   * protocol fees.
   */
  readonly gasFee: bigint;
  /**
   * Whether actual settlement met caller policy; receipt success alone does not guarantee this
   * is true.
   */
  readonly boundsSatisfied: boolean;
}
/**
 * Confirmed matching vote/reset intent plus verified event and allocation accounting.
 */
export interface ReconciledVoting {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<VotingOutcome>;
}
/**
 * Ordinary self-owned NFT vote/reset lifecycle with epoch/liveness checks and conservative
 * state reconciliation.
 */
export interface VotingWriter {
  /**
   * Read and validate the selected intent, then return its exact prepared call without signing.
   * Retain the original object for this writer's simulation/submission.
   */
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly tokenId: bigint;
    readonly action: VotingAction;
    readonly bounds: VotingBounds;
  }): Promise<Readonly<PreparedVoting>>;
  /**
   * Simulate this writer's prepared call and retain the matching result. Confirm any required
   * separate approval and prepare again first; no transaction is sent.
   */
  simulate(prepared: PreparedVoting): Promise<Readonly<SimulatedTransaction>>;
  /**
   * Revalidate and submit the matching writer-owned preparation/simulation through Core.
   * Returns a durable record, not confirmation or protocol completion. Recover an uncertain
   * send by its existing intent.
   */
  submit(
    prepared: PreparedVoting,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  /**
   * Match the persisted intent and confirmed receipt, then verify voter allocations and reward
   * accounting. Required evidence mismatches can reject even when the EVM receipt succeeded.
   */
  reconcile(prepared: PreparedVoting, record: unknown): Promise<Readonly<ReconciledVoting>>;
}
const codec = createAbiCodec();
function targets(action: VotingAction): readonly `0x${string}`[] {
  incentiveRequire(
    action.kind === "vote" || action.kind === "reset",
    "InvalidInput",
    "unknown voting action",
  );
  return action.kind === "vote" ? action.targets : [];
}
function data(snapshot: VotingSnapshot, action: VotingAction) {
  const abi = resolveOperation({
    contractId: snapshot.contract.contractId,
    networkId: snapshot.escrow.coordinate.networkId,
    blockNumber: snapshot.escrow.coordinate.blockNumber,
    functionName: action.kind,
  }).functionAbi;
  return codec.encodeFunction(
    abi,
    action.kind === "reset"
      ? [snapshot.tokenId]
      : [snapshot.tokenId, action.targets, action.relativeWeights],
  );
}
function boundsValid(bounds: VotingBounds, count: number) {
  parseUint(bounds.maxBlockAge);
  incentiveRequire(
    Array.isArray(bounds.minAllocations) && bounds.minAllocations.length === count,
    "InvalidInput",
    "one minimum allocation per vote target required",
  );
  bounds.minAllocations.forEach((value) => parseUint(value));
}
function satisfies(forecast: VotingForecast, bounds: VotingBounds) {
  return (
    forecast.allocations.length === bounds.minAllocations.length &&
    bounds.minAllocations.every(
      (min, i) => forecast.allocations[i] !== undefined && forecast.allocations[i] >= min,
    )
  );
}
/**
 * Create explicit vote/reset operations for ordinary self-owned NFTs in one domain.
 *
 * @remarks
 * No token approval is needed. Submit rechecks the owned preparation's identity,
 * epoch, ownership, target liveness and bounds. Reconciliation checks allocations,
 * events and receipt-block accounting while preserving other voter domains.
 * Minimum allocations are client policy; inspect the reconciled boundsSatisfied.
 */
export function createVotingWriter(config: {
  readonly reader: VotingReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<VotingWriter> {
  const owned = new WeakSet<PreparedVoting>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedVoting>();
  function assertOwned(prepared: PreparedVoting) {
    incentiveRequire(owned.has(prepared), "InvalidInput", "prepare with this voting writer");
  }
  async function fresh(prepared: PreparedVoting, blockNumber?: bigint) {
    const snapshot = await config.reader.read({
      account: prepared.snapshot.escrow.account,
      tokenId: prepared.snapshot.tokenId,
      targets: targets(prepared.action),
      ...(blockNumber === undefined ? {} : { blockNumber }),
    });
    const age =
      snapshot.escrow.coordinate.blockNumber - prepared.snapshot.escrow.coordinate.blockNumber;
    incentiveRequire(
      snapshot.domain === prepared.snapshot.domain &&
        snapshot.tokenId === prepared.snapshot.tokenId &&
        snapshot.contract.address === prepared.transaction.to &&
        snapshot.contract.contractId === prepared.transaction.contractId &&
        snapshot.escrow.contract.address === prepared.snapshot.escrow.contract.address &&
        snapshot.escrow.account === prepared.transaction.from &&
        snapshot.escrow.epoch.start === prepared.snapshot.escrow.epoch.start &&
        age >= 0n &&
        age <= prepared.bounds.maxBlockAge &&
        satisfies(forecastVoting({ snapshot, action: prepared.action }), prepared.bounds),
      "BoundExceeded",
      "voting identity, epoch, lifetime or allocation changed",
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
      const copy = structuredClone(input.action);
      const action =
        copy.kind === "vote"
          ? Object.freeze({
              ...copy,
              targets: Object.freeze([...copy.targets]),
              relativeWeights: Object.freeze([...copy.relativeWeights]),
            })
          : Object.freeze(copy);
      boundsValid(input.bounds, targets(action).length);
      const bounds = Object.freeze({
        ...input.bounds,
        minAllocations: Object.freeze([...input.bounds.minAllocations]),
      });
      const snapshot = await config.reader.read({
          account: parseAddress(input.account),
          tokenId: parseUint(input.tokenId),
          targets: targets(action),
        }),
        forecast = forecastVoting({ snapshot, action });
      incentiveRequire(
        satisfies(forecast, bounds),
        "BoundExceeded",
        "vote allocation exceeds policy",
      );
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: snapshot.contract.contractId,
        coordinate: snapshot.escrow.coordinate,
        from: snapshot.escrow.account,
        to: snapshot.contract.address,
        data: data(snapshot, action),
        value: 0n,
      });
      const prepared = Object.freeze({ snapshot, action, bounds, forecast, transaction });
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
              snapshot.escrow.coordinate.blockHash === coordinate.blockHash &&
              snapshot.escrow.coordinate.chainId === coordinate.chainId &&
              snapshot.escrow.coordinate.networkId === coordinate.networkId,
            "IdentityMismatch",
            "exact voting simulation differs",
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
        "voting simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        await fresh(prepared);
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        call = prepared.transaction,
        initial = prepared.snapshot;
      boundsValid(prepared.bounds, targets(prepared.action).length);
      incentiveRequire(
        record.operationId === call.operationId &&
          record.contractId === initial.contract.contractId &&
          call.contractId === record.contractId &&
          record.targetRole === undefined &&
          call.targetRole === undefined &&
          record.call.from === call.from &&
          call.from === initial.escrow.account &&
          record.call.to === call.to &&
          call.to === initial.contract.address &&
          record.call.data === call.data &&
          call.data === data(initial, prepared.action) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          record.networkId === call.coordinate.networkId &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "voting intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        incentiveRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor required",
        );
        const read = (blockNumber: bigint) =>
          config.reader.read({
            account: call.from,
            tokenId: initial.tokenId,
            targets: targets(prepared.action),
            blockNumber,
          });
        const before = await read(receipt.blockNumber - 1n);
        // Reset removes stored target coverage; retain every touched reward for settlement.
        const after = await config.reader.read({
          account: call.from,
          tokenId: initial.tokenId,
          targets: before.previousTargets,
          blockNumber: receipt.blockNumber,
        });
        const gasFee = getReceiptExecutionFee({
          receipt,
          raw: await config.transport.getReceipt(receipt.transactionHash),
          from: call.from,
          to: call.to,
        });
        const forecast = verifyVotingSettlement({
          before,
          after,
          receipt,
          action: prepared.action,
          gasFee,
        });
        incentiveRequire(
          before.contract.address === call.to &&
            before.contract.contractId === call.contractId &&
            before.domain === initial.domain &&
            before.escrow.contract.address === initial.escrow.contract.address,
          "ReconciliationMismatch",
          "voting settlement generation differs",
        );
        return Object.freeze({
          snapshot: after,
          forecast,
          gasFee,
          boundsSatisfied:
            satisfies(forecast, prepared.bounds) &&
            after.escrow.epoch.start === initial.escrow.epoch.start,
        });
      });
    },
  } satisfies VotingWriter);
}
