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
import type { AbiValue } from "@mezo-dev-kit/evm";
import { planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import { poolRequire } from "./errors.ts";
import { clBounds, forecastCLPosition } from "./cl-actions.ts";
import type { CLPositionAction, CLPositionBounds, CLPositionForecast } from "./cl-actions.ts";
import type { CLPoolKey, CLPoolReader, CLPoolSnapshot } from "./cl-types.ts";
import { clReceiptTokenId, verifyCLPositionSettlement } from "./cl-settlement.ts";
export interface PreparedCLPosition {
  readonly snapshot: Readonly<CLPoolSnapshot>;
  readonly action: Readonly<CLPositionAction>;
  readonly bounds: Readonly<CLPositionBounds>;
  readonly forecast: Readonly<CLPositionForecast>;
  readonly approvals: readonly Readonly<{
    token: Readonly<TokenSnapshot>;
    requiredAmount: bigint;
    plan: ApprovalPlan;
  }>[];
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface CLPositionOutcome {
  readonly snapshot: Readonly<CLPoolSnapshot>;
  readonly tokenId: bigint;
  readonly forecast: Readonly<CLPositionForecast>;
  /** Actual spend, principal credited, or collection paid, according to forecast.kind. */
  readonly amount0: bigint;
  readonly amount1: bigint;
  readonly walletDelta0: bigint;
  readonly walletDelta1: bigint;
  readonly gasFee: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledCLPosition {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<CLPositionOutcome>;
}
export interface CLPositionWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly key: CLPoolKey;
    readonly action: CLPositionAction;
    readonly bounds: CLPositionBounds;
  }): Promise<Readonly<PreparedCLPosition>>;
  simulate(prepared: PreparedCLPosition): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedCLPosition,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedCLPosition, record: unknown): Promise<Readonly<ReconciledCLPosition>>;
}
const codec = createAbiCodec();
function operation(snapshot: CLPoolSnapshot, action: CLPositionAction) {
  return resolveOperation({
    ...snapshot.coordinate,
    contractId: snapshot.manager.contractId,
    functionName:
      action.kind === "increase"
        ? "increaseLiquidity"
        : action.kind === "decrease"
          ? "decreaseLiquidity"
          : action.kind,
  }).functionAbi;
}
function data(snapshot: CLPoolSnapshot, action: CLPositionAction, bounds: CLPositionBounds) {
  let args: readonly AbiValue[];
  switch (action.kind) {
    case "mint":
      args = [
        [
          snapshot.key.token0,
          snapshot.key.token1,
          BigInt(snapshot.key.tickSpacing),
          BigInt(action.tickLower),
          BigInt(action.tickUpper),
          action.amount0Desired,
          action.amount1Desired,
          bounds.minAmount0,
          bounds.minAmount1,
          snapshot.account,
          bounds.deadline,
          0n,
        ],
      ];
      break;
    case "increase":
      args = [
        [
          action.tokenId,
          action.amount0Desired,
          action.amount1Desired,
          bounds.minAmount0,
          bounds.minAmount1,
          bounds.deadline,
        ],
      ];
      break;
    case "decrease":
      args = [
        [action.tokenId, action.liquidity, bounds.minAmount0, bounds.minAmount1, bounds.deadline],
      ];
      break;
    case "collect":
      args = [[action.tokenId, snapshot.account, action.amount0Max, action.amount1Max]];
      break;
    case "burn":
      args = [action.tokenId];
      break;
  }
  return codec.encodeFunction(operation(snapshot, action), args);
}
function approvals(snapshot: CLPoolSnapshot, action: CLPositionAction) {
  if (action.kind !== "mint" && action.kind !== "increase") return Object.freeze([]);
  return Object.freeze(
    [snapshot.token0, snapshot.token1].map((token, i) => {
      const requiredAmount = i === 0 ? action.amount0Desired : action.amount1Desired;
      return Object.freeze({
        token,
        requiredAmount,
        plan: planApproval({ allowance: token.allowance, requiredAmount }),
      });
    }),
  );
}
function validateOutput(
  snapshot: CLPoolSnapshot,
  action: CLPositionAction,
  forecast: CLPositionForecast,
  bounds: CLPositionBounds,
  output: `0x${string}`,
) {
  const decoded = codec.decodeFunction(operation(snapshot, action), output);
  let values = decoded;
  if (action.kind === "mint") {
    poolRequire(parseUint(values[0]) > 0n, "IdentityMismatch", "CL mint simulation NFT id missing");
    values = values.slice(1);
  }
  if (action.kind === "mint" || action.kind === "increase") {
    poolRequire(
      parseUint(values[0], 128) === forecast.liquidityDelta,
      "IdentityMismatch",
      "CL simulation liquidity differs",
    );
    values = values.slice(1);
  }
  if (action.kind === "burn") {
    poolRequire(decoded.length === 0, "IdentityMismatch", "CL burn output differs");
    return;
  }
  const amount0 = parseUint(values[0]),
    amount1 = parseUint(values[1]);
  poolRequire(
    values.length === 2 &&
      amount0 >= bounds.minAmount0 &&
      amount1 >= bounds.minAmount1 &&
      (action.kind === "collect"
        ? amount0 <= forecast.amount0 && amount1 <= forecast.amount1
        : amount0 === forecast.amount0 && amount1 === forecast.amount1),
    "BoundExceeded",
    "CL exact simulation amounts differ",
  );
}
export function createCLPositionWriter(config: {
  readonly reader: CLPoolReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<CLPositionWriter> {
  const owned = new WeakSet<PreparedCLPosition>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedCLPosition>();
  const own = (prepared: PreparedCLPosition) => {
    poolRequire(owned.has(prepared), "InvalidInput", "prepare with this CL writer");
  };
  async function read(
    prepared: PreparedCLPosition,
    blockNumber?: bigint,
    tokenIds?: readonly bigint[],
  ) {
    return config.reader.read({
      account: prepared.snapshot.account,
      key: prepared.snapshot.key,
      tokenIds: tokenIds ?? (prepared.action.kind === "mint" ? [] : [prepared.action.tokenId]),
      ticks: [prepared.forecast.tickLower, prepared.forecast.tickUpper],
      ...(blockNumber === undefined ? {} : { blockNumber }),
    });
  }
  async function fresh(prepared: PreparedCLPosition, blockNumber?: bigint) {
    const snapshot = await read(prepared, blockNumber),
      age = snapshot.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber,
      forecast = forecastCLPosition({ snapshot, action: prepared.action, bounds: prepared.bounds });
    poolRequire(
      age >= 0n &&
        age <= prepared.bounds.maxBlockAge &&
        snapshot.coordinate.chainId === prepared.snapshot.coordinate.chainId &&
        snapshot.coordinate.networkId === prepared.snapshot.coordinate.networkId &&
        snapshot.pool === prepared.snapshot.pool &&
        snapshot.manager.address === prepared.transaction.to &&
        snapshot.manager.contractId === prepared.transaction.contractId &&
        snapshot.factory.address === prepared.snapshot.factory.address &&
        snapshot.account === prepared.transaction.from &&
        data(snapshot, prepared.action, prepared.bounds) === prepared.transaction.data,
      "BoundExceeded",
      "CL execution identity, call or age changed",
    );
    poolRequire(
      approvals(snapshot, prepared.action).every((row) => row.plan.kind === "sufficient"),
      "BoundExceeded",
      "CL approvals must be confirmed before simulation",
    );
    return { snapshot, forecast };
  }
  return Object.freeze({
    async prepare(input) {
      poolRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const action = Object.freeze({ ...input.action }),
        bounds = Object.freeze({ ...input.bounds });
      clBounds(bounds);
      const snapshot = await config.reader.read({
          key: input.key,
          account: input.account,
          tokenIds: action.kind === "mint" ? [] : [action.tokenId],
          ticks: action.kind === "mint" ? [action.tickLower, action.tickUpper] : [],
        }),
        forecast = forecastCLPosition({ snapshot, action, bounds }),
        transaction: Readonly<PreparedTransaction> = Object.freeze({
          operationId: input.operationId,
          contractId: snapshot.manager.contractId,
          coordinate: snapshot.coordinate,
          from: snapshot.account,
          to: snapshot.manager.address,
          value: 0n,
          data: data(snapshot, action, bounds),
        });
      const prepared = Object.freeze({
        snapshot,
        action,
        bounds,
        forecast,
        transaction,
        approvals: approvals(snapshot, action),
      });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      own(prepared);
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (output, coordinate) => {
          const { snapshot, forecast } = await fresh(prepared, coordinate.blockNumber);
          poolRequire(
            snapshot.coordinate.blockHash === coordinate.blockHash &&
              snapshot.coordinate.chainId === coordinate.chainId &&
              snapshot.coordinate.networkId === coordinate.networkId,
            "IdentityMismatch",
            "CL simulation coordinate differs",
          );
          validateOutput(snapshot, prepared.action, forecast, prepared.bounds, output);
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      own(prepared);
      poolRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "CL simulation belongs to another preparation",
      );
      return config.execution.submit(simulated, async () => {
        await fresh(prepared);
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        initial = prepared.snapshot,
        call = prepared.transaction;
      clBounds(prepared.bounds);
      poolRequire(
        record.operationId === call.operationId &&
          record.contractId === initial.manager.contractId &&
          call.contractId === record.contractId &&
          record.targetRole === undefined &&
          call.targetRole === undefined &&
          record.call.from === call.from &&
          call.from === initial.account &&
          record.call.to === call.to &&
          call.to === initial.manager.address &&
          record.call.data === call.data &&
          call.data === data(initial, prepared.action, prepared.bounds) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          record.networkId === call.coordinate.networkId &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "CL persisted intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        poolRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "CL receipt predecessor required",
        );
        const tokenId = clReceiptTokenId({ snapshot: initial, action: prepared.action, receipt });
        const [before, after, raw] = await Promise.all([
          read(prepared, receipt.blockNumber - 1n),
          read(prepared, receipt.blockNumber, prepared.action.kind === "burn" ? [] : [tokenId]),
          config.transport.getReceipt(receipt.transactionHash),
        ]);
        poolRequire(
          before.manager.address === call.to &&
            before.pool === initial.pool &&
            before.factory.address === initial.factory.address,
          "ReconciliationMismatch",
          "CL settlement generation differs",
        );
        const gasFee = getReceiptExecutionFee({ receipt, raw, from: call.from, to: call.to }),
          result = verifyCLPositionSettlement({
            before,
            after,
            action: prepared.action,
            tokenId,
            receipt,
            gasFee,
          }),
          age = before.coordinate.blockNumber - initial.coordinate.blockNumber;
        return Object.freeze({
          ...result,
          snapshot: after,
          tokenId,
          gasFee,
          boundsSatisfied:
            result.amount0 >= prepared.bounds.minAmount0 &&
            result.amount1 >= prepared.bounds.minAmount1 &&
            (result.forecast.liquidityDelta > 0n
              ? result.forecast.liquidityDelta >= prepared.bounds.minLiquidity
              : prepared.bounds.minLiquidity === 0n) &&
            after.timestamp <= prepared.bounds.deadline &&
            after.sqrtPriceX96 >= prepared.bounds.sqrtPriceMinX96 &&
            after.sqrtPriceX96 <= prepared.bounds.sqrtPriceMaxX96 &&
            age >= 0n &&
            age <= prepared.bounds.maxBlockAge,
        });
      });
    },
  } satisfies CLPositionWriter);
}
