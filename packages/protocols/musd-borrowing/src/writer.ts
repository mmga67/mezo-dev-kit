import { resolveOperation } from "@mezo-dev-kit/contracts";
import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { parseSubmissionRecord } from "@mezo-dev-kit/core";
import type { ExecutionReceipt, SimulatedTransaction } from "@mezo-dev-kit/core";
import { decodeEventLog, encodeFunctionData, parseAddress, parseHash32 } from "@mezo-dev-kit/evm";
import type { AbiScalar } from "@mezo-dev-kit/evm";
import { BorrowingError } from "./errors.ts";
import { verifyBorrowingUpdate } from "./reconciliation.ts";
import { forecastBorrowing } from "./forecast.ts";
import { calculateCollateralRatio, uint } from "./math.ts";
import type {
  BorrowingAction,
  BorrowingHints,
  BorrowingWriterConfig,
  BorrowingWriter,
  PreparedBorrowing,
} from "./types.ts";

function operation(action: BorrowingAction, hints: BorrowingHints | null) {
  const pair: readonly AbiScalar[] = hints ? [hints.upper, hints.lower] : [];
  switch (action.kind) {
    case "open":
      return { name: "openTrove", value: action.collateral, args: [action.borrow, ...pair] };
    case "add-collateral":
      return { name: "addColl", value: action.collateral, args: pair };
    case "withdraw-collateral":
      return { name: "withdrawColl", value: 0n, args: [action.collateral, ...pair] };
    case "borrow":
      return { name: "withdrawMUSD", value: 0n, args: [action.amount, ...pair] };
    case "repay":
      return { name: "repayMUSD", value: 0n, args: [action.amount, ...pair] };
    case "adjust":
      return {
        name: "adjustTrove",
        value: action.depositCollateral,
        args: [action.withdrawCollateral, action.debtChange, action.increaseDebt, ...pair],
      };
    case "close":
      return { name: "closeTrove", value: 0n, args: [] };
    case "refinance":
      return { name: "refinance", value: 0n, args: pair };
    case "claim-surplus":
      return { name: "claimCollateral", value: 0n, args: [] };
  }
}

