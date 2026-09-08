import { resolveOperation, resolveRoleInterface } from "@mezo-dev-kit/contracts";
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
import { createTokenReader, decodeTokenTransfers, planApproval } from "@mezo-dev-kit/tokens";
import type { ApprovalPlan, TokenSnapshot } from "@mezo-dev-kit/tokens";
import { forecastVault, vaultRequired, VaultWriteError } from "./forecast.ts";
import type { VaultAction, VaultBounds, VaultForecast } from "./forecast.ts";
import { readVaultWriteState } from "./write-state.ts";
import type { VaultWriteState } from "./write-state.ts";
import { VAULT_MODEL } from "./model.generated.ts";
import type { VaultReader, VaultSnapshot } from "./types.ts";

export interface PreparedVault {
  readonly snapshot: Readonly<VaultSnapshot>;
  readonly action: VaultAction;
  readonly bounds: VaultBounds;
  readonly forecast: Readonly<VaultForecast>;
  readonly state: Readonly<VaultWriteState>;
  readonly token: Readonly<TokenSnapshot>;
  readonly approval: ApprovalPlan;
  readonly transaction: Readonly<PreparedTransaction>;
}
export interface VaultOutcome {
  readonly kind: VaultAction["kind"];
  readonly input: bigint;
  readonly output: bigint;
  readonly assets: bigint;
  readonly shares: bigint;
  readonly receipts: bigint;
  readonly boundsSatisfied: boolean;
  readonly snapshot: Readonly<VaultSnapshot>;
}
export interface VaultWriter {
  prepare(input: {
    readonly operationId: string;
    readonly account: `0x${string}`;
    readonly action: VaultAction;
    readonly bounds: VaultBounds;
  }): Promise<Readonly<PreparedVault>>;
  simulate(prepared: PreparedVault): Promise<Readonly<SimulatedTransaction>>;
  submit(
    prepared: PreparedVault,
    simulated: SimulatedTransaction,
  ): Promise<Readonly<SubmissionRecord>>;
  reconcile(
    prepared: PreparedVault,
    record: unknown,
  ): Promise<
    Readonly<{
      state: "reconciled";
      record: SubmissionRecord;
      receipt: ExecutionReceipt;
      outcome: VaultOutcome;
    }>
  >;
}
export function createVaultWriter(config: {
  readonly reader: VaultReader;
  readonly registry: ContractRegistry;
  readonly transport: RpcTransport;
  readonly execution: ExecutionClient;
}): Readonly<VaultWriter> {
  const tokens = createTokenReader(config);
  const codec = createAbiCodec();
  const owned = new WeakSet<PreparedVault>();
  const simulations = new WeakMap<SimulatedTransaction, PreparedVault>();
  const wrapperAction = (action: VaultAction) =>
    action.kind === "wrap-and-stake" || action.kind === "unwrap";
  async function read(input: {
    readonly account: `0x${string}`;
    readonly action: VaultAction;
    readonly bounds: VaultBounds;
  }) {
    const snapshot = await config.reader.read({
      account: input.account,
      maxPriceAgeSeconds: input.bounds.maxPriceAgeSeconds,
      previewAssets: 0n,
      previewShares: 0n,
    });
    const forecast = forecastVault(snapshot, input.action, input.bounds);
    const state = await readVaultWriteState(config, snapshot, input.action, forecast);
    const wrapper = wrapperAction(input.action);
    const token = await tokens.read({
      target: {
        contractId: "vaults.usdc-lending-wrapper",
        targetRole: wrapper ? "vault-v2" : "loan-token",
        address: wrapper ? snapshot.vault : VAULT_MODEL.loanToken,
      },
      account: snapshot.account,
      spender: wrapper ? snapshot.wrapper : snapshot.vault,
      coordinate: snapshot.coordinate,
    });
    if (forecast.requiresApproval && token.balance < forecast.input)
      throw new VaultWriteError("InsufficientBalance", "insufficient input token balance");
    return { snapshot, forecast, state, token };
  }
  function assertOwned(prepared: PreparedVault) {
    if (!owned.has(prepared))
      throw new VaultWriteError("InvalidInput", "prepare with this vault writer");
  }
  return Object.freeze({
    async prepare(input) {
      if (typeof input.operationId !== "string" || input.operationId.length === 0)
        throw new VaultWriteError("InvalidInput", "operationId required");
      const account = parseAddress(input.account);
      const action = Object.freeze(structuredClone(input.action));
      const bounds = Object.freeze(structuredClone(input.bounds));
      const { snapshot, forecast, state, token } = await read({ account, action, bounds });
      const wrapper = wrapperAction(action);
      const name =
        action.kind === "wrap-and-stake"
          ? "depositAndStake"
          : action.kind === "unwrap"
            ? "withdraw"
            : action.kind;
      const abi = wrapper
        ? resolveOperation({
            contractId: "vaults.usdc-lending-wrapper",
            networkId: snapshot.coordinate.networkId,
            blockNumber: snapshot.coordinate.blockNumber,
            functionName: name,
            inputTypes: ["uint256"],
          }).functionAbi
        : resolveRoleInterface({
            role: "vault-v2",
            networkId: snapshot.coordinate.networkId,
          }).abi.find((entry) => entry.type === "function" && entry.name === name);
      const quantity =
        "assets" in action ? action.assets : "shares" in action ? action.shares : action.receipts;
      const args = wrapper
        ? [quantity]
        : action.kind === "deposit" || action.kind === "mint"
          ? [quantity, account]
          : [quantity, account, account];
      const transaction: Readonly<PreparedTransaction> = Object.freeze({
        operationId: input.operationId,
        contractId: "vaults.usdc-lending-wrapper",
        ...(wrapper ? {} : { targetRole: "vault-v2" }),
        coordinate: snapshot.coordinate,
        from: account,
        to: wrapper ? snapshot.wrapper : snapshot.vault,
        value: 0n,
        data: codec.encodeFunction(abi, args),
      });
      const payment = action.kind === "mint" ? bounds.maxInput : forecast.input;
      const approval = planApproval({
        allowance: token.allowance,
        requiredAmount: forecast.requiresApproval ? payment : 0n,
      });
      const prepared = Object.freeze({
        snapshot,
        forecast,
        state,
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
        throw new VaultWriteError("ApprovalRequired", "reconcile approval and prepare vault again");
      const simulated = await config.execution.simulate(prepared.transaction);
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      if (simulations.get(simulated) !== prepared)
        throw new VaultWriteError("InvalidInput", "vault simulation mismatch");
      return config.execution.submit(simulated, async () => {
        const fresh = await read({
          account: prepared.snapshot.account,
          action: prepared.action,
          bounds: prepared.bounds,
        });
        const age =
          fresh.snapshot.coordinate.blockNumber - prepared.snapshot.coordinate.blockNumber;
        if (age < 0n || age > prepared.bounds.maxBlockAge)
          throw new VaultWriteError("StaleState", "vault preparation expired");
        if (fresh.forecast.requiresApproval && fresh.token.allowance < fresh.forecast.input)
          throw new VaultWriteError("ApprovalRequired", "allowance below current input amount");
      });
    },
    async reconcile(prepared, value) {
      const record = parseSubmissionRecord(value);
      const call = prepared.transaction;
      if (
        record.operationId !== call.operationId ||
        record.contractId !== call.contractId ||
        record.targetRole !== call.targetRole ||
        record.call.from !== call.from ||
        record.call.to !== call.to ||
        record.call.data !== call.data ||
        BigInt(record.call.value) !== 0n ||
        BigInt(record.call.chainId) !== call.coordinate.chainId
      )
        throw new VaultWriteError("ReconciliationMismatch", "vault intent differs");
      return config.execution.reconcile(record, async (receipt) => {
        const snapshot = await config.reader.read({
          account: call.from,
          maxPriceAgeSeconds: prepared.bounds.maxPriceAgeSeconds,
          blockNumber: receipt.blockNumber,
          previewAssets: 0n,
          previewShares: 0n,
        });
        if (snapshot.coordinate.blockHash !== receipt.blockHash)
          throw new VaultWriteError(
            "ReconciliationMismatch",
            "receipt/post-state coordinate differs",
          );
        const kind = prepared.action.kind;
        const wrapper = wrapperAction(prepared.action);
        const enter = kind === "deposit" || kind === "mint" || kind === "wrap-and-stake";
        const interfaceAbi = wrapper
          ? config.registry.resolve({
              contractId: "vaults.usdc-lending-wrapper",
              networkId: snapshot.coordinate.networkId,
              blockNumber: receipt.blockNumber,
            }).readAbi
          : resolveRoleInterface({ role: "vault-v2", networkId: snapshot.coordinate.networkId })
              .abi;
        const event = interfaceAbi.find(
          (entry) => entry.type === "event" && entry.name === (enter ? "Deposit" : "Withdraw"),
        );
        if (!event)
          throw new VaultWriteError("ReconciliationMismatch", "missing vault operation event");
        const rows = getReceiptLogs(receipt, call.to)
          .map((log) => codec.decodeEvent(event, log))
          .filter(
            (row) =>
              row !== null && row[0] === (kind === "wrap-and-stake" ? snapshot.wrapper : call.from),
          );
        const row = rows[0];
        if (rows.length !== 1 || !row)
          throw new VaultWriteError("ReconciliationMismatch", "ambiguous vault operation event");
        let assets = 0n;
        let shares: bigint;
        let receipts = 0n;
        let input: bigint;
        let output: bigint;
        if (wrapper) {
          shares = parseUint(row[kind === "wrap-and-stake" ? 1 : 2]);
          receipts = parseUint(row[kind === "wrap-and-stake" ? 2 : 1]);
          input = kind === "wrap-and-stake" ? shares : receipts;
          output = kind === "wrap-and-stake" ? receipts : shares;
        } else {
          if (row[1] !== call.from || (!enter && row[2] !== call.from))
            throw new VaultWriteError("ReconciliationMismatch", "vault receiver/owner differs");
          assets = parseUint(row[enter ? 2 : 3]);
          shares = parseUint(row[enter ? 3 : 4]);
          input = enter ? assets : shares;
          output = enter ? shares : assets;
        }
        const action = prepared.action;
        if (
          ("assets" in action && action.assets !== assets) ||
          ("shares" in action && action.shares !== shares) ||
          ("receipts" in action && action.receipts !== receipts)
        )
          throw new VaultWriteError("ReconciliationMismatch", "vault exact quantity differs");
        const assetToken = wrapper ? snapshot.vault : VAULT_MODEL.loanToken;
        const transfers = decodeTokenTransfers(receipt, assetToken);
        const movement = transfers.filter(
          (transfer) =>
            transfer.from === (enter ? call.from : call.to) &&
            transfer.to === (enter ? call.to : call.from),
        );
        if (movement.length !== 1 || movement[0]?.amount !== (wrapper ? shares : assets))
          throw new VaultWriteError(
            "ReconciliationMismatch",
            "vault input/output transfer differs",
          );
        const delta = (token: `0x${string}`) =>
          decodeTokenTransfers(receipt, token).reduce(
            (sum, transfer) =>
              sum +
              (transfer.to === call.from ? transfer.amount : 0n) -
              (transfer.from === call.from ? transfer.amount : 0n),
            0n,
          );
        if (
          vaultRequired(snapshot.walletVaultShares).baseUnits !==
            vaultRequired(prepared.snapshot.walletVaultShares).baseUnits + delta(snapshot.vault) ||
          vaultRequired(snapshot.walletReceipts).baseUnits !==
            vaultRequired(prepared.snapshot.walletReceipts).baseUnits + delta(snapshot.wrapper)
        )
          throw new VaultWriteError(
            "ReconciliationMismatch",
            "wallet ownership differs from receipt movements",
          );
        if (kind === "wrap-and-stake") {
          const gauge = vaultRequired(snapshot.gauge);
          const previous = vaultRequired(prepared.snapshot.gauge);
          const gaugeAbi = resolveRoleInterface({
            role: "vault-gauge",
            networkId: snapshot.coordinate.networkId,
          }).abi.find((entry) => entry.type === "event" && entry.name === "Deposit");
          const deposits = getReceiptLogs(receipt, gauge.address)
            .map((log) => codec.decodeEvent(gaugeAbi, log))
            .filter(
              (values) =>
                values !== null && values[0] === snapshot.wrapper && values[1] === call.from,
            );
          if (
            deposits.length !== 1 ||
            deposits[0]?.[2] !== receipts ||
            vaultRequired(gauge.accountStake).baseUnits !==
              vaultRequired(previous.accountStake).baseUnits + receipts
          )
            throw new VaultWriteError("ReconciliationMismatch", "wrapper stake differs");
        }
        if (!wrapper) {
          if (!vaultRequired(snapshot.allocationReconciled))
            throw new VaultWriteError(
              "ReconciliationMismatch",
              "adapter post-state does not reconcile",
            );
          const idle = vaultRequired(prepared.snapshot.idleLiquidity).baseUnits;
          const allocatedAssets = enter ? assets : assets > idle ? assets - idle : 0n;
          const event = interfaceAbi.find(
            (entry) => entry.type === "event" && entry.name === (enter ? "Allocate" : "Deallocate"),
          );
          const allocationRows = getReceiptLogs(receipt, snapshot.vault).map((log) =>
            codec.decodeEvent(event, log),
          );
          const changes = allocationRows.filter((values) => values !== null);
          if (changes.length !== (allocatedAssets > 0n ? 1 : 0))
            throw new VaultWriteError("ReconciliationMismatch", "allocation event count differs");
          const change = changes[0];
          if (change) {
            const ids = change[3];
            const delta = change[4];
            if (
              change[0] !== call.from ||
              change[1] !== snapshot.adapter ||
              change[2] !== allocatedAssets ||
              !Array.isArray(ids) ||
              ids.length !== prepared.state.allocations.length ||
              typeof delta !== "bigint"
            )
              throw new VaultWriteError("ReconciliationMismatch", "allocation event differs");
            const allocationAbi = interfaceAbi.find(
              (entry) => entry.type === "function" && entry.name === "allocation",
            );
            for (const [index, cap] of prepared.state.allocations.entries()) {
              if (ids[index] !== cap.id)
                throw new VaultWriteError("ReconciliationMismatch", "allocation ID differs");
              const post = parseUint(
                codec.decodeFunction(
                  allocationAbi,
                  await config.transport.read({
                    ...snapshot.coordinate,
                    contractId: call.contractId,
                    address: snapshot.vault,
                    data: codec.encodeFunction(allocationAbi, [cap.id]),
                  }),
                )[0],
              );
              if (post !== cap.allocation + delta)
                throw new VaultWriteError(
                  "ReconciliationMismatch",
                  "allocation post-state differs",
                );
            }
          }
        }
        return Object.freeze({
          kind,
          input,
          output,
          assets,
          shares,
          receipts,
          boundsSatisfied: input <= prepared.bounds.maxInput && output >= prepared.bounds.minOutput,
          snapshot,
        });
      });
    },
  } satisfies VaultWriter);
}
