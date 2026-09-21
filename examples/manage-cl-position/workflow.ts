import { mintPosition } from "./mint.ts";
import {
  createCLPoolReader,
  createCLPositionTargetResolver,
  createCLPositionWriter,
  forecastCLPosition,
  getCLTickSqrtRatio,
} from "@mezo-dev-kit/pools";
import type { CLPoolKey, CLPositionAction, CLPositionOutcome } from "@mezo-dev-kit/pools";
import { parseUnitsExact } from "@mezo-dev-kit/evm";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { approveToken } from "../runtime/approval.ts";
import { minimumAfterSlippage } from "../runtime/bounds.ts";
import { waitForConfirmation } from "../runtime/wait-for-confirmation.ts";
import { invariant } from "../runtime/validation.ts";
import { clGaugeCycle } from "./gauge.ts";

/** An LP NFT has a price range and owed tokens; removing liquidity alone does not close it. */
export async function manageCLPosition(
  runtime: ExampleRuntime,
  key: CLPoolKey,
  options: {
    readonly stake?: boolean;
    readonly rebalance?: boolean;
  } = {},
): Promise<Readonly<CLPositionOutcome>> {
  const reader = createCLPoolReader({
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const execution = runtime.createExecution(
    createCLPositionTargetResolver({ reader, key, account: runtime.account }),
  );
  const writer = createCLPositionWriter({ reader, execution, transport: runtime.transport });
  const initial = await reader.read({ account: runtime.account, key });
  const center = Math.floor(initial.tick / key.tickSpacing) * key.tickSpacing;
  const amount0Desired = parseUnitsExact("50", Number(initial.token0.decimals));
  const amount1Desired = parseUnitsExact("50", Number(initial.token1.decimals));

  async function perform(
    step: string,
    action: CLPositionAction,
  ): Promise<Readonly<CLPositionOutcome>> {
    const snapshot = await reader.read({
      key,
      account: runtime.account,
      tokenIds: action.kind === "mint" ? [] : [action.tokenId],
      ...(action.kind === "mint" ? { ticks: [action.tickLower, action.tickUpper] } : {}),
    });
    // This example keeps its range around the price and requires both assets.
    // One-unit bounds are for this preliminary calculation only, never submission.
    const preliminary = {
      minAmount0: action.kind === "burn" ? 0n : 1n,
      minAmount1: action.kind === "burn" ? 0n : 1n,
      minLiquidity: action.kind === "mint" || action.kind === "increase" ? 1n : 0n,
      sqrtPriceMinX96: getCLTickSqrtRatio(snapshot.tick - 50),
      sqrtPriceMaxX96: getCLTickSqrtRatio(snapshot.tick + 50),
      deadline: snapshot.timestamp + 300n,
      maxDeadlineSeconds: 300n,
      maxBlockAge: 2n,
    };
    const estimate = forecastCLPosition({ snapshot, action, bounds: preliminary });
    const minimum = (value: bigint) => (value === 0n ? 0n : minimumAfterSlippage(value, 50n));
    // Zero minima are appropriate only for a token the position does not owe/spend.
    const bounds = {
      ...preliminary,
      minAmount0: minimum(estimate.amount0),
      minAmount1: minimum(estimate.amount1),
      minLiquidity:
        action.kind === "mint" || action.kind === "increase"
          ? minimum(estimate.liquidityDelta)
          : 0n,
    };
    if (action.kind === "mint")
      return mintPosition(
        runtime,
        { operationId: runtime.operationId(step), key, ...action, bounds },
        runtime.polling,
      );
    const input = {
      key,
      account: runtime.account,
      action,
      bounds,
      operationId: runtime.operationId(step),
    };
    let prepared = await writer.prepare(input);
    for (
      let attempt = 0;
      prepared.approvals.some((item) => item.plan.kind !== "sufficient");
      attempt++
    ) {
      invariant(attempt < 4, "CL token approvals did not converge");
      const item = prepared.approvals.find((row) => row.plan.kind !== "sufficient");
      invariant(item, "Missing CL approval");
      await approveToken(runtime, execution, `${step}-approval-${attempt}`, item.token, item.plan);
      prepared = await writer.prepare(input);
    }
    runtime.report(`${step}: position forecast`, prepared.forecast);
    const simulation = await writer.simulate(prepared);
    const submission = await writer.submit(prepared, simulation);
    const confirmed = await waitForConfirmation(execution, submission, runtime.polling);
    const { outcome } = await writer.reconcile(prepared, confirmed);
    runtime.report(`${step}: settled NFT`, {
      tokenId: outcome.tokenId,
      amount0: outcome.amount0,
      amount1: outcome.amount1,
      liquidity: outcome.forecast.liquidityAfter,
      boundsSatisfied: outcome.boundsSatisfied,
      hash: confirmed.hash,
    });
    invariant(
      outcome.boundsSatisfied,
      "Settled CL position is outside policy; inspect before continuing",
    );
    return outcome;
  }
  const mint = (step: string, rangeCenter: number) =>
    perform(step, {
      kind: "mint",
      tickLower: rangeCenter - 100 * key.tickSpacing,
      tickUpper: rangeCenter + 100 * key.tickSpacing,
      amount0Desired,
      amount1Desired,
    });
  const minted = await mint("mint", center);
  // Keep the actual event-derived ID; do not guess it from the collection supply.
  const tokenId = minted.tokenId;
  if (options.stake) await clGaugeCycle(runtime, reader, key, tokenId);
  const increased = await perform("increase", {
    kind: "increase",
    tokenId,
    amount0Desired,
    amount1Desired,
  });
  await perform("decrease", {
    kind: "decrease",
    tokenId,
    liquidity: increased.forecast.liquidityAfter,
  });
  const maximumCollect = (1n << 128n) - 1n;
  await perform("collect", {
    kind: "collect",
    tokenId,
    amount0Max: maximumCollect,
    amount1Max: maximumCollect,
  });
  const burned = await perform("burn", { kind: "burn", tokenId });
  if (!options.rebalance) return burned;
  // Rebalancing is a second mint after exiting. Failure leaves tokens in the wallet.
  runtime.report("Rebalance checkpoint", {
    closedTokenId: tokenId,
    next: "Mint a new range; the old NFT cannot be edited",
  });
  const replacement = await mint("replacement-mint", center + 10 * key.tickSpacing);
  await perform("replacement-decrease", {
    kind: "decrease",
    tokenId: replacement.tokenId,
    liquidity: replacement.forecast.liquidityAfter,
  });
  await perform("replacement-collect", {
    kind: "collect",
    tokenId: replacement.tokenId,
    amount0Max: maximumCollect,
    amount1Max: maximumCollect,
  });
  return perform("replacement-burn", { kind: "burn", tokenId: replacement.tokenId });
}
