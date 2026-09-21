import type { ExampleRuntime } from "../runtime/example-runtime.ts";
import { readWalletToken } from "../runtime/token-units.ts";
import { swapTokens } from "./workflow.ts";
import { swapConcentratedLiquidity } from "./concentrated-liquidity.ts";
import { invariant } from "../runtime/validation.ts";

/** Deliberately reject the second transaction and show the retained intermediate funds. */
export async function demonstrateMixedSwap(
  runtime: ExampleRuntime,
  input: {
    readonly tokenIn: `0x${string}`;
    readonly intermediateToken: `0x${string}`;
    readonly tickSpacing: number;
    readonly persist: (checkpoint: {
      readonly intermediateToken: `0x${string}`;
      readonly realizedAmount: string;
    }) => Promise<void>;
  },
): Promise<void> {
  const before = await readWalletToken(runtime, {
    contractId: "mezo-earn.router",
    address: input.intermediateToken,
  });
  const first = await swapTokens(runtime, {
    tokenIn: input.tokenIn,
    tokenOut: input.intermediateToken,
    step: "mixed-first",
  });
  const checkpoint = {
    intermediateToken: input.intermediateToken,
    realizedAmount: first.amountOut.toString(),
  };
  await input.persist(checkpoint);
  runtime.report("Separate-transaction checkpoint", checkpoint);
  try {
    // This impossible minimum is a deliberate failure demonstration, not a slippage default.
    await swapConcentratedLiquidity(runtime, {
      route: [
        {
          tokenIn: input.intermediateToken,
          tokenOut: input.tokenIn,
          tickSpacing: input.tickSpacing,
        },
      ],
      intermediateAssets: [],
      amountIn: first.amountOut,
      minimumOutput: 1n << 255n,
      step: "mixed-second",
    });
    throw new Error("Expected the demonstration minimum to reject the second leg");
  } catch (error) {
    invariant(
      error instanceof Error && "code" in error && error.code === "BoundExceeded",
      "Unexpected second-leg failure; inspect the saved journal",
    );
    const after = await readWalletToken(runtime, {
      contractId: "mezo-earn.router",
      address: input.intermediateToken,
    });
    invariant(
      after.balance - before.balance === first.amountOut,
      "Intermediate custody changed unexpectedly",
    );
    runtime.report("Second leg rejected before submission", {
      retained: first.amountOut,
      token: input.intermediateToken,
      next: "Choose a fresh CL quote and minimum explicitly; never repeat the first swap",
    });
  }
}
