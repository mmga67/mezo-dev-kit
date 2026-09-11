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
import { forecastRebaseClaim } from "./rebase-forecast.ts";
import type { RebaseForecast } from "./rebase-forecast.ts";
import type { RebaseReader, RebaseSnapshot } from "./rebase-reader.ts";
import { verifyRebaseSettlement } from "./rebase-settlement.ts";
export interface RebaseBounds {
  readonly minAmount: bigint;
  readonly maxBlockAge: bigint;
}
export interface PreparedRebase {
  readonly snapshot: Readonly<RebaseSnapshot>;
  readonly forecast: Readonly<RebaseForecast>;
  readonly bounds: Readonly<RebaseBounds>;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface RebaseOutcome {
  readonly snapshot: Readonly<RebaseSnapshot>;
  readonly forecast: Readonly<RebaseForecast>;
  readonly gasFee: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledRebase {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<RebaseOutcome>;
}
export interface RebaseWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly tokenId: bigint;
    readonly bounds: RebaseBounds;
  }): Promise<Readonly<PreparedRebase>>;
  simulate(prepared: PreparedRebase): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedRebase,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedRebase, record: unknown): Promise<Readonly<ReconciledRebase>>;
}
const codec = createAbiCodec();
function operation(snapshot: RebaseSnapshot) {
  return resolveOperation({
    ...snapshot.escrow.coordinate,
    contractId: snapshot.contract.contractId,
    functionName: "claim",
  }).functionAbi;
}
function data(snapshot: RebaseSnapshot) {
  return codec.encodeFunction(operation(snapshot), [snapshot.tokenId]);
}
function validateBounds(bounds: RebaseBounds) {
  parseUint(bounds.minAmount);
  parseUint(bounds.maxBlockAge);
}
export function createRebaseWriter(config: {
  readonly reader: RebaseReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<RebaseWriter> {
  const owned = new WeakSet<PreparedRebase>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedRebase>();
  const read = (snapshot: RebaseSnapshot, blockNumber?: bigint) =>
    config.reader.read({
      account: snapshot.escrow.account,
      tokenId: snapshot.tokenId,
      ...(blockNumber === undefined ? {} : { blockNumber }),
    });
  function assertOwned(prepared: PreparedRebase) {
    incentiveRequire(owned.has(prepared), "InvalidInput", "prepare with this rebase writer");
  }
  async function fresh(prepared: PreparedRebase, blockNumber?: bigint) {
    const snapshot = await read(prepared.snapshot, blockNumber),
      forecast = forecastRebaseClaim({ snapshot }),
      age =
        snapshot.escrow.coordinate.blockNumber - prepared.snapshot.escrow.coordinate.blockNumber;
    incentiveRequire(
      age >= 0n &&
        age <= prepared.bounds.maxBlockAge &&
        snapshot.contract.address === prepared.transaction.to &&
        snapshot.contract.contractId === prepared.transaction.contractId &&
        snapshot.escrow.contract.address === prepared.snapshot.escrow.contract.address &&
        snapshot.escrow.account === prepared.transaction.from &&
        snapshot.tokenId === prepared.snapshot.tokenId &&
        snapshot.minter.address === prepared.snapshot.minter.address &&
        snapshot.escrow.epoch.start === prepared.snapshot.escrow.epoch.start &&
        snapshot.timeCursor === prepared.snapshot.timeCursor &&
        forecast.amount >= prepared.bounds.minAmount &&
        forecast.disposition === prepared.forecast.disposition,
      "BoundExceeded",
      "rebase identity, epoch, cursor, disposition or amount changed",
    );
    return { snapshot, forecast };
  }
  return Object.freeze({
    async prepare(input) {
      incentiveRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      validateBounds(input.bounds);
      const bounds = Object.freeze({ ...input.bounds }),
        snapshot = await config.reader.read({ account: input.account, tokenId: input.tokenId }),
        forecast = forecastRebaseClaim({ snapshot });
      incentiveRequire(
        forecast.amount >= bounds.minAmount,
        "BoundExceeded",
        "rebase amount below minimum",
      );
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: snapshot.contract.contractId,
        coordinate: snapshot.escrow.coordinate,
        from: snapshot.escrow.account,
        to: snapshot.contract.address,
        data: data(snapshot),
        value: 0n,
      });
      const prepared = Object.freeze({ snapshot, forecast, bounds, transaction });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (output, coordinate) => {
          const { snapshot, forecast } = await fresh(prepared, coordinate.blockNumber);
          incentiveRequire(
            snapshot.escrow.coordinate.blockHash === coordinate.blockHash &&
              snapshot.escrow.coordinate.chainId === coordinate.chainId &&
              snapshot.escrow.coordinate.networkId === coordinate.networkId &&
              parseUint(codec.decodeFunction(operation(snapshot), output)[0]) === forecast.amount,
            "IdentityMismatch",
            "exact rebase simulation differs",
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
        "rebase simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        await fresh(prepared);
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        call = prepared.transaction,
        initial = prepared.snapshot;
      validateBounds(prepared.bounds);
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
          call.data === data(initial) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          record.networkId === call.coordinate.networkId &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "rebase intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        incentiveRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor required",
        );
        const [before, after, raw] = await Promise.all([
          read(initial, receipt.blockNumber - 1n),
          read(initial, receipt.blockNumber),
          config.transport.getReceipt(receipt.transactionHash),
        ]);
        incentiveRequire(
          before.contract.address === call.to &&
            before.contract.contractId === call.contractId &&
            before.escrow.contract.address === initial.escrow.contract.address &&
            before.minter.address === initial.minter.address &&
            before.timeCursor === initial.timeCursor,
          "ReconciliationMismatch",
          "rebase settlement generation or initial cursor differs",
        );
        const gasFee = getReceiptExecutionFee({ receipt, raw, from: call.from, to: call.to }),
          forecast = verifyRebaseSettlement({ before, after, receipt, gasFee });
        return Object.freeze({
          snapshot: after,
          forecast,
          gasFee,
          boundsSatisfied:
            forecast.amount >= prepared.bounds.minAmount &&
            forecast.disposition === prepared.forecast.disposition &&
            after.escrow.epoch.start === initial.escrow.epoch.start,
        });
      });
    },
  } satisfies RebaseWriter);
}
