# Borrow and repay MUSD

## Read the focused operation

Start with [Open one position](open-position.ts) beside the [connection guide](../SETUP.md).
Pass BTC collateral and MUSD borrowing in their own base units, a unique operation ID and BorrowingBounds. The function constructs the reader and execution client explicitly and returns the reconciled position. The lifecycle below reads precision and supplies illustrative amounts/fee limits, then adds collateral, repays and closes.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [Inputs](config.ts) · [SDK](../../packages/protocols/musd-borrowing/REFERENCE.md)

```sh
MDK_RUN_ID=borrow-01 pnpm --filter @mezo-dev-kit/examples borrow-musd --mode fork
```

Open a position with 1 BTC and 3,000 MUSD of requested borrowing, add 0.1 BTC,
repay 50 MUSD, then close. The unused local account needs native gas and the
runner provides 100 additional MUSD for fees and interest. Each operation reads
the current price, system mode and debt and obtains bounded sorted-list hints.

Read the printed forecast beside settlement: borrowing fees increase debt;
interest can accrue between preparation and inclusion. The close uses actual
net debt and returns the collateral. Success ends with `closed-by-owner`, zero
debt and zero collateral. Repayment/close burns MUSD directly through the
protocol; no ERC-20 allowance is required for this path.

Change illustrative amounts and fee/risk limits in `config.ts`. A hint-search
timeout or fee/collateral bound failure stops before submission. A confirmed
transaction with `boundsSatisfied: false` must be inspected: these caller
policies are not all encoded as contract deadline/minimum arguments. See the
SDK for other adjustment, refinance and surplus-claim actions and their
eligibility requirements.
