import { swapExactInput } from "./swap.ts";
import { createBasicPoolReader } from "@mezo-dev-kit/pools";
import { createBasicSwapReader } from "@mezo-dev-kit/swaps";
import type { BasicSwapOutcome } from "@mezo-dev-kit/swaps";
import { createSwapQuoteReader } from "@mezo-dev-kit/swaps/quotes";
import { parseUnitsExact } from "@mezo-dev-kit/evm";
import { readWalletToken } from "../runtime/token-units.ts";

import { minimumAfterSlippage } from "../runtime/bounds.ts";
import type { ExampleRuntime } from "../runtime/example-runtime.ts";

import { invariant } from "../runtime/validation.ts";
import { swapConfig } from "./config.ts";

/** Compare the supplied basic pool candidates, execute one, and verify actual receipt output. */
export async function swapTokens(
  runtime: ExampleRuntime,
  input: {
    readonly tokenIn: `0x${string}`;
    readonly tokenOut: `0x${string}`;
    readonly stableOnly?: boolean;
    readonly step?: string;
  },
): Promise<Readonly<BasicSwapOutcome>> {
  const config = {
    networkId: "mezo-mainnet",
    registry: runtime.registry,
    transport: runtime.transport,
  } as const;
  const pools = createBasicPoolReader(config);
  const reader = createBasicSwapReader({ ...config, pools });
  const comparator = createSwapQuoteReader({
    networkId: "mezo-mainnet",
    transport: runtime.transport,
    basic: reader,
  });
  const token = await readWalletToken(runtime, {
    contractId: "mezo-earn.router",
    address: input.tokenIn,
  });
  const amountIn = parseUnitsExact(swapConfig.amount, Number(token.decimals));
  // Optional candidates remain visible when their pool is missing. This is a
  // comparison of two supplied routes, not an exhaustive route search.
  const comparison = await comparator.quote({
    tokenIn: input.tokenIn,
    tokenOut: input.tokenOut,
    account: runtime.account,
    amountIn,
    maxAgeBlocks: swapConfig.maxAgeBlocks,
    eligibility: "writer-compatible",
    candidates: (input.stableOnly ? [true] : [true, false]).map((stable) => ({
      id: stable ? "stable" : "volatile",
      family: "basic",
      required: false,
      intermediateAssets: [],
      route: [{ tokenIn: input.tokenIn, tokenOut: input.tokenOut, stable }],
    })),
  });
  runtime.report("Compared routes", {
    state: comparison.state,
    best: comparison.best,
    coverage: comparison.coverage,
    candidates: comparison.candidates.map((candidate) => ({
      id: candidate.id,
      status: candidate.status,
    })),
    gas: comparison.gas,
    priceImpact: comparison.priceImpact,
  });
  const selected = comparison.candidates.find((candidate) => candidate.id === comparison.best);
  invariant(
    selected?.status === "quoted" && selected.family === "basic",
    "No complete compatible basic route is available",
  );
  const quote = {
    route: selected.quote.route,
    intermediateAssets: selected.quote.intermediateAssets,
    account: runtime.account,
    amountIn,
    maxAgeBlocks: swapConfig.maxAgeBlocks,
  };
  const bounds = {
    amountOutMinimum: minimumAfterSlippage(
      selected.quote.estimatedAmountOut,
      swapConfig.slippageBps,
    ),
    deadline: selected.quote.timestamp + swapConfig.deadlineSeconds,
    maxDeadlineSeconds: swapConfig.deadlineSeconds,
  };
  const outcome = await swapExactInput(
    runtime,
    {
      operationId: runtime.operationId(input.step ?? "swap"),
      quote,
      bounds,
    },
    runtime.polling,
  );
  runtime.report("Swap settled", outcome);
  return outcome;
}
