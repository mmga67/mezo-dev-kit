import { resolveBasicPoolInterface } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseUint } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { poolAddress, poolEntry, poolRequire } from "./basic.ts";
import type { BasicPoolKey, BasicPoolReader, BasicPoolSnapshot } from "./types.ts";

export interface BasicPoolFeeBounds {
  readonly minAmount0: bigint;
  readonly minAmount1: bigint;
  readonly maxBlockAge: bigint;
}
export interface PreparedBasicPoolFeeClaim {
  readonly snapshot: Readonly<BasicPoolSnapshot>;
  readonly bounds: Readonly<BasicPoolFeeBounds>;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface BasicPoolFeeOutcome {
  readonly amount0: bigint;
  readonly amount1: bigint;
  readonly snapshot: Readonly<BasicPoolSnapshot>;
}
export interface BasicPoolFeeWriter {
  prepare(input: {
    readonly operationId: string;
    readonly key: BasicPoolKey;
    readonly account: `0x${string}`;
    readonly bounds: BasicPoolFeeBounds;
  }): Promise<Readonly<PreparedBasicPoolFeeClaim>>;
  simulate(prepared: PreparedBasicPoolFeeClaim): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedBasicPoolFeeClaim,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedBasicPoolFeeClaim,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: BasicPoolFeeOutcome;
    }>
  >;
}
const codec = createAbiCodec();
function abi(snapshot: BasicPoolSnapshot) {
  return resolveBasicPoolInterface({ role: "pool", networkId: snapshot.coordinate.networkId }).abi;
}
function functionAbi(snapshot: BasicPoolSnapshot) {
  return poolEntry(abi(snapshot), "claimFees");
}
function checkAmounts(amount0: bigint, amount1: bigint, bounds: BasicPoolFeeBounds) {
  parseUint(amount0);
  parseUint(amount1);
  poolRequire(
    (amount0 > 0n || amount1 > 0n) && amount0 >= bounds.minAmount0 && amount1 >= bounds.minAmount1,
    "BoundExceeded",
    "fee claim is empty or below minimums",
  );
}
function check(snapshot: BasicPoolSnapshot, bounds: BasicPoolFeeBounds) {
  for (const value of [bounds.minAmount0, bounds.minAmount1, bounds.maxBlockAge]) parseUint(value);
  poolRequire(
    snapshot.writeCompatible === true,
    "UnavailablePool",
    "pool assets are outside current writer compatibility",
  );
  poolRequire(
    ![
      snapshot.pool,
      snapshot.poolFees,
      snapshot.factory,
      snapshot.router,
      snapshot.key.token0,
      snapshot.key.token1,
    ].includes(snapshot.account),
    "InvalidInput",
    "direct wallet recipient required",
  );
  checkAmounts(snapshot.fees.pending0, snapshot.fees.pending1, bounds);
}
/** Direct wallet fees, including stored claims after the last LP token is withdrawn. */
export function createBasicPoolFeeWriter(config: {
  readonly reader: BasicPoolReader;
  readonly execution: ExecutionClient;
}): Readonly<BasicPoolFeeWriter> {
  const owned = new WeakSet<PreparedBasicPoolFeeClaim>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedBasicPoolFeeClaim>();
  function assertOwned(prepared: PreparedBasicPoolFeeClaim) {
    poolRequire(owned.has(prepared), "InvalidInput", "prepare with this fee writer");
  }
  return Object.freeze({
    async prepare(input) {
      poolRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const bounds = Object.freeze(structuredClone(input.bounds)),
        snapshot = await config.reader.read({
          key: input.key,
          account: poolAddress(input.account),
        });
      check(snapshot, bounds);
      const transaction: PreparedTransaction = Object.freeze({
        operationId: input.operationId,
        contractId: "mezo-earn.pool-factory",
        targetRole: "basic-lp",
        coordinate: snapshot.coordinate,
        from: snapshot.account,
        to: snapshot.pool,
        value: 0n,
        data: codec.encodeFunction(functionAbi(snapshot), []),
      });
      const prepared = Object.freeze({ snapshot, bounds, transaction });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      const simulated = await config.execution.simulate(prepared.transaction, (returnData) => {
        const amounts = codec.decodeFunction(functionAbi(prepared.snapshot), returnData);
        checkAmounts(parseUint(amounts[0]), parseUint(amounts[1]), prepared.bounds);
      });
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      poolRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "fee simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        const fresh = await config.reader.read({
          key: prepared.snapshot.key,
          account: prepared.snapshot.account,
        });
        check(fresh, prepared.bounds);
        const age = fresh.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        poolRequire(
          age >= 0n &&
            age <= prepared.bounds.maxBlockAge &&
            fresh.pool === prepared.transaction.to &&
            fresh.poolFees === prepared.snapshot.poolFees,
          "BoundExceeded",
          "fee claim expired or destination changed",
        );
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        call = prepared.transaction;
      poolRequire(
        record.operationId === call.operationId &&
          record.contractId === "mezo-earn.pool-factory" &&
          record.targetRole === "basic-lp" &&
          record.call.from === call.from &&
          call.from === prepared.snapshot.account &&
          record.call.to === call.to &&
          call.to === prepared.snapshot.pool &&
          record.call.data === call.data &&
          call.data === codec.encodeFunction(functionAbi(prepared.snapshot), []) &&
          BigInt(record.call.value) === 0n &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "fee intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        poolRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor unavailable",
        );
        const read = (blockNumber: bigint) =>
          config.reader.read({ key: prepared.snapshot.key, account: call.from, blockNumber });
        const [before, after] = await Promise.all([
          read(receipt.blockNumber - 1n),
          read(receipt.blockNumber),
        ]);
        poolRequire(
          after.coordinate.blockHash === receipt.blockHash &&
            before.writeCompatible &&
            after.writeCompatible &&
            after.pool === before.pool &&
            after.pool === call.to &&
            after.poolFees === before.poolFees,
          "ReconciliationMismatch",
          "fee post-state identity differs",
        );
        const event = abi(after).find((entry) => entry.type === "event" && entry.name === "Claim");
        const rows = getReceiptLogs(receipt, after.pool)
            .map((log) => codec.decodeEvent(event, log))
            .filter((row) => row !== null),
          row = rows[0];
        poolRequire(
          rows.length === 1 && row?.[0] === call.from && row[1] === call.from,
          "ReconciliationMismatch",
          "fee claim event differs",
        );
        const amount0 = parseUint(row[2]),
          amount1 = parseUint(row[3]);
        checkAmounts(amount0, amount1, prepared.bounds);
        for (const [asset, amount] of [
          [after.key.token0, amount0],
          [after.key.token1, amount1],
        ] as const) {
          const transfers = decodeTokenTransfers(receipt, asset).filter(
            (transfer) => transfer.from === call.from || transfer.to === call.from,
          );
          poolRequire(
            amount === 0n
              ? transfers.length === 0
              : transfers.length === 1 &&
                  transfers[0]?.from === after.poolFees &&
                  transfers[0]?.to === call.from &&
                  transfers[0]?.amount === amount,
            "ReconciliationMismatch",
            "fee token payment differs",
          );
        }
        poolRequire(
          before.fees.pending0 === amount0 &&
            before.fees.pending1 === amount1 &&
            after.fees.pending0 === 0n &&
            after.fees.pending1 === 0n &&
            after.lp.balance === before.lp.balance &&
            after.totalSupply === before.totalSupply &&
            after.reserve0 === before.reserve0 &&
            after.reserve1 === before.reserve1 &&
            after.poolBalance0 === before.poolBalance0 &&
            after.poolBalance1 === before.poolBalance1 &&
            after.token0.balance === before.token0.balance + amount0 &&
            after.token1.balance === before.token1.balance + amount1,
          "ReconciliationMismatch",
          "fee event and block-state changes differ",
        );
        return Object.freeze({ amount0, amount1, snapshot: after });
      });
    },
  } satisfies BasicPoolFeeWriter);
}
