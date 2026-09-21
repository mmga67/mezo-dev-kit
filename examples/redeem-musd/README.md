# Redeem MUSD for BTC collateral

## Read the focused operation

Start with [Redeem within output bounds](redeem.ts) beside the [connection guide](../SETUP.md).
Pass a bounded RedemptionQuoteInput, RedemptionBounds and the public RedemptionOutputSimulator port. Minimum actual amount uses MUSD base units; minimum net collateral uses BTC base units. The workflow below constructs the trace adapter, derives minimums from its output and calls this focused redemption.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [SDK](../../packages/protocols/musd-redemptions/REFERENCE.md)

```sh
MDK_RUN_ID=redeem-01 pnpm --filter @mezo-dev-kit/examples redeem-musd --mode fork
```

Fund 200 MUSD locally and request a 100 MUSD redemption. Inspect at most 32 tail
entries, allow at most 10 redemption iterations and use three hint trials. The
quote may truncate the requested amount to what that bounded queue can attempt.
This redeems through TroveManager; it does not trade through a DEX.

The trace adapter requires `debug_traceCall` with `callTracer` and logs. It
extracts the exact simulated redemption amounts before the final preparation
sets positive minimum MUSD burned and net BTC received. Empty `eth_call`
return data is insufficient to establish output. A node without compatible
tracing stops before submission.

Expected output separates requested, attempted and actually redeemed MUSD,
gross collateral, the collateral fee, net BTC and transaction gas. Partial
fills are valid only when the actual result still meets the chosen minima.
The example caps the redemption rate at 1% and allows 0.5% output tolerance;
change those inputs explicitly if the current state cannot meet them.

MUSD is burned directly, so no token approval is needed. Hints can become
invalid and fees can change; read `boundsSatisfied` after confirmation. Do not
automatically redeem again after an unexpected settled output.
