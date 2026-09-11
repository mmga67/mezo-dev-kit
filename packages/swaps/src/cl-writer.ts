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
import type { CLPoolReader, CLPoolSnapshot } from "@mezo-dev-kit/pools";
import { planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan } from "@mezo-dev-kit/tokens";
import { swapRequire } from "./reader.ts";
import { encodeCLSwapPath, validateCLSwapRoute } from "./cl-reader.ts";
import { verifyCLSwapSettlement } from "./cl-settlement.ts";
import type { CLSwapQuote, CLSwapQuoteInput, CLSwapReader } from "./cl-types.ts";
export interface CLSwapBounds {
  readonly minAmountOut: bigint;
  readonly deadline: bigint;
  readonly maxDeadlineSeconds: bigint;
  readonly maxBlockAge: bigint;
}
export interface PreparedCLSwap {
  readonly quote: Readonly<CLSwapQuote>;
  readonly bounds: Readonly<CLSwapBounds>;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface CLSwapOutcome {
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly pools: readonly Readonly<CLPoolSnapshot>[];
  readonly gasFee: bigint;
  readonly boundsSatisfied: boolean;
}
export interface ReconciledCLSwap {
  readonly state: "reconciled";
  readonly record: SubmissionRecord;
  readonly receipt: ExecutionReceipt;
  readonly outcome: Readonly<CLSwapOutcome>;
}
export interface CLSwapWriter {
  prepare(
    input: Omit<CLSwapQuoteInput, "blockNumber"> & {
      readonly operationId: string;
      readonly bounds: CLSwapBounds;
    },
  ): Promise<Readonly<PreparedCLSwap>>;
  simulate(prepared: PreparedCLSwap): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedCLSwap,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(prepared: PreparedCLSwap, record: unknown): Promise<Readonly<ReconciledCLSwap>>;
}
const codec = createAbiCodec();
function operation(quote: CLSwapQuote) {
  return resolveOperation({
    ...quote.coordinate,
    contractId: quote.router.contractId,
    functionName: quote.route.length === 1 ? "exactInputSingle" : "exactInput",
  }).functionAbi;
}
function data(quote: CLSwapQuote, bounds: CLSwapBounds) {
  const route = validateCLSwapRoute(quote.route, quote.intermediateAssets),
    first = route[0]!;
  const args: readonly AbiValue[] =
    route.length === 1
      ? [
          [
            first.tokenIn,
            first.tokenOut,
            BigInt(first.tickSpacing),
            quote.account,
            bounds.deadline,
            quote.amountIn,
            bounds.minAmountOut,
            0n,
          ],
        ]
      : [
          [
            encodeCLSwapPath(route),
            quote.account,
            bounds.deadline,
            quote.amountIn,
            bounds.minAmountOut,
          ],
        ];
  return codec.encodeFunction(operation(quote), args);
}
function checkBounds(bounds: CLSwapBounds) {
  for (const v of [
    bounds.minAmountOut,
    bounds.deadline,
    bounds.maxDeadlineSeconds,
    bounds.maxBlockAge,
  ])
    parseUint(v);
  swapRequire(
    bounds.minAmountOut > 0n && bounds.maxDeadlineSeconds > 0n,
    "InvalidInput",
    "CL positive output minimum and deadline budget required",
  );
}
function eligible(q: CLSwapQuote, b: CLSwapBounds) {
  checkBounds(b);
  swapRequire(
    q.writeCompatible && q.routerNativeBalance === 0n,
    "UnavailableRoute",
    "CL writer assets or native refund custody differ",
  );
  swapRequire(
    q.amountIn <= q.inputToken.balance &&
      q.estimatedAmountOut >= b.minAmountOut &&
      b.deadline > q.timestamp &&
      b.deadline - q.timestamp <= b.maxDeadlineSeconds,
    "BoundExceeded",
    "CL output, wallet or deadline outside policy",
  );
}
function quoteInput(q: CLSwapQuote, blockNumber?: bigint): CLSwapQuoteInput {
  return {
    route: q.route,
    intermediateAssets: q.intermediateAssets,
    account: q.account,
    amountIn: q.amountIn,
    maxAgeBlocks: q.maxAgeBlocks,
    budget: q.budget,
    ...(blockNumber === undefined ? {} : { blockNumber }),
  };
}
export function createCLSwapWriter(config: {
  readonly reader: CLSwapReader;
  readonly pools: CLPoolReader;
  readonly execution: ExecutionClient;
  readonly transport: RpcTransport;
}): Readonly<CLSwapWriter> {
  const owned = new WeakSet<PreparedCLSwap>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedCLSwap>();
  const own = (p: PreparedCLSwap) => {
    swapRequire(owned.has(p), "InvalidInput", "prepare with this CL swap writer");
  };
  async function fresh(p: PreparedCLSwap, blockNumber?: bigint) {
    const q = await config.reader.quote(quoteInput(p.quote, blockNumber)),
      age = q.coordinate.blockNumber - p.quote.coordinate.blockNumber;
    eligible(q, p.bounds);
    swapRequire(
      age >= 0n &&
        age <= p.bounds.maxBlockAge &&
        age <= p.quote.maxAgeBlocks &&
        q.coordinate.chainId === p.quote.coordinate.chainId &&
        q.coordinate.networkId === p.quote.coordinate.networkId &&
        q.router.address === p.transaction.to &&
        q.router.contractId === p.transaction.contractId &&
        q.account === p.transaction.from &&
        q.pools.every((row, i) => row.snapshot.pool === p.quote.pools[i]?.snapshot.pool) &&
        data(q, p.bounds) === p.transaction.data,
      "BoundExceeded",
      "CL swap identity, call or quote age changed",
    );
    swapRequire(
      planApproval({ allowance: q.inputToken.allowance, requiredAmount: q.amountIn }).kind ===
        "sufficient",
      "ApprovalRequired",
      "confirm CL input approval and reprepare",
    );
    return q;
  }
  return Object.freeze({
    async prepare(input) {
      swapRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const bounds = Object.freeze({ ...input.bounds });
      checkBounds(bounds);
      const quote = await config.reader.quote(input);
      eligible(quote, bounds);
      const transaction = Object.freeze({
          operationId: input.operationId,
          contractId: quote.router.contractId,
          coordinate: quote.coordinate,
          from: quote.account,
          to: quote.router.address,
          value: 0n,
          data: data(quote, bounds),
        }),
        prepared = Object.freeze({
          quote,
          bounds,
          transaction,
          approval: planApproval({
            allowance: quote.inputToken.allowance,
            requiredAmount: quote.amountIn,
          }),
        });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      own(prepared);
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (output, coordinate) => {
          const q = await fresh(prepared, coordinate.blockNumber),
            values = codec.decodeFunction(operation(q), output);
          swapRequire(
            q.coordinate.blockHash === coordinate.blockHash &&
              q.coordinate.chainId === coordinate.chainId &&
              q.coordinate.networkId === coordinate.networkId,
            "InconsistentQuote",
            "CL simulation coordinate differs",
          );
          swapRequire(
            values.length === 1 &&
              parseUint(values[0]) === q.estimatedAmountOut &&
              parseUint(values[0]) >= prepared.bounds.minAmountOut,
            "BoundExceeded",
            "CL exact simulation output differs",
          );
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      own(prepared);
      swapRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "CL swap simulation belongs to another preparation",
      );
      return config.execution.submit(simulated, async () => {
        await fresh(prepared);
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value),
        q = prepared.quote,
        call = prepared.transaction;
      checkBounds(prepared.bounds);
      swapRequire(
        record.operationId === call.operationId &&
          record.contractId === q.router.contractId &&
          call.contractId === record.contractId &&
          record.targetRole === undefined &&
          call.targetRole === undefined &&
          record.call.to === call.to &&
          call.to === q.router.address &&
          record.call.from === call.from &&
          call.from === q.account &&
          record.call.data === call.data &&
          call.data === data(q, prepared.bounds) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          record.networkId === call.coordinate.networkId &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "CL swap persisted intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        swapRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "CL swap receipt predecessor required",
        );
        const before = await config.reader.quote(quoteInput(q, receipt.blockNumber - 1n));
        swapRequire(
          before.writeCompatible &&
            before.router.address === q.router.address &&
            before.pools.every((row, i) => row.snapshot.pool === q.pools[i]?.snapshot.pool),
          "ReconciliationMismatch",
          "CL swap settlement generation differs",
        );
        const after = await Promise.all(
            before.pools.map((row) =>
              config.pools.read({
                account: q.account,
                key: row.snapshot.key,
                blockNumber: receipt.blockNumber,
                ticks: row.crossings.map((t) => t.tick),
              }),
            ),
          ),
          head = after[0];
        swapRequire(head !== undefined, "ReconciliationMismatch", "CL swap post-state missing");
        const raw = await config.transport.getReceipt(receipt.transactionHash),
          gasFee = getReceiptExecutionFee({ receipt, raw, from: call.from, to: call.to }),
          routerNativeBalance = parseUint(
            await config.transport.getBalance(call.to, head.coordinate),
          );
        await verifyCLSwapSettlement({
          quote: before,
          after,
          receipt,
          gasFee,
          routerNativeBalance,
          transport: config.transport,
        });
        const age = before.coordinate.blockNumber - q.coordinate.blockNumber;
        return Object.freeze({
          amountIn: q.amountIn,
          amountOut: before.estimatedAmountOut,
          pools: Object.freeze(after),
          gasFee,
          boundsSatisfied:
            before.estimatedAmountOut >= prepared.bounds.minAmountOut &&
            head.timestamp <= prepared.bounds.deadline &&
            age >= 0n &&
            age <= q.maxAgeBlocks &&
            age <= prepared.bounds.maxBlockAge,
        });
      });
    },
  } satisfies CLSwapWriter);
}
