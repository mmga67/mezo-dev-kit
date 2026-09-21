# USDC Lending Vault

`@mezo-dev-kit/usdc-lending-vault` reads vault deposits and their lending allocation, calculates share conversions and wrapper yield, and provides direct vault and wrapper workflows.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the vault walkthrough](../../../examples/use-usdc-vault/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## What you can do

- Inspect a vault, wrapper receipts, beneficial gauge stake, and its Morpho allocation at one block.
- Preview deposit/mint/withdraw/redeem conversions and calculate wrapper harvest yield.
- Execute direct vault operations and wrapper wrap-and-stake/unwrap workflows.

The package composes [Lending](../musdc-lending/README.md) for the adapter
position. [Incentives](../incentives/README.md) handles direct gauge staking and
reward claims. The [ports and example](REFERENCE.md#ports-and-example) show the
required registry, transport, and ABI codec; writers add explicit Core execution.

## Values and scope

Vault assets already include their lending allocation. Vault shares, wrapper
receipts, Morpho shares, redirected yield, and gauge rewards are distinct; do
not add them as if they were separate deposits. Wallet receipts plus beneficial
gauge stake count once, and gauge custody may include donations.

Previews use fee-aware state and explicit rounding. Liquidity observations and
preview values do not guarantee transaction capacity. Unknown root runtime,
conflicting role links, or a changed block invalidate the snapshot.

This private Node package covers the recorded mainnet vault configuration.
Its bounded reader/interface review is accepted; writers require qualified
review before release. Curator allocation and other vault configurations are
outside the API. See [vault knowledge](../../../knowledge/protocols/vaults/usdc-lending/README.md)
for the accounting model and evidence.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/usdc-lending-vault check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
