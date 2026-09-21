import { openPosition } from "./open-position.ts";
import { createBorrowingReader, createBorrowingWriter } from "@mezo-dev-kit/musd-borrowing";
import type { BorrowingAction, BorrowingOutcome } from "@mezo-dev-kit/musd-borrowing";
import { formatUnitsExact, parseUnitsExact } from "@mezo-dev-kit/evm";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { readWalletToken } from "../runtime/token-units.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";
import { borrowingConfig } from "./config.ts";

/** Open, manage and close a classic MUSD position. Supply an unused funded account. */
export async function borrowMusd(runtime: ExampleRuntime): Promise<Readonly<BorrowingOutcome>> {
  const reader = createBorrowingReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution();
  const writer = createBorrowingWriter({ reader, execution });
  const before = await reader.read({ account: runtime.account });
  invariant(
    before.position.status === "nonexistent",
    "Use an account without an existing trove for this lifecycle",
  );
  const token = runtime.registry.resolve({
    contractId: "musd.token",
    networkId: runtime.network.id,
    blockNumber: before.coordinate.blockNumber,
  });
  const wallet = await readWalletToken(runtime, {
    contractId: token.contractId,
    address: token.address,
  });
  const musd = (amount: string) => parseUnitsExact(amount, Number(wallet.decimals));
  const btc = (amount: string) => parseUnitsExact(amount, runtime.network.nativeCurrency.decimals);
  const bounds = {
    maxFee: musd(borrowingConfig.maxFeeMusd),
    maxAnnualRateBps: borrowingConfig.maxAnnualRateBps,
    minCollateralRatio: parseUnitsExact(borrowingConfig.minCollateralRatio, 18),
    maxBlockAge: 2n,
  };

  async function perform(
    step: string,
    action: BorrowingAction,
  ): Promise<Readonly<BorrowingOutcome>> {
    // Preparation reads current debt, price and system mode, then finds sorted-list hints.
    const prepared = await writer.prepare({
      operationId: runtime.operationId(step),
      account: runtime.account,
      action,
      bounds,
      trials: 3n,
      seed: 42n,
    });
    runtime.report(`${step}: forecast`, {
      collateral: prepared.forecast.collateral,
      debt: prepared.forecast.debt,
      feeMusd: formatUnitsExact(prepared.forecast.fee, Number(wallet.decimals)),
      hints: prepared.hints,
    });
    const simulated = await writer.simulate(prepared);
    const submitted = await writer.submit(prepared, simulated);
    const confirmed = await waitForConfirmation(execution, submitted, runtime.polling);
    const result = await writer.reconcile(prepared, confirmed);
    // These fee/risk bounds are preflight policy; the contract has no matching deadline arguments.
    runtime.report(`${step}: settled`, {
      status: result.outcome.snapshot.position.status,
      collateral: result.outcome.snapshot.position.collateral,
      debt: result.outcome.snapshot.position.debt,
      boundsSatisfied: result.outcome.boundsSatisfied,
      hash: confirmed.hash,
    });
    invariant(
      result.outcome.boundsSatisfied,
      "The transaction settled outside the requested bounds; inspect it before continuing",
    );
    return result.outcome;
  }

  await openPosition(
    runtime,
    {
      operationId: runtime.operationId("open"),
      bounds,
      collateral: btc(borrowingConfig.collateralBtc),
      borrow: musd(borrowingConfig.borrowMusd),
    },
    runtime.polling,
  );
  await perform("add-collateral", {
    kind: "add-collateral",
    collateral: btc(borrowingConfig.addCollateralBtc),
  });
  // Repayment burns MUSD through BorrowerOperations; this operation has no ERC-20 approval.
  await perform("repay", { kind: "repay", amount: musd(borrowingConfig.repayMusd) });
  const closing = await reader.read({ account: runtime.account });
  runtime.report("Close funding", {
    walletMusd: closing.musdBalance,
    outstandingNetDebt: closing.position.netDebt,
  });
  // Fees and accrued interest require additional MUSD beyond the originally minted amount.
  // The local runner pre-funds that buffer explicitly before the example starts.
  const result = await perform("close", { kind: "close" });
  invariant(
    result.snapshot.position.status === "closed-by-owner",
    "Expected a fully closed borrower position",
  );
  return result;
}
