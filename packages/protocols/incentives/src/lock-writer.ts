import { resolveEvent, resolveOperation } from "@mezo-dev-kit/contracts";
import { getReceiptExecutionFee, getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers, planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan } from "@mezo-dev-kit/tokens";
import { incentiveRequire } from "./escrow-errors.ts";
import { lockWalletBalance } from "./lock-balance.ts";
import { forecastLock } from "./lock-forecast.ts";
import type { LockAction, LockForecast } from "./lock-forecast.ts";
import { calculateLockVotingPower } from "./math.ts";
import type { LockReader, LockSnapshot } from "./lock-types.ts";
export interface LockBounds {
  readonly minLockedAmount: bigint;
  readonly minUnboostedPower: bigint;
  readonly maxLockEnd: bigint;
  readonly maxBlockAge: bigint;
}
export interface PreparedLock {
  readonly snapshot: Readonly<LockSnapshot>;
  readonly action: Readonly<LockAction>;
  readonly bounds: Readonly<LockBounds>;
  readonly forecast: Readonly<LockForecast>;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface LockOutcome {
  readonly kind: LockAction["kind"];
  readonly tokenId: bigint;
  readonly snapshot: Readonly<LockSnapshot>;
  readonly forecast: Readonly<LockForecast>;
  readonly gasFee: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledLock {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<LockOutcome>;
}
export interface LockWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: LockAction;
    readonly bounds: LockBounds;
  }): Promise<Readonly<PreparedLock>>;
  simulate(prepared: PreparedLock): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedLock,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedLock, record: unknown): Promise<Readonly<ReconciledLock>>;
}
const zero = parseAddress(`0x${"0".repeat(40)}`),
  codec = createAbiCodec();
