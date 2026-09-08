import { resolveBasicPoolInterface, resolveOperation } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseUint } from "@mezo-dev-kit/evm";
import { decodeTokenTransfers, planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import { poolAddress, poolRequire } from "./basic.ts";
import { forecastBasicLiquidity } from "./liquidity.ts";
import type {
  BasicLiquidityAction,
  BasicLiquidityBounds,
  BasicLiquidityForecast,
  BasicPoolKey,
  BasicPoolReader,
  BasicPoolSnapshot,
} from "./types.ts";

export interface PreparedBasicLiquidity {
  readonly snapshot: Readonly<BasicPoolSnapshot>;
  readonly action: BasicLiquidityAction;
  readonly bounds: BasicLiquidityBounds;
  readonly forecast: Readonly<BasicLiquidityForecast>;
  readonly approvals: readonly Readonly<{
    token: Readonly<TokenSnapshot>;
    requiredAmount: bigint;
    plan: ApprovalPlan;
  }>[];
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface BasicLiquidityOutcome {
  readonly kind: "add" | "remove";
  readonly amount0: bigint;
  readonly amount1: bigint;
  readonly liquidity: bigint;
  readonly snapshot: Readonly<BasicPoolSnapshot>;
}
export interface BasicLiquidityWriter {
  prepare(input: {
    readonly operationId: string;
    readonly key: BasicPoolKey;
    readonly account: `0x${string}`;
    readonly action: BasicLiquidityAction;
    readonly bounds: BasicLiquidityBounds;
  }): Promise<Readonly<PreparedBasicLiquidity>>;
  simulate(prepared: PreparedBasicLiquidity): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedBasicLiquidity,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedBasicLiquidity,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: BasicLiquidityOutcome;
    }>
  >;
}
const codec = createAbiCodec();
function operation(snapshot: BasicPoolSnapshot, action: BasicLiquidityAction) {
  return resolveOperation({
    contractId: "mezo-earn.router",
    networkId: snapshot.coordinate.networkId,
    blockNumber: snapshot.coordinate.blockNumber,
    functionName: action.kind === "add" ? "addLiquidity" : "removeLiquidity",
  }).functionAbi;
}
function data(
  snapshot: BasicPoolSnapshot,
  action: BasicLiquidityAction,
  bounds: BasicLiquidityBounds,
) {
  return codec.encodeFunction(operation(snapshot, action), [
    snapshot.key.token0,
    snapshot.key.token1,
    snapshot.key.stable,
    ...(action.kind === "add"
      ? [action.amount0Desired, action.amount1Desired]
      : [action.liquidity]),
    bounds.minAmount0,
    bounds.minAmount1,
    snapshot.account,
    bounds.deadline,
  ]);
}
function payments(snapshot: BasicPoolSnapshot, action: BasicLiquidityAction) {
  return (
    action.kind === "add"
      ? [
          { token: snapshot.token0, requiredAmount: action.amount0Desired },
          { token: snapshot.token1, requiredAmount: action.amount1Desired },
        ]
      : [{ token: snapshot.lp, requiredAmount: action.liquidity }]
  ).map(({ token, requiredAmount }) =>
    Object.freeze({
      token,
      requiredAmount,
      plan: planApproval({ allowance: token.allowance, requiredAmount }),
    }),
  );
}
/** Separate approvals, exact simulation and self-recipient liquidity operations. */
export function createBasicLiquidityWriter(config: {
  readonly reader: BasicPoolReader;
  readonly execution: ExecutionClient;
}): Readonly<BasicLiquidityWriter> {
  const owned = new WeakSet<PreparedBasicLiquidity>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedBasicLiquidity>();
  const assertOwned = (prepared: PreparedBasicLiquidity) => {
    poolRequire(owned.has(prepared), "InvalidInput", "prepare with this liquidity writer");
  };
  return Object.freeze({
    async prepare(input) {
      poolRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const action = Object.freeze(structuredClone(input.action)),
        bounds = Object.freeze(structuredClone(input.bounds));
      const snapshot = await config.reader.read({
        key: input.key,
        account: poolAddress(input.account),
      });
      poolRequire(
        ![
          snapshot.pool,
          snapshot.router,
          snapshot.factory,
          snapshot.key.token0,
          snapshot.key.token1,
        ].includes(snapshot.account),
        "InvalidInput",
        "direct wallet recipient required",
      );
      const forecast = forecastBasicLiquidity(snapshot, action, bounds);
      const transaction: PreparedTransaction = Object.freeze({
        operationId: input.operationId,
        contractId: "mezo-earn.router",
        coordinate: snapshot.coordinate,
        from: snapshot.account,
        to: snapshot.router,
        value: 0n,
        data: data(snapshot, action, bounds),
      });
      const prepared = Object.freeze({
        snapshot,
        action,
        bounds,
        forecast,
        transaction,
        approvals: Object.freeze(payments(snapshot, action)),
      });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      poolRequire(
        prepared.approvals.every((approval) => approval.plan.kind === "sufficient"),
        "BoundExceeded",
        "confirm approvals and prepare liquidity again",
      );
      const simulated = await config.execution.simulate(prepared.transaction, (result) => {
        const values = codec.decodeFunction(operation(prepared.snapshot, prepared.action), result),
          amount0 = parseUint(values[0]),
          amount1 = parseUint(values[1]);
        poolRequire(
          amount0 >= prepared.bounds.minAmount0 && amount1 >= prepared.bounds.minAmount1,
          "BoundExceeded",
          "simulated token amounts below minimum",
        );
        if (prepared.action.kind === "add")
          poolRequire(
            amount0 <= prepared.action.amount0Desired &&
              amount1 <= prepared.action.amount1Desired &&
              parseUint(values[2]) >= prepared.bounds.minLiquidity,
            "BoundExceeded",
            "simulated LP output or desired amounts outside bounds",
          );
      });
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      poolRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "liquidity simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        const fresh = await config.reader.read({
          key: prepared.snapshot.key,
          account: prepared.snapshot.account,
        });
        const age = fresh.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        poolRequire(
          age >= 0n &&
            age <= prepared.bounds.maxBlockAge &&
            fresh.pool === prepared.snapshot.pool &&
            fresh.router === prepared.transaction.to,
          "BoundExceeded",
          "liquidity preparation expired or destination changed",
        );
        forecastBasicLiquidity(fresh, prepared.action, prepared.bounds);
        poolRequire(
          payments(fresh, prepared.action).every((payment) => payment.plan.kind === "sufficient"),
          "BoundExceeded",
          "current liquidity allowance insufficient",
        );
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        call = prepared.transaction;
      poolRequire(
        record.operationId === call.operationId &&
          record.contractId === "mezo-earn.router" &&
          record.targetRole === undefined &&
          record.call.from === prepared.snapshot.account &&
          record.call.from === call.from &&
          record.call.to === prepared.snapshot.router &&
          record.call.to === call.to &&
          record.call.data === call.data &&
          call.data === data(prepared.snapshot, prepared.action, prepared.bounds) &&
          BigInt(record.call.value) === 0n &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "liquidity intent differs",
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
            after.pool === before.pool &&
            after.pool === prepared.snapshot.pool &&
            before.poolBalance0 === before.reserve0 &&
            before.poolBalance1 === before.reserve1 &&
            before.poolLpBalance === 0n &&
            after.poolLpBalance === 0n,
          "ReconciliationMismatch",
          "liquidity post-state or prior custody differs",
        );
        const enter = prepared.action.kind === "add",
          name = enter ? "Mint" : "Burn";
        const event = resolveBasicPoolInterface({
          role: "pool",
          networkId: after.coordinate.networkId,
        }).abi.find((entry) => entry.type === "event" && entry.name === name);
        const rows = getReceiptLogs(receipt, after.pool)
          .map((log) => codec.decodeEvent(event, log))
          .filter((row) => row !== null);
        const row = rows[0];
        poolRequire(
          rows.length === 1 && row?.[0] === after.router && (enter || row[1] === call.from),
          "ReconciliationMismatch",
          "pool liquidity event differs",
        );
        const amount0 = parseUint(row[enter ? 1 : 2]),
          amount1 = parseUint(row[enter ? 2 : 3]);
        poolRequire(
          amount0 >= prepared.bounds.minAmount0 && amount1 >= prepared.bounds.minAmount1,
          "ReconciliationMismatch",
          "received token amounts below bounds",
        );
        const zero = `0x${"0".repeat(40)}`,
          lpTransfers = decodeTokenTransfers(receipt, after.pool);
        const lpChanges = lpTransfers.filter(
          (transfer) =>
            transfer.from === (enter ? zero : after.pool) &&
            transfer.to === (enter ? call.from : zero),
        );
        const liquidity = lpChanges[0]?.amount;
        poolRequire(
          lpChanges.length === 1 && liquidity !== undefined && liquidity > 0n,
          "ReconciliationMismatch",
          "LP mint or burn differs",
        );
        if (prepared.action.kind === "add")
          poolRequire(
            liquidity >= prepared.bounds.minLiquidity &&
              amount0 <= prepared.action.amount0Desired &&
              amount1 <= prepared.action.amount1Desired,
            "ReconciliationMismatch",
            "LP output or deposit amounts outside bounds",
          );
        else
          poolRequire(
            liquidity === prepared.action.liquidity &&
              lpTransfers.filter(
                (transfer) =>
                  transfer.from === call.from &&
                  transfer.to === after.pool &&
                  transfer.amount === liquidity,
              ).length === 1,
            "ReconciliationMismatch",
            "LP payment differs",
          );
        for (const [token, amount] of [
          [after.key.token0, amount0],
          [after.key.token1, amount1],
        ] as const) {
          const transfers = decodeTokenTransfers(receipt, token).filter(
            (transfer) => transfer.from === call.from || transfer.to === call.from,
          );
          poolRequire(
            transfers.length === 1 &&
              transfers[0]?.from === (enter ? call.from : after.pool) &&
              transfers[0]?.to === (enter ? after.pool : call.from) &&
              transfers[0]?.amount === amount,
            "ReconciliationMismatch",
            "liquidity token transfer differs",
          );
        }
        const sign = enter ? 1n : -1n;
        poolRequire(
          after.reserve0 === before.reserve0 + sign * amount0 &&
            after.reserve1 === before.reserve1 + sign * amount1 &&
            after.poolBalance0 === after.reserve0 &&
            after.poolBalance1 === after.reserve1 &&
            after.totalSupply === before.totalSupply + sign * liquidity &&
            after.lp.balance === before.lp.balance + sign * liquidity &&
            after.token0.balance === before.token0.balance - sign * amount0 &&
            after.token1.balance === before.token1.balance - sign * amount1,
          "ReconciliationMismatch",
          "liquidity event, position and block-state changes differ",
        );
        return Object.freeze({
          kind: prepared.action.kind,
          amount0,
          amount1,
          liquidity,
          snapshot: after,
        });
      });
    },
  } satisfies BasicLiquidityWriter);
}
