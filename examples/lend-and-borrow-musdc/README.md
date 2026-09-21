# Supply or borrow in the BTC/mUSDC market

## Read the focused operation

Start with [Supply mUSDC](supply.ts) beside the [connection guide](../SETUP.md).
Pass a unique operation ID, loan-token base units and LendingBounds. The target resolver verifies discovered market roles, and settlement returns actual assets and shares. The supplier lifecycle calls this function before withdrawing actual shares; the borrower lifecycle explains collateral, debt and full repayment separately.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[borrow.ts](borrow.ts) shows one borrow against an already collateralized position,
with explicit construction and no token approval. The borrower lifecycle below
supplies collateral first, then calls that function and repays the actual debt shares.

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [SDK](../../packages/protocols/musdc-lending/REFERENCE.md)

```sh
MDK_RUN_ID=lender-01 pnpm --filter @mezo-dev-kit/examples lend-and-borrow-musdc --mode fork --variant supplier
# Requires MDK_NATIVE_TOKEN_ARTIFACT for BTC collateral token dispatch.
MDK_RUN_ID=borrower-01 pnpm --filter @mezo-dev-kit/examples lend-and-borrow-musdc --mode fork --variant borrower
```

The supplier deposits 100 mUSDC and withdraws the resulting supply shares. The
borrower supplies 0.01 BTC collateral, borrows 100 mUSDC, repays all actual debt
shares, and withdraws collateral. These use separate empty-account runs in the
verified deployed market. They do not select arbitrary Morpho markets.

Assets are token amounts; shares track the account's fraction of the market.
Interest changes their conversion. For a full repayment, use the latest borrow
shares so rounding cannot leave debt behind. The local runner pre-funds mUSDC
to cover interest, and the borrower fixture preserves the market's captured
native-token custody. Success reports the before/after market position and
actual assets and shares for each action.

The writer checks price freshness, headroom, token liquidity and quantity
bounds. Passing a health calculation alone does not guarantee that the market
can deliver tokens. A stale oracle, insufficient liquidity or changed bounds
stops the sequence. Classic MUSD borrowing is a different protocol; see the
[MUSD borrower example](../borrow-musd/README.md).
