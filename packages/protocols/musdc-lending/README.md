# BTC/mUSDC lending

`@mezo-dev-kit/musdc-lending` reads the BTC-collateralized mUSDC Morpho market, calculates shares, interest and health, and provides direct supply, collateral, borrow, and repayment workflows. mUSDC is distinct from MUSD.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the lending walkthrough](../../../examples/lend-and-borrow-musdc/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## What you can do

- Read a market and account at one block, including actual token liquidity.
- Calculate accrued interest, share conversions, debt, and price-dependent health.
- Prepare and reconcile supply, withdrawal, collateral, borrowing, and repayment operations.

The [API reference](REFERENCE.md#ports) describes explicit transport and codec
inputs. Writers use Core execution and separate token approvals; applications
own consent, RPC policy, and durable storage.

## Values and scope

Supply shares, borrow shares, BTC collateral, and mUSDC assets use distinct
units. Use bigint base units and preserve result tags. Accounting liquidity and
actual token balances are separate; neither guarantees transaction capacity.

Price freshness is an explicit caller policy evaluated at the requested block.
A zero-debt position needs no price; unknown debt is not zero. Stale, missing,
future, or conflicting prices stay explicit failures, with no automatic fallback.
See [results and freshness](REFERENCE.md#results-freshness-and-errors).

This private Node package covers the recorded mainnet market. Its bounded
reader review is accepted; direct writers require qualified review before
release. Liquidation and delegated-account flows are outside the API. The
[lending knowledge](../../../knowledge/protocols/lending/musdc/README.md)
contains the market model and evidence.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/musdc-lending check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