function operation(snapshot: LockSnapshot, action: LockAction) {
  const names = {
    create: "createLock",
    increase: "increaseAmount",
    extend: "increaseUnlockTime",
    "make-permanent": "lockPermanent",
    "unlock-permanent": "unlockPermanent",
    withdraw: "withdraw",
  };
  const name = names[action.kind];
  incentiveRequire(typeof name === "string", "InvalidInput", "unknown lock operation");
  return resolveOperation({
    contractId: snapshot.contract.contractId,
    networkId: snapshot.coordinate.networkId,
    blockNumber: snapshot.coordinate.blockNumber,
    functionName: name,
  }).functionAbi;
}
function data(snapshot: LockSnapshot, action: LockAction) {
  const args =
    action.kind === "create"
      ? [action.amount, action.duration]
      : action.kind === "increase"
        ? [action.tokenId, action.amount]
        : action.kind === "extend"
          ? [action.tokenId, action.duration]
          : [action.tokenId];
  return codec.encodeFunction(operation(snapshot, action), args);
}
function ids(action: LockAction): readonly bigint[] {
  return action.kind === "create" ? [] : [parseUint(action.tokenId)];
}
function checkBounds(bounds: LockBounds) {
  for (const value of [
    bounds.minLockedAmount,
    bounds.minUnboostedPower,
    bounds.maxLockEnd,
    bounds.maxBlockAge,
  ])
    parseUint(value);
}
function satisfies(forecast: LockForecast, bounds: LockBounds) {
  return (
    forecast.amount >= bounds.minLockedAmount &&
    forecast.unboostedPower >= bounds.minUnboostedPower &&
    forecast.end <= bounds.maxLockEnd
  );
}
export function createLockWriter(config: {
  readonly reader: LockReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<LockWriter> {
  const owned = new WeakSet<PreparedLock>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedLock>();
  function assertOwned(prepared: PreparedLock) {
    incentiveRequire(owned.has(prepared), "InvalidInput", "prepare with this lock writer");
  }
  return Object.freeze({
    async prepare(input) {
      incentiveRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const action = Object.freeze(structuredClone(input.action)),
        bounds = Object.freeze(structuredClone(input.bounds));
      checkBounds(bounds);
      const snapshot = await config.reader.read({
          account: parseAddress(input.account),
          tokenIds: ids(action),
        }),
        forecast = forecastLock({ snapshot, action });
      incentiveRequire(
        satisfies(forecast, bounds),
        "BoundExceeded",
        "lock forecast exceeds policy",
      );
      const approval = planApproval({
          allowance: snapshot.token.allowance,
          requiredAmount: forecast.deposit,
        }),
        transaction = Object.freeze({
          operationId: input.operationId,
          contractId: snapshot.contract.contractId,
          coordinate: snapshot.coordinate,
          from: snapshot.account,
          to: snapshot.contract.address,
          value: 0n,
          data: data(snapshot, action),
        });
      const prepared = Object.freeze({ snapshot, action, bounds, forecast, approval, transaction });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      incentiveRequire(
        prepared.approval.kind === "sufficient",
        "ApprovalRequired",
        "confirm underlying approval and prepare again",
      );
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (output, coordinate) => {
          const fresh = await config.reader.read({
              account: prepared.snapshot.account,
              tokenIds: ids(prepared.action),
              blockNumber: coordinate.blockNumber,
            }),
            forecast = forecastLock({ snapshot: fresh, action: prepared.action });
          incentiveRequire(
            fresh.coordinate.blockHash === coordinate.blockHash &&
              fresh.contract.address === prepared.transaction.to &&
              fresh.token.allowance >= forecast.deposit &&
              satisfies(forecast, prepared.bounds),
            "BoundExceeded",
            "exact lock simulation state exceeds policy",
          );
          if (prepared.action.kind === "create")
            incentiveRequire(
              parseUint(codec.decodeFunction(operation(fresh, prepared.action), output)[0]) ===
                parseUint(fresh.lastMintedTokenId + 1n),
              "IdentityMismatch",
              "simulated new token ID differs",
            );
          else
            incentiveRequire(
              output.length === 2,
              "IdentityMismatch",
              "void lock operation returned data",
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
        "lock simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        const fresh = await config.reader.read({
            account: prepared.snapshot.account,
            tokenIds: ids(prepared.action),
          }),
          forecast = forecastLock({ snapshot: fresh, action: prepared.action }),
          age = fresh.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        incentiveRequire(
          age >= 0n &&
            age <= prepared.bounds.maxBlockAge &&
            fresh.contract.address === prepared.transaction.to &&
            fresh.underlying === prepared.snapshot.underlying &&
            fresh.token.allowance >= forecast.deposit &&
            satisfies(forecast, prepared.bounds),
          "BoundExceeded",
          "lock state, approval or lifetime changed",
        );
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        call = prepared.transaction,
        action = prepared.action;
      checkBounds(prepared.bounds);
      incentiveRequire(
        record.operationId === call.operationId &&
          record.contractId === prepared.snapshot.contract.contractId &&
          call.contractId === record.contractId &&
          record.targetRole === undefined &&
          record.call.from === call.from &&
          call.from === prepared.snapshot.account &&
          record.call.to === call.to &&
          call.to === prepared.snapshot.contract.address &&
          record.call.data === call.data &&
          call.data === data(prepared.snapshot, action) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "lock intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        incentiveRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor required",
        );
        const logs = getReceiptLogs(receipt, call.to);
        const event = (name: string) =>
          resolveEvent({
            contractId: call.contractId,
            networkId: call.coordinate.networkId,
            blockNumber: receipt.blockNumber,
            eventName: name,
          });
        const nftTransfers = logs
          .map((log) => codec.decodeEvent(event("Transfer"), log))
          .filter((row) => row !== null);
        const tokenId =
          action.kind === "create" ? parseUint(nftTransfers[0]?.[2]) : parseUint(action.tokenId);
        incentiveRequire(
          action.kind === "create"
            ? nftTransfers.length === 1 &&
                nftTransfers[0]?.[0] === zero &&
                nftTransfers[0][1] === call.from
            : action.kind === "withdraw"
              ? nftTransfers.length === 1 &&
                nftTransfers[0]?.[0] === call.from &&
                nftTransfers[0][1] === zero &&
                nftTransfers[0][2] === tokenId
              : nftTransfers.length === 0,
          "ReconciliationMismatch",
          "lock NFT transfer differs",
        );
        const read = (blockNumber: bigint) =>
          config.reader.read({ account: call.from, tokenIds: [tokenId], blockNumber });
        const [before, after, raw] = await Promise.all([
          read(receipt.blockNumber - 1n),
          read(receipt.blockNumber),
          config.transport.getReceipt(receipt.transactionHash),
        ]);
        incentiveRequire(
          after.coordinate.blockHash === receipt.blockHash &&
            before.contract.address === call.to &&
            after.contract.address === call.to &&
            before.role === prepared.snapshot.role &&
            after.role === before.role &&
            after.underlying === before.underlying &&
            after.maxLockSeconds === before.maxLockSeconds,
          "ReconciliationMismatch",
          "lock settlement identity differs",
        );
        const forecast = forecastLock({ snapshot: before, action, atTimestamp: after.timestamp }),
          previous = before.locks[0],
          current = after.locks[0];
        incentiveRequire(
          previous !== undefined && current !== undefined,
          "ReconciliationMismatch",
          "lock settlement position unavailable",
        );
        const gasFee = getReceiptExecutionFee({ receipt, raw, from: call.from, to: call.to }),
          tokenGasFee = after.role === "vebtc-current" ? gasFee : 0n;
        const amountRows = decodeTokenTransfers(receipt, after.underlying).filter(
            (row) =>
              row.from === call.from ||
              row.to === call.from ||
              row.from === call.to ||
              row.to === call.to,
          ),
          moved = forecast.deposit + forecast.withdraw;
        incentiveRequire(
          moved === 0n
            ? amountRows.length === 0
            : amountRows.length === 1 &&
                amountRows[0]?.amount === moved &&
                amountRows[0].from === (forecast.deposit > 0n ? call.from : call.to) &&
                amountRows[0].to === (forecast.deposit > 0n ? call.to : call.from),
          "ReconciliationMismatch",
          "lock underlying transfer differs",
        );
        const eventName =
            action.kind === "withdraw"
              ? "Withdraw"
              : action.kind === "make-permanent"
                ? "LockPermanent"
                : action.kind === "unlock-permanent"
                  ? "UnlockPermanent"
                  : "Deposit",
          rows = logs
            .map((log) => codec.decodeEvent(event(eventName), log))
            .filter((row) => row !== null),
          row = rows[0];
        incentiveRequire(
          rows.length === 1 && row?.[0] === call.from && row[1] === tokenId,
          "ReconciliationMismatch",
          "lock operation event differs",
        );
        if (eventName === "Deposit") {
          const depositType = action.kind === "create" ? 1n : action.kind === "increase" ? 2n : 3n;
          incentiveRequire(
            row[2] === depositType &&
              row[3] === forecast.deposit &&
              row[4] === forecast.end &&
              row[5] === after.timestamp,
            "ReconciliationMismatch",
            "lock deposit event amounts differ",
          );
        } else
          incentiveRequire(
            row[2] === (action.kind === "withdraw" ? forecast.withdraw : forecast.amount) &&
              row[3] === after.timestamp,
            "ReconciliationMismatch",
            "lock event amount or timestamp differs",
          );
        const beforePermanent = previous.permanent ? previous.amount : 0n,
          afterPermanent = current.permanent ? current.amount : 0n;
        const virtual = (snapshot: LockSnapshot, position: typeof previous) =>
          position.permanent
            ? calculateLockVotingPower({
                amount: position.amount,
                boost: position.storedBoost,
                end: position.end,
                permanent: true,
                maxLockSeconds: snapshot.maxLockSeconds,
                timestamp: snapshot.timestamp,
              }).boosted
            : 0n;
        const created = action.kind === "create" ? 1n : 0n,
          burned = action.kind === "withdraw" ? 1n : 0n;
        incentiveRequire(
          current.amount === forecast.amount &&
            current.end === forecast.end &&
            current.permanent === forecast.permanent &&
            current.currentUnboostedPower === forecast.unboostedPower &&
            current.owner === (burned === 1n ? zero : call.from) &&
            !current.voted &&
            current.delegatee === 0n &&
            current.kind === "normal" &&
            (current.boostGauge === null || current.boostGauge === zero) &&
            after.supply === before.supply + forecast.deposit - forecast.withdraw &&
            after.permanentBalance === before.permanentBalance + afterPermanent - beforePermanent &&
            after.virtualPermanentBalance ===
              before.virtualPermanentBalance +
                virtual(after, current) -
                virtual(before, previous) &&
            after.escrowTokenBalance ===
              before.escrowTokenBalance + forecast.deposit - forecast.withdraw &&
            after.token.balance ===
              lockWalletBalance({
                before: before.token.balance,
                deposit: forecast.deposit,
                withdraw: forecast.withdraw,
                tokenGasFee,
              }) &&
            after.ownedCount === before.ownedCount + created - burned &&
            after.lastMintedTokenId === before.lastMintedTokenId + created &&
            (created === 0n || tokenId === after.lastMintedTokenId),
          "ReconciliationMismatch",
          "lock event and block-state changes differ",
        );
        if (after.role === "vemezo-current")
          incentiveRequire(
            after.nativeBalance + gasFee === before.nativeBalance,
            "ReconciliationMismatch",
            "MEZO lock native gas balance differs",
          );
        return Object.freeze({
          kind: action.kind,
          tokenId,
          snapshot: after,
          forecast,
          gasFee,
          boundsSatisfied: satisfies(forecast, prepared.bounds),
        });
      });
    },
  } satisfies LockWriter);
}
