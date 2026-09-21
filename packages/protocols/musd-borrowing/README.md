# MUSD borrowing

`@mezo-dev-kit/musd-borrowing` reads classic MUSD borrower positions, calculates debt and collateral changes, and executes direct borrower operations. It includes sorted insertion hints and receipt/state reconciliation.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the borrowing walkthrough](../../../examples/borrow-musd/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Available operations

Read a borrower at one block, inspect debt and collateral, or prepare opening,
adding/withdrawing BTC collateral, borrowing more MUSD, partial repayment,
combined adjustment, refinancing, closing, and claiming collateral surplus.
The [reader](REFERENCE.md#reader), [calculations](REFERENCE.md#pure-functions),
and [writer](REFERENCE.md#writer) sections describe their exact inputs.

Applications provide RPC requests, an explicit signer, consent, timeouts,
confirmation policy, and durable submission storage. Native BTC collateral and
protocol MUSD burns do not require token approvals.

## Implementation and release status

All nine direct operations are available through this private workspace package.
Private implementation review was accepted on 2026-09-15 for the recorded
mainnet identity and local-fork scope. Canonical public-writer support remains
proposed, and package publication is separate.

The integration harness models Mezo's native oracle and uses labelled local
funding/surplus fixtures. It tests the EVM workflow within those limits; see
[verification scope](REFERENCE.md#verification-scope).

Node is required for runtime hashing. Testnet, smart accounts, relayed
signatures, liquidation, and emergency close with minting disabled are outside
this writer. Use the separate [Redemptions package](../musd-redemptions/README.md)
for redemption workflows and [borrowing knowledge](../../../knowledge/protocols/musd/borrowing/README.md)
for the underlying model.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/musd-borrowing check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
