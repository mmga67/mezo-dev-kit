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
import { calculateBasicSwapFee } from "@mezo-dev-kit/pools";
import type { BasicPoolReader } from "@mezo-dev-kit/pools";
import { decodeTokenTransfers, planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan } from "@mezo-dev-kit/tokens";
import { basicRouteArguments, swapRequire } from "./reader.ts";
import type { BasicSwapQuote, BasicSwapQuoteInput, BasicSwapReader } from "./reader.ts";

export interface BasicSwapBounds {
  readonly amountOutMinimum: bigint;
  readonly deadline: bigint;
  readonly maxDeadlineSeconds: bigint;
}
export interface PreparedBasicSwap {
  readonly quote: Readonly<BasicSwapQuote>;
  readonly bounds: BasicSwapBounds;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface BasicSwapOutcome {
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly amounts: readonly bigint[];
  readonly fees: readonly bigint[];
  readonly coordinate: BasicSwapQuote["coordinate"];
}
export interface BasicSwapWriter {
  prepare(input: {
    readonly operationId: string;
    readonly quote: BasicSwapQuoteInput;
    readonly bounds: BasicSwapBounds;
  }): Promise<Readonly<PreparedBasicSwap>>;
  simulate(prepared: PreparedBasicSwap): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedBasicSwap,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedBasicSwap,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: BasicSwapOutcome;
    }>
  >;
}
const codec = createAbiCodec();
function operation(quote: BasicSwapQuote) {
  return resolveOperation({
    contractId: "mezo-earn.router",
    networkId: quote.coordinate.networkId,
    blockNumber: quote.coordinate.blockNumber,
    functionName: "swapExactTokensForTokens",
  }).functionAbi;
}
function calldata(quote: BasicSwapQuote, bounds: BasicSwapBounds) {
  return codec.encodeFunction(operation(quote), [
    quote.amountIn,
    bounds.amountOutMinimum,
    basicRouteArguments(quote),
    quote.account,
    bounds.deadline,
  ]);
}
function check(quote: BasicSwapQuote, bounds: BasicSwapBounds) {
  parseUint(bounds.amountOutMinimum);
  parseUint(bounds.deadline);
  parseUint(bounds.maxDeadlineSeconds);
  swapRequire(
    quote.writeCompatible === true,
    "UnavailableRoute",
    "route assets are outside current writer compatibility",
  );
  swapRequire(
    bounds.amountOutMinimum > 0n &&
      quote.estimatedAmountOut >= bounds.amountOutMinimum &&
      bounds.deadline > quote.timestamp &&
      bounds.maxDeadlineSeconds > 0n &&
      bounds.deadline - quote.timestamp <= bounds.maxDeadlineSeconds,
    "BoundExceeded",
    "minimum output or bounded future deadline invalid",
  );
  swapRequire(
    quote.inputToken.balance >= quote.amountIn &&
      quote.pools.every(
        (pool) =>
          ![
            pool.pool,
            pool.factory,
            pool.router,
            pool.key.token0,
            pool.key.token1,
            pool.poolFees,
          ].includes(quote.account),
      ),
    "BoundExceeded",
    "insufficient wallet balance or invalid recipient",
  );
}
export function createBasicSwapWriter(config: {
  readonly reader: BasicSwapReader;
  readonly pools: BasicPoolReader;
  readonly execution: ExecutionClient;
}): Readonly<BasicSwapWriter> {
  const owned = new WeakSet<PreparedBasicSwap>(),
    simulations = new WeakMap<SimulatedTransaction, PreparedBasicSwap>();
  function assertOwned(prepared: PreparedBasicSwap) {
    swapRequire(owned.has(prepared), "InvalidInput", "prepare with this swap writer");
  }
  return Object.freeze({
    async prepare(input) {
      swapRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const bounds = Object.freeze(structuredClone(input.bounds)),
        quote = await config.reader.quote(input.quote);
      check(quote, bounds);
      const transaction: PreparedTransaction = Object.freeze({
        operationId: input.operationId,
        contractId: "mezo-earn.router",
        coordinate: quote.coordinate,
        from: quote.account,
        to: quote.router,
        value: 0n,
        data: calldata(quote, bounds),
      });
      const prepared = Object.freeze({
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
      assertOwned(prepared);
      swapRequire(
        prepared.approval.kind === "sufficient",
        "ApprovalRequired",
        "confirm approval and prepare the swap again",
      );
      const simulated = await config.execution.simulate(prepared.transaction, (returnData) => {
        const values = codec.decodeFunction(operation(prepared.quote), returnData),
          raw = values[0];
        swapRequire(
          Array.isArray(raw) && raw.length === prepared.quote.route.length + 1,
          "InconsistentQuote",
          "simulated route amounts differ",
        );
        const amounts = raw.map((value) => parseUint(value));
        swapRequire(
          amounts[0] === prepared.quote.amountIn &&
            amounts.every((amount) => amount > 0n) &&
            amounts.at(-1)! >= prepared.bounds.amountOutMinimum,
          "BoundExceeded",
          "simulated input/output differs from bounds",
        );
      });
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      swapRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "swap simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        const original = prepared.quote;
        const fresh = await config.reader.quote({
          route: original.route,
          intermediateAssets: original.intermediateAssets,
          account: original.account,
          amountIn: original.amountIn,
          maxAgeBlocks: original.maxAgeBlocks,
        });
        check(fresh, prepared.bounds);
        const age = fresh.coordinate.blockNumber - original.coordinate.blockNumber;
        swapRequire(
          age >= 0n &&
            age <= original.maxAgeBlocks &&
            calldata(fresh, prepared.bounds) === prepared.transaction.data &&
            fresh.router === prepared.transaction.to,
          "BoundExceeded",
          "swap quote expired or route changed",
        );
        swapRequire(
          fresh.inputToken.allowance >= fresh.amountIn,
          "ApprovalRequired",
          "swap allowance changed",
        );
      });
    },
    async reconcile(prepared, input) {
      const record = parseSubmissionRecord(input),
        call = prepared.transaction,
        quote = prepared.quote;
      swapRequire(
        record.operationId === call.operationId &&
          record.contractId === "mezo-earn.router" &&
          record.targetRole === undefined &&
          record.call.from === call.from &&
          call.from === quote.account &&
          record.call.to === call.to &&
          call.to === quote.router &&
          record.call.data === call.data &&
          call.data === calldata(quote, prepared.bounds) &&
          BigInt(record.call.value) === 0n &&
          BigInt(record.call.chainId) === quote.coordinate.chainId &&
          BigInt(record.blockNumber) === quote.coordinate.blockNumber &&
          record.blockHash === quote.coordinate.blockHash,
        "ReconciliationMismatch",
        "swap intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        swapRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor unavailable",
        );
        const poolAbi = resolveBasicPoolInterface({
          role: "pool",
          networkId: quote.coordinate.networkId,
        }).abi;
        const swapEvent = poolAbi.find((entry) => entry.type === "event" && entry.name === "Swap"),
          feeEvent = poolAbi.find((entry) => entry.type === "event" && entry.name === "Fees");
        const states = await Promise.all(
          quote.pools.map(async (original) => {
            const read = (blockNumber: bigint) =>
              config.pools.read({ key: original.key, account: quote.account, blockNumber });
            const [before, after] = await Promise.all([
              read(receipt.blockNumber - 1n),
              read(receipt.blockNumber),
            ]);
            swapRequire(
              before.pool === original.pool &&
                after.pool === original.pool &&
                after.coordinate.blockHash === receipt.blockHash &&
                after.writeCompatible &&
                before.writeCompatible &&
                before.poolBalance0 === before.reserve0 &&
                before.poolBalance1 === before.reserve1,
              "ReconciliationMismatch",
              "swap pool generation or prior state differs",
            );
            return { before, after };
          }),
        );
        const amounts = [quote.amountIn],
          fees: bigint[] = [];
        for (let index = 0; index < states.length; index++) {
          const { before, after } = states[index]!,
            hop = quote.route[index]!,
            next = states[index + 1]?.after.pool ?? quote.account;
          const logs = getReceiptLogs(receipt, after.pool),
            rows = logs
              .map((log) => codec.decodeEvent(swapEvent, log))
              .filter((row) => row !== null),
            row = rows[0];
          swapRequire(
            rows.length === 1 && row?.[0] === quote.router && row[1] === next,
            "ReconciliationMismatch",
            "swap event sender, recipient or count differs",
          );
          const in0 = parseUint(row[2]),
            in1 = parseUint(row[3]),
            out0 = parseUint(row[4]),
            out1 = parseUint(row[5]),
            zeroForOne = hop.tokenIn === after.key.token0;
          const amountIn = zeroForOne ? in0 : in1,
            amountOut = zeroForOne ? out1 : out0;
          swapRequire(
            amountIn === amounts[index] &&
              amountOut > 0n &&
              (zeroForOne ? in1 === 0n && out0 === 0n : in0 === 0n && out1 === 0n),
            "ReconciliationMismatch",
            "swap asset direction or amount differs",
          );
          const feeRows = logs
            .map((log) => codec.decodeEvent(feeEvent, log))
            .filter((value) => value !== null);
          let fee0 = 0n,
            fee1 = 0n;
          for (const feeRow of feeRows) {
            swapRequire(
              feeRow[0] === quote.router,
              "ReconciliationMismatch",
              "swap fee sender differs",
            );
            fee0 += parseUint(feeRow[1]);
            fee1 += parseUint(feeRow[2]);
          }
          const fee = calculateBasicSwapFee({ amountIn, feeBps: before.feeBps });
          swapRequire(
            feeRows.length === (fee === 0n ? 0 : 1) &&
              (zeroForOne ? fee0 === fee && fee1 === 0n : fee1 === fee && fee0 === 0n),
            "ReconciliationMismatch",
            "swap fee differs from pool policy",
          );
          if (fee > 0n)
            swapRequire(
              decodeTokenTransfers(receipt, hop.tokenIn).filter(
                (transfer) =>
                  transfer.from === after.pool &&
                  transfer.to === after.poolFees &&
                  transfer.amount === fee,
              ).length === 1,
              "ReconciliationMismatch",
              "pool fee movement differs",
            );
          swapRequire(
            decodeTokenTransfers(receipt, hop.tokenOut).filter(
              (transfer) =>
                transfer.from === after.pool &&
                transfer.to === next &&
                transfer.amount === amountOut,
            ).length === 1,
            "ReconciliationMismatch",
            "route output movement differs",
          );
          swapRequire(
            after.reserve0 === before.reserve0 + in0 - out0 - fee0 &&
              after.reserve1 === before.reserve1 + in1 - out1 - fee1 &&
              after.poolBalance0 === after.reserve0 &&
              after.poolBalance1 === after.reserve1 &&
              after.totalSupply === before.totalSupply &&
              after.lp.balance === before.lp.balance,
            "ReconciliationMismatch",
            "swap event and pool state changes differ",
          );
          amounts.push(amountOut);
          fees.push(fee);
        }
        const amountOut = amounts.at(-1)!;
        swapRequire(
          amountOut >= prepared.bounds.amountOutMinimum,
          "ReconciliationMismatch",
          "received amount below minimum",
        );
        const first = states[0]!,
          last = states.at(-1)!;
        const tokenIn = quote.route[0]!.tokenIn,
          tokenOut = quote.route.at(-1)!.tokenOut;
        const inputTransfers = decodeTokenTransfers(receipt, tokenIn).filter(
            (transfer) => transfer.from === quote.account || transfer.to === quote.account,
          ),
          outputTransfers = decodeTokenTransfers(receipt, tokenOut).filter(
            (transfer) => transfer.from === quote.account || transfer.to === quote.account,
          );
        swapRequire(
          inputTransfers.length === 1 &&
            inputTransfers[0]?.from === quote.account &&
            inputTransfers[0]?.to === first.after.pool &&
            inputTransfers[0]?.amount === quote.amountIn &&
            outputTransfers.length === 1 &&
            outputTransfers[0]?.from === last.after.pool &&
            outputTransfers[0]?.to === quote.account &&
            outputTransfers[0]?.amount === amountOut,
          "ReconciliationMismatch",
          "swap wallet transfers differ",
        );
        const beforeInput =
            tokenIn === first.before.key.token0 ? first.before.token0 : first.before.token1,
          afterInput = tokenIn === first.after.key.token0 ? first.after.token0 : first.after.token1;
        const beforeOutput =
            tokenOut === last.before.key.token0 ? last.before.token0 : last.before.token1,
          afterOutput = tokenOut === last.after.key.token0 ? last.after.token0 : last.after.token1;
        swapRequire(
          beforeInput.balance - afterInput.balance === quote.amountIn &&
            afterOutput.balance - beforeOutput.balance === amountOut,
          "ReconciliationMismatch",
          "swap wallet balances differ from receipt",
        );
        return Object.freeze({
          amountIn: quote.amountIn,
          amountOut,
          amounts: Object.freeze(amounts),
          fees: Object.freeze(fees),
          coordinate: first.after.coordinate,
        });
      });
    },
  } satisfies BasicSwapWriter);
}
