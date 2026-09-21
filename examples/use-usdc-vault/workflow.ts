import { depositIntoVault } from "./deposit.ts";
import {
  createVaultRpcReader,
  createVaultTargetResolver,
  createVaultWriter,
  forecastVault,
} from "@mezo-dev-kit/usdc-lending-vault";
import type { VaultAction, VaultOutcome } from "@mezo-dev-kit/usdc-lending-vault";
import { parseUnitsExact } from "@mezo-dev-kit/evm";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { readWalletToken } from "../runtime/token-units.ts";
import { approveToken } from "../runtime/approval.ts";
import { minimumAfterSlippage } from "../runtime/bounds.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";
import { gaugeOperation } from "../save-musd/gauge.ts";

/** Deposit and exit the USDC vault; the optional wrapper path demonstrates gauge custody. */
export async function useUsdcVault(
  runtime: ExampleRuntime,
  input: {
    readonly loanToken: `0x${string}`;
    readonly wrapAndStake?: boolean;
  },
): Promise<Readonly<VaultOutcome>> {
  const reader = createVaultRpcReader({
    networkId: runtime.network.id,
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution(
    createVaultTargetResolver({ reader, account: runtime.account, maxPriceAgeSeconds: 300n }),
  );
  const writer = createVaultWriter({
    reader,
    registry: runtime.registry,
    transport: runtime.transport,
    execution,
  });
  const token = await readWalletToken(runtime, {
    contractId: "vaults.usdc-lending-wrapper",
    address: input.loanToken,
    targetRole: "loan-token",
  });
  const assets = parseUnitsExact("100", Number(token.decimals));
  const before = await reader.read({
    account: runtime.account,
    maxPriceAgeSeconds: 300n,
    previewAssets: assets,
    previewShares: 0n,
  });
  invariant(
    before.walletVaultShares.status === "available" &&
      before.walletVaultShares.value.baseUnits === 0n &&
      before.beneficialReceipts.status === "available" &&
      before.beneficialReceipts.value.baseUnits === 0n,
    "Use a wallet without existing vault shares or wrapper/gauge receipts for this lifecycle",
  );
  runtime.report("Vault preview", {
    previews: before.previews,
    idle: before.idleLiquidity,
    allocationReconciled: before.allocationReconciled,
  });

  async function perform(step: string, action: VaultAction): Promise<Readonly<VaultOutcome>> {
    const snapshot = await reader.read({
      account: runtime.account,
      maxPriceAgeSeconds: 300n,
      previewAssets: 0n,
      previewShares: 0n,
    });
    const estimate = forecastVault(snapshot, action, {
      maxBlockAge: 2n,
      maxPriceAgeSeconds: 300n,
      minOutput: 1n,
      maxInput: 2n ** 256n - 1n,
    });
    // Broad bounds are used only for the forecast. The actual preparation has a
    // 0.5% output minimum and an explicit input cap in this operation's units.
    const bounds = {
      maxBlockAge: 2n,
      maxPriceAgeSeconds: 300n,
      minOutput: minimumAfterSlippage(estimate.output, 50n),
      maxInput: estimate.input + estimate.input / 200n + 1n,
    };
    if (action.kind === "deposit")
      return depositIntoVault(
        runtime,
        { operationId: runtime.operationId(step), assets: action.assets, bounds },
        runtime.polling,
      );
    const preparation = {
      operationId: runtime.operationId(step),
      account: runtime.account,
      action,
      bounds,
    };
    let prepared = await writer.prepare(preparation);
    for (let attempt = 0; prepared.approval.kind !== "sufficient"; attempt++) {
      invariant(attempt < 2, "Vault allowance changed repeatedly");
      await approveToken(
        runtime,
        execution,
        `${step}-approval-${attempt}`,
        prepared.token,
        prepared.approval,
      );
      prepared = await writer.prepare(preparation);
    }
    const simulated = await writer.simulate(prepared);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const result = await writer.reconcile(prepared, confirmed);
    runtime.report(`${step}: vault settlement`, {
      assets: result.outcome.assets,
      shares: result.outcome.shares,
      receipts: result.outcome.receipts,
      walletShares: result.outcome.snapshot.walletVaultShares,
      walletReceipts: result.outcome.snapshot.walletReceipts,
      beneficialReceipts: result.outcome.snapshot.beneficialReceipts,
    });
    invariant(result.outcome.boundsSatisfied, "Inspect the vault settlement before continuing");
    return result.outcome;
  }

  let result = await perform("deposit", { kind: "deposit", assets });
  if (input.wrapAndStake) {
    invariant(result.snapshot.walletVaultShares.status === "available", "Vault shares unavailable");
    result = await perform("wrap-and-stake", {
      kind: "wrap-and-stake",
      shares: result.snapshot.walletVaultShares.value.baseUnits,
    });
    // Wrapped receipts are staked by the wrapper. Unstake before attempting to unwrap.
    const gauge = result.snapshot.gauge;
    invariant(
      gauge.status === "available" && gauge.value.accountStake.status === "available",
      "Gauge stake unavailable",
    );
    await gaugeOperation(runtime, "vault-gauge", "unstake-vault", {
      kind: "unstake",
      amount: gauge.value.accountStake.value.baseUnits,
    });
    const snapshot = await reader.read({
      account: runtime.account,
      maxPriceAgeSeconds: 300n,
      previewAssets: 0n,
      previewShares: 0n,
    });
    invariant(snapshot.walletReceipts.status === "available", "Wallet receipts unavailable");
    result = await perform("unwrap", {
      kind: "unwrap",
      receipts: snapshot.walletReceipts.value.baseUnits,
    });
  }
  invariant(result.snapshot.walletVaultShares.status === "available", "Wallet shares unavailable");
  // Adapter assets are already part of the vault total; redeem the wallet's actual shares once.
  const exited = await perform("redeem", {
    kind: "redeem",
    shares: result.snapshot.walletVaultShares.value.baseUnits,
  });
  invariant(
    exited.snapshot.walletVaultShares.status === "available" &&
      exited.snapshot.walletVaultShares.value.baseUnits === 0n,
    "Vault exit left wallet shares",
  );
  return exited;
}
