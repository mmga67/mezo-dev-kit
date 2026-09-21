import { resolve } from "node:path";
import { createRpcTransport } from "@mezo-dev-kit/core";
import { parseUnitsExact } from "@mezo-dev-kit/evm";
import { createCLPoolReader, sortBasicPoolKey, sortCLPoolKey } from "@mezo-dev-kit/pools";
import type { LocalFork } from "./local-fork.ts";
import {
  fundMusd,
  fundToken,
  installOracleFixture,
  installNativeTokenFixture,
  lendingAssets,
  installLockTokens,
  installGaugeReward,
  advanceLocalTime,
  seedSavingsYield,
} from "./local-fixtures.ts";
import { readWalletToken } from "./token-units.ts";
import { requiredText, invariant } from "./validation.ts";
import { createHttpRequest } from "./rpc-request.ts";
import { saveCheckpoint } from "./checkpoint.ts";
import {
  borrowMusd,
  provideBasicLiquidity,
  swapTokens,
  saveMusd,
  lendAndBorrowMusdc,
  useUsdcVault,
  manageCLPosition,
  lockAndVote,
  redeemMusd,
  bridgeMusd,
} from "../index.ts";
import { swapConcentratedLiquidity } from "../swap-tokens/concentrated-liquidity.ts";
import { demonstrateMixedSwap } from "../swap-tokens/mixed.ts";
import { selectCLPool } from "../swap-tokens/select-cl-pool.ts";

export const recipeVariants: Readonly<Record<string, readonly string[]>> = {
  "borrow-musd": ["default"],
  "provide-basic-liquidity": ["default"],
  "swap-tokens": ["default", "cl", "mixed"],
  "bridge-musd": ["default"],
  "save-musd": ["default", "stake"],
  "lend-and-borrow-musdc": ["default", "supplier", "borrower"],
  "use-usdc-vault": ["default", "wrap"],
  "manage-cl-position": ["default", "stake", "rebalance"],
  "lock-and-vote": ["default"],
  "redeem-musd": ["default"],
};

/** Validate recipe-specific inputs before connecting to a writable fork. */
export function validateRecipe(
  recipe: string,
  variant: string,
  environment: NodeJS.ProcessEnv,
): void {
  invariant(
    recipeVariants[recipe]?.includes(variant),
    "Unknown recipe or variant; use --help and the recipe guide",
  );
  if (recipe === "bridge-musd")
    requiredText(environment.MDK_DESTINATION_RPC_URL, "MDK_DESTINATION_RPC_URL");
  if (
    recipe === "lock-and-vote" ||
    variant === "stake" ||
    variant === "wrap" ||
    variant === "borrower"
  )
    requiredText(environment.MDK_NATIVE_TOKEN_ARTIFACT, "MDK_NATIVE_TOKEN_ARTIFACT");
}

