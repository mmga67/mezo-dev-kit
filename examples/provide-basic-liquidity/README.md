# Provide basic-pool liquidity

## Read the focused operation

Start with [Add liquidity](add.ts) beside the [connection guide](../SETUP.md).
Pass a sorted BasicPoolKey, desired amounts in token0/token1 base units and BasicLiquidityBounds. Follow both independent token approvals and inspect actual amounts and LP issuance. The lifecycle below derives minimums from the public forecast, calls this operation, then generates fees and exits.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [Inputs](config.ts) · [SDK](../../packages/protocols/pools/REFERENCE.md)

```sh
MDK_RUN_ID=liquidity-01 pnpm --filter @mezo-dev-kit/examples provide-basic-liquidity --mode fork
```

Discover the initialized stable MUSD/mUSDC pool, approve its verified router,
and offer up to 50 of each token. The pool's ratio determines actual amounts
used and LP shares received. A small swap in that same pool then creates fees
for the demonstration. Remove half the new LP balance, remove the rest, and
collect the wallet's earned fees after exiting.

The runner funds both tokens locally and requires an account with no existing
LP shares in this pool. Token0/token1 order comes from the sorted key, and each
token's decimals come from its reader. Expected success prints added shares,
actual withdrawals, zero remaining wallet LP shares and positive collected fees.

Forecasts establish token minima and an LP-output minimum with 0.5% tolerance.
Requested token maxima differ from actual spend. The LP minimum includes
post-settlement policy; inspect `boundsSatisfied`. A missing pool, changed
allowance, expired deadline or insufficient output stops the next action.
Unused approval may remain after consuming less than the offered maximum;
the next preparation reads it again. LP principal and claimable fees are
separate balances.
