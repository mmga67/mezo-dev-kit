import { resolveOperation, resolveEvent } from "@mezo-dev-kit/contracts";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import { getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import type {
  ExecutionClient,
  ExecutionReceipt,
  PreparedTransaction,
  RpcTransport,
  SimulatedTransaction,
  SubmissionRecord,
} from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createTokenReader, decodeTokenTransfers, planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import {
  forecastLending,
  lendingQuantity,
  lendingRequired,
  LendingWriteError,
} from "./forecast.ts";
import type { LendingAction, LendingBounds, LendingForecast } from "./forecast.ts";
import { LENDING_MODEL } from "./model.generated.ts";
import type { LendingReader, LendingSnapshot } from "./types.ts";

export interface PreparedLending {
  readonly snapshot: Readonly<LendingSnapshot>;
  readonly action: LendingAction;
  readonly bounds: LendingBounds;
  readonly forecast: Readonly<LendingForecast>;
  readonly token: Readonly<TokenSnapshot>;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface LendingOutcome {
  readonly kind: LendingAction["kind"];
  readonly assets: bigint;
  readonly shares: bigint;
  readonly boundsSatisfied: boolean;
  readonly snapshot: Readonly<LendingSnapshot>;
}
export interface LendingWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: LendingAction;
    readonly bounds: LendingBounds;
  }): Promise<Readonly<PreparedLending>>;
  simulate(prepared: PreparedLending): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedLending,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedLending,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: LendingOutcome;
    }>
  >;
}
export function createLendingWriter(config: {
  readonly reader: LendingReader;
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
  readonly execution: ExecutionClient;
}): Readonly<LendingWriter> {
  const tokens = createTokenReader(config);
  const codec = createAbiCodec();
  const owned = new WeakSet<PreparedLending>();
  const simulations = new WeakMap<SimulatedTransaction, PreparedLending>();
  const names = {
    supply: "supply",
    withdraw: "withdraw",
    borrow: "borrow",
    repay: "repay",
    "supply-collateral": "supplyCollateral",
    "withdraw-collateral": "withdrawCollateral",
  } as const;
  async function read(input: {
    readonly account: `0x${string}`;
    readonly action: LendingAction;
    readonly bounds: LendingBounds;
  }) {
    const snapshot = await config.reader.read({
      account: input.account,
      maxPriceAgeSeconds: input.bounds.maxPriceAgeSeconds,
    });
    const forecast = forecastLending(snapshot, input.action, input.bounds);
    const morpho = config.registry.resolve({
      contractId: "lending.morpho",
      networkId: snapshot.coordinate.networkId,
      blockNumber: snapshot.coordinate.blockNumber,
    });
    const token = await tokens.read({
      target: {
        contractId: morpho.contractId,
        targetRole: forecast.assetKind,
        address:
          forecast.assetKind === "loan-token"
            ? LENDING_MODEL.loanToken
            : LENDING_MODEL.collateralToken,
      },
      account: snapshot.account,
      spender: morpho.address,
      coordinate: snapshot.coordinate,
    });
    if (forecast.requiresApproval && token.balance < forecast.assets)
      throw new LendingWriteError("InsufficientBalance", "insufficient input token balance");
    return { snapshot, forecast, morpho, token };
  }
  function assertOwned(prepared: PreparedLending) {
    if (!owned.has(prepared))
      throw new LendingWriteError("InvalidInput", "prepare with this lending writer");
  }
  return Object.freeze({
    async prepare(input) {
      if (typeof input.operationId !== "string" || input.operationId.length === 0)
        throw new LendingWriteError("InvalidInput", "operationId required");
      const account = parseAddress(input.account);
      const action = Object.freeze(structuredClone(input.action));
      const bounds = Object.freeze(structuredClone(input.bounds));
      if ("quantity" in action) Object.freeze(action.quantity);
      const { snapshot, forecast, morpho, token } = await read({ account, action, bounds });
      const root = (contractId: "lending.adaptive-curve-irm" | "lending.musdc-btc-oracle") =>
        config.registry.resolve({
          contractId,
          networkId: snapshot.coordinate.networkId,
          blockNumber: snapshot.coordinate.blockNumber,
        }).address;
      const tuple: readonly AbiValue[] = [
        LENDING_MODEL.loanToken,
        LENDING_MODEL.collateralToken,
        root("lending.musdc-btc-oracle"),
        root("lending.adaptive-curve-irm"),
        BigInt(LENDING_MODEL.lltv),
      ];
      const quantities: readonly AbiValue[] =
        action.kind === "supply-collateral" || action.kind === "withdraw-collateral"
          ? [action.assets]
          : lendingQuantity(action.quantity);
      const callback =
        action.kind === "supply" || action.kind === "repay" || action.kind === "supply-collateral";
      const method = resolveOperation({
        contractId: morpho.contractId,
        networkId: snapshot.coordinate.networkId,
        blockNumber: snapshot.coordinate.blockNumber,
        functionName: names[action.kind],
      });
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: morpho.contractId,
        coordinate: snapshot.coordinate,
        from: account,
        to: morpho.address,
        value: 0n,
        data: codec.encodeFunction(method.functionAbi, [
          tuple,
          ...quantities,
          account,
          callback ? "0x" : account,
        ]),
      });
      // A share-denominated payment can accrue between approval and execution; the caller's
      // explicit maximum provides the approval budget, while each preparation checks actual assets.
      const payment =
        forecast.requiresApproval && "quantity" in action && action.quantity.shares !== undefined
          ? bounds.maxAssets
          : forecast.assets;
      const approval = planApproval({
        allowance: token.allowance,
        requiredAmount: forecast.requiresApproval ? payment : 0n,
      });
      const prepared = Object.freeze({
        snapshot,
        forecast,
        token,
        action,
        bounds,
        approval,
        transaction,
      });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      if (prepared.approval.kind !== "sufficient")
        throw new LendingWriteError(
          "ApprovalRequired",
          "reconcile approval and prepare lending again",
        );
      const simulated = await config.execution.simulate(prepared.transaction);
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      if (simulations.get(simulated) !== prepared)
        throw new LendingWriteError("InvalidInput", "lending simulation mismatch");
      return config.execution.submit(simulated, async () => {
        const fresh = await read({
          account: prepared.snapshot.account,
          action: prepared.action,
          bounds: prepared.bounds,
        });
        const age =
          fresh.snapshot.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        if (age < 0n || age > prepared.bounds.maxBlockAge)
          throw new LendingWriteError("StaleState", "lending preparation expired");
        if (fresh.forecast.requiresApproval && fresh.token.allowance < fresh.forecast.assets)
          throw new LendingWriteError("ApprovalRequired", "allowance below current input amount");
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
        throw new LendingWriteError("ReconciliationMismatch", "lending intent differs");
      return config.execution.reconcile(record, async (receipt) => {
        const snapshot = await config.reader.read({
          account: call.from,
          maxPriceAgeSeconds: prepared.bounds.maxPriceAgeSeconds,
          blockNumber: receipt.blockNumber,
        });
        if (snapshot.coordinate.blockHash !== receipt.blockHash)
          throw new LendingWriteError(
            "ReconciliationMismatch",
            "receipt/post-state coordinate differs",
          );
        const name = names[prepared.action.kind];
        const eventName = name[0]?.toUpperCase() + name.slice(1);
        const contract = config.registry.resolve({
          contractId: call.contractId,
          networkId: snapshot.coordinate.networkId,
          blockNumber: receipt.blockNumber,
        });
        const event = resolveEvent({
          contractId: contract.contractId,
          networkId: snapshot.coordinate.networkId,
          blockNumber: receipt.blockNumber,
          eventName,
        });
        if (!event) throw new LendingWriteError("ReconciliationMismatch", "missing lending event");
        const events = getReceiptLogs(receipt, call.to)
          .map((log) => codec.decodeEvent(event, log))
          .filter(
            (row) =>
              row !== null &&
              row[0] === snapshot.marketId &&
              row[1] === call.from &&
              row[2] === call.from,
          );
        const values = events[0];
        if (events.length !== 1 || !values)
          throw new LendingWriteError("ReconciliationMismatch", "ambiguous lending event");
        const kind = prepared.action.kind;
        const collateral = kind === "supply-collateral" || kind === "withdraw-collateral";
        const outgoing = kind === "withdraw" || kind === "borrow" || kind === "withdraw-collateral";
        if (outgoing && values[3] !== call.from)
          throw new LendingWriteError("ReconciliationMismatch", "lending receiver differs");
        const assets = parseUint(values[outgoing ? 4 : 3]);
        const shares = collateral ? 0n : parseUint(values[outgoing ? 5 : 4]);
        if ("quantity" in prepared.action) {
          const [inputAssets, inputShares] = lendingQuantity(prepared.action.quantity);
          if (
            (inputAssets !== 0n && inputAssets !== assets) ||
            (inputShares !== 0n && inputShares !== shares)
          )
            throw new LendingWriteError("ReconciliationMismatch", "lending exact quantity differs");
        } else if (assets !== prepared.action.assets)
          throw new LendingWriteError("ReconciliationMismatch", "collateral amount differs");
        const movements = decodeTokenTransfers(receipt, prepared.token.target.address).filter(
          (transfer) =>
            transfer.from === (outgoing ? call.to : call.from) &&
            transfer.to === (outgoing ? call.from : call.to),
        );
        if (movements.length !== 1 || movements[0]?.amount !== assets)
          throw new LendingWriteError("ReconciliationMismatch", "lending asset movement differs");
        const before = lendingRequired(prepared.snapshot.position);
        const after = lendingRequired(snapshot.position);
        let feeShares = 0n;
        if (kind !== "supply-collateral") {
          if (!snapshot.feeRecipient)
            throw new LendingWriteError("UnavailableState", "receipt fee recipient unavailable");
          if (lendingRequired(snapshot.feeRecipient) === call.from) {
            const accruedEvent = resolveEvent({
              contractId: contract.contractId,
              networkId: snapshot.coordinate.networkId,
              blockNumber: receipt.blockNumber,
              eventName: "AccrueInterest",
            });
            if (!accruedEvent)
              throw new LendingWriteError("ReconciliationMismatch", "missing accrual event");
            const accrued = getReceiptLogs(receipt, call.to)
              .map((log) => codec.decodeEvent(accruedEvent, log))
              .filter((row) => row !== null && row[0] === snapshot.marketId);
            if (accrued.length > 1)
              throw new LendingWriteError("ReconciliationMismatch", "ambiguous fee accrual");
            feeShares = accrued.length === 0 ? 0n : parseUint(accrued[0]?.[3]);
          }
        }
        const expectedSupply =
          before.supplyShares.baseUnits +
          feeShares +
          (kind === "supply" ? shares : kind === "withdraw" ? -shares : 0n);
        const expectedBorrow =
          before.borrowShares.baseUnits +
          (kind === "borrow" ? shares : kind === "repay" ? -shares : 0n);
        const expectedCollateral =
          before.collateral.baseUnits +
          (kind === "supply-collateral" ? assets : kind === "withdraw-collateral" ? -assets : 0n);
        if (
          after.supplyShares.baseUnits !== expectedSupply ||
          after.borrowShares.baseUnits !== expectedBorrow ||
          after.collateral.baseUnits !== expectedCollateral
        )
          throw new LendingWriteError(
            "ReconciliationMismatch",
            "lending position differs from receipt effects",
          );
        let boundsSatisfied =
          assets >= prepared.bounds.minAssets &&
          assets <= prepared.bounds.maxAssets &&
          shares >= prepared.bounds.minShares &&
          shares <= prepared.bounds.maxShares;
        if (kind === "borrow" || kind === "withdraw-collateral") {
          const health = lendingRequired(snapshot.health);
          const debt = lendingRequired(snapshot.debt).baseUnits;
          boundsSatisfied =
            boundsSatisfied &&
            health.healthy &&
            (health.reason === "zero-debt"
              ? prepared.bounds.minBorrowHeadroom === 0n
              : health.maxBorrowAssets !== null &&
                health.maxBorrowAssets - debt >= prepared.bounds.minBorrowHeadroom);
        }
        return Object.freeze({ kind, assets, shares, boundsSatisfied, snapshot });
      });
    },
  } satisfies LendingWriter);
}
