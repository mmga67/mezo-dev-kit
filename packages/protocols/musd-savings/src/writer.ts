import { resolveOperation } from "@mezo-dev-kit/contracts";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord, verifyContractRuntime } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  PreparedTransaction,
  SimulatedTransaction,
  SubmissionRecord,
  ExecutionReceipt,
  RpcTransport,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import { createTokenReader, planApproval, decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import type { TokenSnapshot, ApprovalPlan } from "@mezo-dev-kit/tokens";
import type { SavingsReader, SavingsSnapshot, SavingsReadValue } from "./types.ts";

export type SavingsAction =
  Readonly<{ kind: "deposit" | "withdraw"; amount: bigint }> | Readonly<{ kind: "claim-yield" }>;
export interface SavingsBounds {
  readonly maxBlockAge: bigint;
  readonly minYield: bigint;
}
export interface PreparedSavings {
  readonly snapshot: Readonly<SavingsSnapshot>;
  readonly action: SavingsAction;
  readonly bounds: SavingsBounds;
  readonly token: Readonly<TokenSnapshot>;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface SavingsOutcome {
  readonly kind: SavingsAction["kind"];
  readonly principal: bigint;
  readonly yieldPaid: bigint;
  readonly boundsSatisfied: boolean;
  readonly snapshot: Readonly<SavingsSnapshot>;
}
export type SavingsWriteErrorCode =
  | "InvalidInput"
  | "UnavailableState"
  | "InsufficientBalance"
  | "ApprovalRequired"
  | "StaleState"
  | "ReconciliationMismatch";
export class SavingsWriteError extends Error {
  readonly code: SavingsWriteErrorCode;
  constructor(code: SavingsWriteErrorCode, message: string) {
    super(message);
    this.name = "SavingsWriteError";
    this.code = code;
  }
}
export interface SavingsWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: SavingsAction;
    readonly bounds: SavingsBounds;
  }): Promise<Readonly<PreparedSavings>>;
  simulate(prepared: PreparedSavings): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedSavings,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedSavings,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: SavingsOutcome;
    }>
  >;
}
function required<T>(value: SavingsReadValue<T>): Readonly<T> {
  if (value.status !== "available")
    throw new SavingsWriteError("UnavailableState", "required Savings state unavailable");
  return value.value;
}
const zero = `0x${"0".repeat(40)}` as const;
export function createSavingsWriter(config: {
  readonly reader: SavingsReader;
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
  readonly execution: ExecutionClient;
}): Readonly<SavingsWriter> {
  const codec = createAbiCodec();
  const tokens = createTokenReader(config);
  const preparedSet = new WeakSet<PreparedSavings>();
  const simulations = new WeakMap<SimulatedTransaction, PreparedSavings>();
  function validate(
    snapshot: SavingsSnapshot,
    action: SavingsAction,
    bounds: SavingsBounds,
    token: TokenSnapshot,
  ) {
    const wallet = required(snapshot.wallet);
    required(snapshot.strategy);
    required(snapshot.converter);
    if (parseUint(bounds.maxBlockAge) === 0n)
      throw new SavingsWriteError("InvalidInput", "positive maxBlockAge required");
    const minYield = parseUint(bounds.minYield);
    if (action.kind !== "deposit" && action.kind !== "withdraw" && action.kind !== "claim-yield")
      throw new SavingsWriteError("InvalidInput", "unknown Savings action");
    if (action.kind === "claim-yield") {
      if (wallet.yield.claimable.baseUnits === 0n || wallet.yield.claimable.baseUnits < minYield)
        throw new SavingsWriteError("InsufficientBalance", "claimable yield below minimum");
    } else {
      const amount = parseUint(action.amount);
      if (amount === 0n) throw new SavingsWriteError("InvalidInput", "positive amount required");
      if (action.kind === "deposit") {
        if (minYield !== 0n)
          throw new SavingsWriteError("InvalidInput", "deposit does not pay yield");
        if (token.balance < amount)
          throw new SavingsWriteError("InsufficientBalance", "insufficient MUSD");
        parseUint(snapshot.global.principalSupply.baseUnits + amount);
      } else if (
        wallet.principalReceipts.baseUnits < amount ||
        wallet.yield.claimable.baseUnits < minYield
      )
        throw new SavingsWriteError("InsufficientBalance", "insufficient wallet receipts or yield");
    }
  }
  async function tokenState(snapshot: SavingsSnapshot) {
    const token = config.registry.resolve({
      contractId: "musd.token",
      networkId: snapshot.coordinate.networkId,
      blockNumber: snapshot.coordinate.blockNumber,
    });
    await verifyContractRuntime({
      contract: config.registry.resolve({
        contractId: "musd.savings-rate",
        networkId: snapshot.coordinate.networkId,
        blockNumber: snapshot.coordinate.blockNumber,
      }),
      transport: config.transport,
      coordinate: snapshot.coordinate,
    });
    return tokens.read({
      target: { contractId: token.contractId, address: token.address },
      account: snapshot.account,
      spender: snapshot.savings,
      coordinate: snapshot.coordinate,
    });
  }
  function owned(prepared: PreparedSavings) {
    if (!preparedSet.has(prepared))
      throw new SavingsWriteError("InvalidInput", "prepare with this writer");
  }
  return Object.freeze({
    async prepare(input) {
      if (typeof input.operationId !== "string" || input.operationId.length === 0)
        throw new SavingsWriteError("InvalidInput", "operationId required");
      const account = parseAddress(input.account);
      const action = Object.freeze(structuredClone(input.action));
      const bounds = Object.freeze(structuredClone(input.bounds));
      const snapshot = await config.reader.read({ account });
      const token = await tokenState(snapshot);
      validate(snapshot, action, bounds, token);
      const method = resolveOperation({
        contractId: "musd.savings-rate",
        networkId: snapshot.coordinate.networkId,
        blockNumber: snapshot.coordinate.blockNumber,
        functionName: action.kind === "claim-yield" ? "claimYield" : action.kind,
      });
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: method.contract.contractId,
        coordinate: snapshot.coordinate,
        from: account,
        to: snapshot.savings,
        value: 0n,
        data: codec.encodeFunction(
          method.functionAbi,
          action.kind === "claim-yield" ? [] : [action.amount],
        ),
      });
      const approval = planApproval({
        allowance: token.allowance,
        requiredAmount: action.kind === "deposit" ? action.amount : 0n,
      });
      const result = Object.freeze({ snapshot, token, action, bounds, approval, transaction });
      preparedSet.add(result);
      return result;
    },
    async simulate(prepared) {
      owned(prepared);
      if (prepared.approval.kind !== "sufficient")
        throw new SavingsWriteError(
          "ApprovalRequired",
          "reconcile the separate approval and prepare Savings again",
        );
      const simulated = await config.execution.simulate(prepared.transaction);
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      owned(prepared);
      if (simulations.get(simulated) !== prepared)
        throw new SavingsWriteError("InvalidInput", "simulation mismatch");
      return config.execution.submit(simulated, async () => {
        const snapshot = await config.reader.read({ account: prepared.snapshot.account });
        const age = snapshot.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        if (age < 0n || age > prepared.bounds.maxBlockAge)
          throw new SavingsWriteError("StaleState", "Savings quote expired");
        const token = await tokenState(snapshot);
        validate(snapshot, prepared.action, prepared.bounds, token);
        if (prepared.action.kind === "deposit" && token.allowance < prepared.action.amount)
          throw new SavingsWriteError("ApprovalRequired", "allowance changed before deposit");
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value);
      const call = prepared.transaction;
      if (
        record.operationId !== call.operationId ||
        record.contractId !== call.contractId ||
        record.targetRole !== undefined ||
        record.call.from !== call.from ||
        record.call.to !== call.to ||
        record.call.data !== call.data ||
        BigInt(record.call.value) !== 0n ||
        BigInt(record.call.chainId) !== call.coordinate.chainId
      )
        throw new SavingsWriteError("ReconciliationMismatch", "Savings intent differs");
      return config.execution.reconcile(record, async (receipt) => {
        const snapshot = await config.reader.read({
          account: call.from,
          blockNumber: receipt.blockNumber,
        });
        if (snapshot.coordinate.blockHash !== receipt.blockHash)
          throw new SavingsWriteError("ReconciliationMismatch", "post-state block differs");
        const contract = config.registry.resolve({
          contractId: call.contractId,
          networkId: snapshot.coordinate.networkId,
          blockNumber: receipt.blockNumber,
        });
        function events(name: string) {
          const abi = contract.readAbi.find(
            (entry) => entry.type === "event" && entry.name === name,
          );
          if (!abi) throw new SavingsWriteError("ReconciliationMismatch", "missing Savings event");
          return getReceiptLogs(receipt, call.to)
            .map((log) => codec.decodeEvent(abi, log))
            .filter((values) => values !== null && values[0] === call.from);
        }
        const kind = prepared.action.kind;
        const claims = events("YieldClaimed");
        if (claims.length > 1)
          throw new SavingsWriteError("ReconciliationMismatch", "ambiguous yield events");
        const yieldPaid = claims.length === 0 ? 0n : parseUint(claims[0]?.[1]);
        const principal = kind === "claim-yield" ? 0n : prepared.action.amount;
        if (kind !== "claim-yield") {
          const rows = events(kind === "deposit" ? "Deposit" : "Withdraw");
          if (rows.length !== 1 || rows[0]?.[1] !== principal)
            throw new SavingsWriteError("ReconciliationMismatch", "principal event differs");
          const receiptTransfers = decodeTokenTransfers(receipt, snapshot.savings).filter(
            (transfer) =>
              transfer.from === (kind === "deposit" ? zero : call.from) &&
              transfer.to === (kind === "deposit" ? call.from : zero),
          );
          if (receiptTransfers.length !== 1 || receiptTransfers[0]?.amount !== principal)
            throw new SavingsWriteError("ReconciliationMismatch", "principal mint/burn differs");
        }
        const transfers = decodeTokenTransfers(receipt, prepared.token.target.address);
        const paid = transfers
          .filter((transfer) => transfer.from === snapshot.savings && transfer.to === call.from)
          .reduce((sum, transfer) => sum + transfer.amount, 0n);
        if (kind === "deposit") {
          if (
            !transfers.some(
              (transfer) =>
                transfer.from === call.from &&
                transfer.to === snapshot.savings &&
                transfer.amount === principal,
            ) ||
            yieldPaid !== 0n
          )
            throw new SavingsWriteError("ReconciliationMismatch", "deposit asset transfer differs");
        } else if (paid !== principal + yieldPaid)
          throw new SavingsWriteError("ReconciliationMismatch", "principal/yield payout differs");
        const before = required(prepared.snapshot.wallet).principalReceipts.baseUnits;
        const expected =
          kind === "deposit"
            ? before + principal
            : kind === "withdraw"
              ? before - principal
              : before;
        if (required(snapshot.wallet).principalReceipts.baseUnits !== expected)
          throw new SavingsWriteError(
            "ReconciliationMismatch",
            "wallet principal changed outside this operation",
          );
        return Object.freeze({
          kind,
          principal,
          yieldPaid,
          boundsSatisfied: yieldPaid >= prepared.bounds.minYield,
          snapshot,
        });
      });
    },
  } satisfies SavingsWriter);
}