/** Fixture setup is visibly separate from each application workflow. */
export async function runRecipe(
  fork: LocalFork,
  recipe: string,
  variant: string,
  directory: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const runtime = fork.runtime;
  const artifact = () =>
    requiredText(environment.MDK_NATIVE_TOKEN_ARTIFACT, "MDK_NATIVE_TOKEN_ARTIFACT");
  switch (recipe) {
    case "borrow-musd":
      await installOracleFixture(fork);
      await fundMusd(fork, "100");
      await borrowMusd(runtime);
      return;
    case "redeem-musd":
      await installOracleFixture(fork);
      await fundMusd(fork, "200");
      await redeemMusd(runtime, fork.request);
      return;
    case "lock-and-vote":
      await installLockTokens(fork, artifact());
      await lockAndVote(runtime, (timestamp) => advanceLocalTime(fork, timestamp));
      return;
    case "save-musd":
      await fundMusd(fork, "200");
      if (variant === "stake") await installGaugeReward(fork, "savings-gauge", artifact());
      await saveMusd(runtime, {
        stake: variant === "stake",
        afterDeposit: () => seedSavingsYield(fork),
      });
      return;
    case "bridge-musd": {
      await fundMusd(fork, "20");
      const destination = createRpcTransport({
        id: "ntt-destination",
        request: createHttpRequest({
          url: requiredText(environment.MDK_DESTINATION_RPC_URL, "MDK_DESTINATION_RPC_URL"),
          policy: "read-only",
        }),
      });
      await bridgeMusd(runtime, destination, (checkpoint) =>
        saveCheckpoint(resolve(directory, "bridge.json"), checkpoint),
      );
      return;
    }
  }
  await installOracleFixture(fork);
  const assets = await lendingAssets(fork);
  const loan = await readWalletToken(runtime, {
    contractId: "lending.morpho",
    address: assets.loan,
  });
  await fundToken(fork, assets.morpho, assets.loan, parseUnitsExact("1000", Number(loan.decimals)));
  if (recipe === "lend-and-borrow-musdc") {
    const role = variant === "borrower" ? "borrower" : "supplier";
    if (role === "borrower")
      await installNativeTokenFixture(
        fork,
        assets.collateral,
        artifact(),
        parseUnitsExact("1", runtime.network.nativeCurrency.decimals),
        [assets.morpho],
      );
    await lendAndBorrowMusdc(runtime, {
      role,
      loanToken: assets.loan,
      collateralToken: assets.collateral,
    });
    return;
  }
  if (recipe === "use-usdc-vault") {
    if (variant === "wrap") await installGaugeReward(fork, "vault-gauge", artifact());
    await useUsdcVault(runtime, { loanToken: assets.loan, wrapAndStake: variant === "wrap" });
    return;
  }
  await fundMusd(fork, "1000");
  const musd = runtime.registry.resolve({
    contractId: "musd.token",
    networkId: runtime.network.id,
    blockNumber: fork.parent.number,
  });
  const pair = { tokenA: musd.address, tokenB: assets.loan };
  if (recipe === "provide-basic-liquidity") {
    await provideBasicLiquidity(runtime, sortBasicPoolKey({ ...pair, stable: true }));
    return;
  }
  if (recipe === "manage-cl-position") {
    const key = sortCLPoolKey({ ...pair, tickSpacing: 1 });
    if (variant === "stake") {
      const state = await createCLPoolReader({
        networkId: "mezo-mainnet",
        registry: runtime.registry,
        transport: runtime.transport,
      }).read({ key, account: runtime.account });
      invariant(state.gauge?.alive, "Selected CL pool has no live gauge");
      await installNativeTokenFixture(fork, state.gauge.rewardToken, artifact(), 0n, [
        state.gauge.address,
      ]);
    }
    await manageCLPosition(runtime, key, {
      stake: variant === "stake",
      rebalance: variant === "rebalance",
    });
    return;
  }
  invariant(recipe === "swap-tokens", "Recipe dispatch is incomplete");
  const clKey =
    variant === "cl" || variant === "mixed" ? await selectCLPool(runtime, pair) : undefined;
  if (variant === "mixed")
    await demonstrateMixedSwap(runtime, {
      tokenIn: musd.address,
      intermediateToken: assets.loan,
      tickSpacing: clKey!.tickSpacing,
      persist: (checkpoint) => saveCheckpoint(resolve(directory, "mixed-swap.json"), checkpoint),
    });
  else if (variant === "cl") {
    const token = await readWalletToken(runtime, {
      contractId: musd.contractId,
      address: musd.address,
    });
    await swapConcentratedLiquidity(runtime, {
      route: [{ tokenIn: musd.address, tokenOut: assets.loan, tickSpacing: clKey!.tickSpacing }],
      intermediateAssets: [],
      amountIn: parseUnitsExact("20", Number(token.decimals)),
    });
  } else await swapTokens(runtime, { tokenIn: musd.address, tokenOut: assets.loan });
}
