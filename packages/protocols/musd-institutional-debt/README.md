# Institutional MUSD debt

`@mezo-dev-kit/musd-institutional-debt` reads institutional MUSD positions and Enclave roles and calculates fees, repayment, and health. Use it to inspect this debt model separately from classic MUSD borrower positions.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the institutional debt walkthrough](../../../examples/institutional-debt/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Read a bounded snapshot

`createInstitutionalReader` verifies the recorded mainnet contract generations
and returns selected positions or exact target-selector pairs at one block.
The [API reference](REFERENCE.md) defines selection limits and optional UTXO data.
Applications provide a transport and choose the account/position scope.

A failed optional price read preserves available debt and collateral while
marking health unavailable. Required read, identity, or accounting failures
reject the snapshot. A selected subset is not a complete institutional inventory.

## Scope

This private Node package provides reads and pure calculations; it implements
no partner writer or liquidation operation. Qualified review and release remain
outstanding. Enclave role membership does not authorize execution, and recorded
UTXOs do not prove Bitcoin custody, unspent state, or a backing ratio.

See [institutional debt knowledge](../../../knowledge/protocols/musd/institutional-debt/README.md)
for the separate position, fee, and custody evidence boundaries.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/musd-institutional-debt check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
