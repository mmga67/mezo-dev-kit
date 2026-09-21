# Quote, swap and inspect output

## Read the focused operation

Start with [Swap one route](swap.ts) beside the [connection guide](../SETUP.md).
Pass one explicit BasicSwapQuoteInput route (the connection supplies account), a unique operation ID and BasicSwapBounds. The output minimum is denominated in the output token; the deadline is absolute Unix seconds. The lifecycle below compares candidates first, derives bounds and calls this operation.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Basic code](workflow.ts) · [Inputs](config.ts) · [SDK](../../packages/swaps/REFERENCE.md)

```sh
MDK_RUN_ID=swap-01 pnpm --filter @mezo-dev-kit/examples swap-tokens --mode fork
MDK_RUN_ID=swap-cl-01 pnpm --filter @mezo-dev-kit/examples swap-tokens --mode fork --variant cl
MDK_RUN_ID=swap-mixed-01 pnpm --filter @mezo-dev-kit/examples swap-tokens --mode fork --variant mixed
```

The default compares two explicitly supplied basic MUSD→mUSDC routes: stable
and volatile. Missing optional candidates stay visible. This is bounded
candidate comparison, not an exhaustive route search or a gas-adjusted promise.
Swap 20 MUSD through the best compatible quoted candidate, after an exact
approval if needed. The output prints actual mUSDC received against the minimum.

The minimum retains 99.5% of the estimate; the deadline is 300 seconds. Approvals
may move the chain forward, so preparation quotes again while retaining the
original authorized minimum. An unfavorable change requires a new decision.

[The CL variant](concentrated-liquidity.ts) checks the explicit tick-spacing
candidates 1, 10, 50, 100, 200 and 2000 for active compatible liquidity and
limits traversal to 64 steps, 16 bitmap words and 16 crossed ticks. Its function
also accepts a contiguous multi-hop CL route and an explicit intermediate-asset
list; each pool must exist and the full quote must fit the budget.

[The mixed variant](mixed.ts) executes a basic swap, persists actual intermediate
funds, then intentionally rejects a CL return swap with an impossible minimum.
Success means **the second leg was rejected and the intermediate tokens remain
in the wallet**. These are separate transactions. The checkpoint in
`local/examples/<run-id>/mixed-swap.json` is evidence for choosing a fresh CL
quote, not permission to replay either leg. Use the CL function with the
settled intermediate amount and newly chosen minimum to continue.
