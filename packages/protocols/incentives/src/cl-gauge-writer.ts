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
import { forecastCLGauge } from "./cl-gauge-math.ts";
import { verifyCLGaugeSettlement } from "./cl-gauge-settlement.ts";
import type {
  CLGaugeAction,
  CLGaugeBounds,
  CLGaugeForecast,
  CLGaugeReader,
  CLGaugeState,
} from "./cl-gauge-types.ts";
export interface PreparedCLGauge {
  readonly snapshot: Readonly<CLGaugeState>;
  readonly action: CLGaugeAction;
  readonly bounds: Readonly<CLGaugeBounds>;
  readonly forecast: Readonly<CLGaugeForecast>;
  readonly approvalRequired: boolean;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface CLGaugeOutcome {
  readonly snapshot: Readonly<CLGaugeState>;
  readonly forecast: Readonly<CLGaugeForecast>;
  readonly reward: bigint;
  readonly fee0: bigint;
  readonly fee1: bigint;
  readonly gasFee: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledCLGauge {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<CLGaugeOutcome>;
}
export interface CLGaugeWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly tokenId: bigint;
    readonly action: CLGaugeAction;
    readonly bounds: CLGaugeBounds;
  }): Promise<Readonly<PreparedCLGauge>>;
  simulate(prepared: PreparedCLGauge): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedCLGauge,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedCLGauge, record: unknown): Promise<Readonly<ReconciledCLGauge>>;
}
const codec = createAbiCodec();
function transactionData(s: CLGaugeState, action: CLGaugeAction) {
  const contract = action === "approve" ? s.pool.manager : s.contract;
  const abi = resolveOperation({
    ...s.pool.coordinate,
    contractId: contract.contractId,
    functionName:
      action === "approve"
        ? "approve"
        : action === "stake"
          ? "deposit"
          : action === "unstake"
            ? "withdraw"
            : "getReward",
    inputTypes: action === "approve" ? ["address", "uint256"] : ["uint256"],
  }).functionAbi;
  return codec.encodeFunction(
    abi,
    action === "approve" ? [s.gauge, s.position.tokenId] : [s.position.tokenId],
  );
}
function checkBounds(bounds: CLGaugeBounds) {
  for (const value of [bounds.minReward, bounds.minFee0, bounds.minFee1, bounds.maxBlockAge])
    parseUint(value);
}
function bounded(s: CLGaugeState, action: CLGaugeAction, bounds: CLGaugeBounds) {
  checkBounds(bounds);
  const forecast = forecastCLGauge({ snapshot: s, action });
  incentiveRequire(
    forecast.reward >= bounds.minReward &&
      forecast.feeCap0 >= bounds.minFee0 &&
      forecast.feeCap1 >= bounds.minFee1,
    "BoundExceeded",
    "CL gauge payout below minimum",
  );
  incentiveRequire(
    (forecast.reward > 0n ? bounds.minReward > 0n : bounds.minReward === 0n) &&
      (forecast.feeCap0 > 0n ? bounds.minFee0 > 0n : bounds.minFee0 === 0n) &&
      (forecast.feeCap1 > 0n ? bounds.minFee1 > 0n : bounds.minFee1 === 0n),
    "InvalidInput",
    "explicit positive minimum for expected CL gauge payout required",
  );
  if (action === "approve")
    incentiveRequire(!s.gaugeApproved, "IneligibleOperation", "CL gauge already approved");
  return forecast;
}
export function createCLGaugeWriter(config: {
  readonly reader: CLGaugeReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<CLGaugeWriter> {
  const owned = new WeakSet<PreparedCLGauge>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedCLGauge>();
  const own = (p: PreparedCLGauge) => {
    incentiveRequire(owned.has(p), "InvalidInput", "prepare with this CL gauge writer");
  };
  const read = (p: PreparedCLGauge, blockNumber?: bigint) =>
    config.reader.read({
      account: p.snapshot.pool.account,
      tokenId: p.snapshot.position.tokenId,
      ...(blockNumber === undefined ? {} : { blockNumber }),
    });
  async function fresh(p: PreparedCLGauge, blockNumber?: bigint) {
    const s = await read(p, blockNumber),
      age = s.pool.coordinate.blockNumber - p.snapshot.pool.coordinate.blockNumber;
    bounded(s, p.action, p.bounds);
    incentiveRequire(
      age >= 0n &&
        age <= p.bounds.maxBlockAge &&
        s.pool.coordinate.chainId === p.snapshot.pool.coordinate.chainId &&
        s.pool.coordinate.networkId === p.snapshot.pool.coordinate.networkId &&
        s.pool.pool === p.snapshot.pool.pool &&
        s.pool.manager.address === p.snapshot.pool.manager.address &&
        s.contract.address === p.snapshot.contract.address &&
        s.gauge === p.snapshot.gauge &&
        s.pool.account === p.transaction.from &&
        transactionData(s, p.action) === p.transaction.data,
      "BoundExceeded",
      "CL gauge identity, call or age changed",
    );
    incentiveRequire(
      p.action !== "stake" || s.gaugeApproved,
      "ApprovalRequired",
      "confirm NFT approval and reprepare CL stake",
    );
    return s;
  }
  return Object.freeze({
    async prepare(input) {
      incentiveRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const bounds = Object.freeze({ ...input.bounds }),
        action = input.action;
      checkBounds(bounds);
      const snapshot = await config.reader.read({ account: input.account, tokenId: input.tokenId }),
        forecast = bounded(snapshot, action, bounds),
        approving = action === "approve";
      const transaction: Readonly<PreparedTransaction> = Object.freeze({
        operationId: input.operationId,
        contractId: approving ? snapshot.pool.manager.contractId : snapshot.contract.contractId,
        coordinate: snapshot.pool.coordinate,
        from: snapshot.pool.account,
        to: approving ? snapshot.pool.manager.address : snapshot.gauge,
        value: 0n,
        data: transactionData(snapshot, action),
        ...(approving ? {} : { targetRole: "cl-gauge" }),
      });
      const prepared = Object.freeze({
        snapshot,
        action,
        bounds,
        forecast,
        approvalRequired: action === "stake" && !snapshot.gaugeApproved,
        transaction,
      });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      own(prepared);
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (output, coordinate) => {
          const s = await fresh(prepared, coordinate.blockNumber);
          incentiveRequire(
            output === "0x" &&
              s.pool.coordinate.blockHash === coordinate.blockHash &&
              s.pool.coordinate.chainId === coordinate.chainId &&
              s.pool.coordinate.networkId === coordinate.networkId,
            "IdentityMismatch",
            "CL gauge void output or simulation coordinate differs",
          );
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      own(prepared);
      incentiveRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "CL gauge simulation belongs to another preparation",
      );
      return config.execution.submit(simulated, async () => {
        await fresh(prepared);
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        s = prepared.snapshot,
        call = prepared.transaction,
        approving = prepared.action === "approve";
      checkBounds(prepared.bounds);
      incentiveRequire(
        record.operationId === call.operationId &&
          call.contractId === (approving ? s.pool.manager.contractId : s.contract.contractId) &&
          record.contractId === call.contractId &&
          call.targetRole === (approving ? undefined : "cl-gauge") &&
          record.targetRole === call.targetRole &&
          call.from === s.pool.account &&
          record.call.from === call.from &&
          call.to === (approving ? s.pool.manager.address : s.gauge) &&
          record.call.to === call.to &&
          record.call.data === call.data &&
          call.data === transactionData(s, prepared.action) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          record.networkId === call.coordinate.networkId &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "CL gauge persisted intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        incentiveRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "CL gauge receipt predecessor required",
        );
        const [before, after, raw] = await Promise.all([
          read(prepared, receipt.blockNumber - 1n),
          read(prepared, receipt.blockNumber),
          config.transport.getReceipt(receipt.transactionHash),
        ]);
        incentiveRequire(
          before.gauge === s.gauge &&
            before.pool.manager.address === s.pool.manager.address &&
            before.pool.pool === s.pool.pool,
          "ReconciliationMismatch",
          "CL gauge settlement generation changed",
        );
        const gasFee = getReceiptExecutionFee({ receipt, raw, from: call.from, to: call.to }),
          result = verifyCLGaugeSettlement({
            before,
            after,
            action: prepared.action,
            receipt,
            gasFee,
          }),
          age = before.pool.coordinate.blockNumber - s.pool.coordinate.blockNumber;
        return Object.freeze({
          ...result,
          snapshot: after,
          gasFee,
          boundsSatisfied:
            result.reward >= prepared.bounds.minReward &&
            result.fee0 >= prepared.bounds.minFee0 &&
            result.fee1 >= prepared.bounds.minFee1 &&
            age >= 0n &&
            age <= prepared.bounds.maxBlockAge,
        });
      });
    },
  } satisfies CLGaugeWriter);
}
