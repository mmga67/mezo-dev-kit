# Manage a concentrated-liquidity NFT

## Read the focused operation

Start with [Mint one CL position](mint.ts) beside the [connection guide](../SETUP.md).
Pass a sorted CLPoolKey, aligned tick bounds, desired token amounts and CLPositionBounds. The two token minima and square-root price bounds protect different parts of the operation. Use the settled NFT ID. The lifecycle below derives a concrete range and bounds, calls this mint and demonstrates management and exit.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [Gauge code](gauge.ts) · [SDK](../../packages/protocols/pools/REFERENCE.md)

```sh
MDK_RUN_ID=cl-position-01 pnpm --filter @mezo-dev-kit/examples manage-cl-position --mode fork
MDK_RUN_ID=cl-rebalance-01 pnpm --filter @mezo-dev-kit/examples manage-cl-position --mode fork --variant rebalance
# Requires MDK_NATIVE_TOKEN_ARTIFACT.
MDK_RUN_ID=cl-stake-01 pnpm --filter @mezo-dev-kit/examples manage-cl-position --mode fork --variant stake
```

Select the initialized MUSD/mUSDC pool with tick spacing 1. Build a range around
its current tick, aligned to that spacing, and offer up to 50 of each token.
Mint an NFT, increase its liquidity, remove all liquidity, collect owed tokens,
then burn the empty NFT. The event-derived token ID identifies every later action.

The position's range determines which assets it needs. A zero amount minimum
is used only where the forecast requires/owes zero of that token. Price bounds,
amount minima and liquidity minima protect the chosen operation. Removing
liquidity credits owed tokens; collection pays the wallet; burning is allowed
only after clearing both liquidity and owed amounts.

The `stake` variant approves this NFT, stakes it in its verified live gauge,
claims available rewards and returns it before managing liquidity. The
`rebalance` variant closes the original NFT and mints a shifted range under a
new ID, then closes that replacement too. If the new mint fails, the already
withdrawn assets remain in the wallet. A range change is not an NFT field edit.