export function createBorrowingWriter(config: BorrowingWriterConfig): Readonly<BorrowingWriter> {
  const preparedOperations = new WeakSet<PreparedBorrowing>();
  const simulatedOperations = new WeakMap<SimulatedTransaction, PreparedBorrowing>();
  async function prepare(
    input: Parameters<BorrowingWriter["prepare"]>[0],
  ): Promise<Readonly<PreparedBorrowing>> {
    if (typeof input.operationId !== "string" || input.operationId.length === 0)
      throw new BorrowingError("InvalidInput", "operationId is required");
    const account = parseAddress(input.account);
    const action = Object.freeze(structuredClone(input.action));
    const bounds = Object.freeze(structuredClone(input.bounds));
    const snapshot = await config.reader.read({ account });
    const forecast = forecastBorrowing(snapshot, action, bounds);
    const hints =
      action.kind === "close" || action.kind === "claim-surplus"
        ? null
        : await config.reader.hints({
            snapshot,
            nominalRatio: forecast.nicr,
            trials: input.trials,
            seed: input.seed,
          });
    const call = operation(action, hints);
    const resolved = resolveOperation({
      contractId: "musd.borrower-operations",
      networkId: snapshot.coordinate.networkId,
      blockNumber: snapshot.coordinate.blockNumber,
      functionName: call.name,
    });
    const transaction = Object.freeze({
      operationId: input.operationId,
      contractId: resolved.contract.contractId,
      coordinate: snapshot.coordinate,
      from: account,
      to: resolved.contract.address,
      value: call.value,
      data: encodeFunctionData(resolved.functionAbi, call.args),
    });
    const prepared = Object.freeze({ snapshot, action, bounds, forecast, hints, transaction });
    preparedOperations.add(prepared);
    return prepared;
  }
  function owned(prepared: PreparedBorrowing): void {
    if (!preparedOperations.has(prepared))
      throw new BorrowingError(
        "InvalidInput",
        "prepare this operation with this writer before simulation/submission",
      );
  }
  async function simulate(prepared: PreparedBorrowing) {
    owned(prepared);
    const result = await config.execution.simulate(prepared.transaction);
    simulatedOperations.set(result, prepared);
    return result;
  }
  async function submit(prepared: PreparedBorrowing, simulated: SimulatedTransaction) {
    owned(prepared);
    if (simulatedOperations.get(simulated) !== prepared)
      throw new BorrowingError(
        "InvalidInput",
        "simulation belongs to a different borrowing operation",
      );
    return config.execution.submit(simulated, async () => {
      const fresh = await config.reader.read({ account: prepared.snapshot.account });
      if (
        fresh.coordinate.blockNumber < prepared.snapshot.coordinate.blockNumber ||
        fresh.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber >
          uint(prepared.bounds.maxBlockAge)
      )
        throw new BorrowingError("StaleState", "borrowing preparation expired");
      forecastBorrowing(fresh, prepared.action, prepared.bounds);
      if (fresh.position.status !== prepared.snapshot.position.status)
        throw new BorrowingError("StaleState", "borrower lifecycle changed since preparation");
    });
  }
  async function reconcile(prepared: PreparedBorrowing, value: unknown) {
    const record = parseSubmissionRecord(value);
    const call = prepared.transaction;
    if (
      record.operationId !== call.operationId ||
      record.call.from !== call.from ||
      record.call.to !== call.to ||
      record.call.data !== call.data ||
      BigInt(record.call.value) !== call.value ||
      BigInt(record.call.chainId) !== call.coordinate.chainId
    )
      throw new BorrowingError(
        "ReconciliationMismatch",
        "record does not match prepared borrowing intent",
      );
    return config.execution.reconcile(record, async (receipt) => {
      const post = await config.reader.read({
        account: prepared.snapshot.account,
        blockNumber: receipt.blockNumber,
      });
      if (post.coordinate.blockHash !== receipt.blockHash)
        throw new BorrowingError("ReconciliationMismatch", "post-state block mismatch");
      const target = post.contracts["borrower-operations"];
      if (!target) throw new BorrowingError("ReconciliationMismatch", "BorrowerOperations missing");
      const kind = prepared.action.kind;
      if (kind === "claim-surplus") {
        const pool = post.contracts["coll-surplus-pool"];
        if (!pool) throw new BorrowingError("ReconciliationMismatch", "surplus pool missing");
        const balance = event(receipt, pool, "CollBalanceUpdated", post.account);
        const transfer = event(receipt, pool, "CollateralSent", post.account);
        if (uint(balance[1]) !== 0n || uint(transfer[1]) === 0n || post.surplus !== 0n)
          throw new BorrowingError("ReconciliationMismatch", "surplus settlement mismatch");
        return Object.freeze({
          kind,
          snapshot: post,
          collateralClaimed: uint(transfer[1]),
          fee: 0n,
          boundsSatisfied: true,
        });
      }
      const update = event(receipt, target, "TroveUpdated", post.account);
      verifyBorrowingUpdate(prepared.action, post.position, update);
      const fee =
        kind === "close"
          ? 0n
          : uint(
              event(
                receipt,
                target,
                kind === "refinance" ? "RefinancingFeePaid" : "BorrowingFeePaid",
                post.account,
              )[1],
            );
      const boundsSatisfied =
        fee <= prepared.bounds.maxFee &&
        (kind === "close" || post.position.annualRateBps <= prepared.bounds.maxAnnualRateBps) &&
        (kind === "close" ||
          calculateCollateralRatio(post.position.collateral, post.position.debt, post.price) >=
            prepared.bounds.minCollateralRatio);
      return Object.freeze({ kind, snapshot: post, fee, collateralClaimed: 0n, boundsSatisfied });
    });
  }
  return Object.freeze({ prepare, simulate, submit, reconcile });
}

function event(
  receipt: ExecutionReceipt,
  contract: ResolvedContract,
  name: string,
  account: `0x${string}`,
): readonly AbiScalar[] {
  const abi = contract.readAbi.find((entry) => entry.type === "event" && entry.name === name);
  if (!abi) throw new BorrowingError("ReconciliationMismatch", `missing event ABI ${name}`);
  const found: (readonly AbiScalar[])[] = [];
  for (const value of receipt.logs) {
    if (!value || typeof value !== "object" || !("address" in value))
      throw new BorrowingError("ReconciliationMismatch", "malformed log");
    if (parseAddress(value.address) !== contract.address) continue;
    if (
      !("data" in value) ||
      !("topics" in value) ||
      !Array.isArray(value.topics) ||
      !("transactionHash" in value) ||
      parseHash32(value.transactionHash) !== receipt.transactionHash ||
      !("blockHash" in value) ||
      parseHash32(value.blockHash) !== receipt.blockHash ||
      !("removed" in value) ||
      value.removed !== false
    )
      throw new BorrowingError("ReconciliationMismatch", "log identity mismatch");
    const decoded = decodeEventLog(abi, { data: value.data, topics: value.topics });
    if (decoded && parseAddress(decoded[0]) === account) found.push(decoded);
  }
  const only = found[0];
  if (found.length !== 1 || !only)
    throw new BorrowingError("ReconciliationMismatch", `expected one ${name} event for borrower`);
  return only;
}
