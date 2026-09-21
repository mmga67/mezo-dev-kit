# MUSD Savings

`@mezo-dev-kit/musd-savings` reads Savings principal and indexed yield, calculates distributions, and provides deposit, withdrawal, and yield-claim workflows.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the Savings walkthrough](../../../examples/save-musd/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## What you can do

- Read wallet receipts, claimable yield, discovered Savings roles, and beneficial gauge stake at one block.
- Calculate indexed yield and distributions without RPC calls.
- Prepare, simulate, submit, and reconcile direct deposits, withdrawals, and yield claims.

Use [Incentives](../incentives/README.md) for gauge staking, unstaking, and reward
claims. Unstake gauge-held principal before withdrawing it through Savings.

## Integration and scope

Use `createSavingsRpcReader` with Core's RPC transport, or supply the
[reader's transport and codec ports](REFERENCE.md#adapter-contract) explicitly.
Writers also need Core execution, consent, and durable submission storage.
Deposits may need a separate MUSD approval; prepare again after it confirms.

Principal receipts and indexed MUSD yield are separate values. Gauge custody
can include donations and must not be added to beneficial principal. Check each
optional result before using it; missing data is unavailable, never zero.

This private mainnet package has an accepted bounded reader review. Direct
writers remain candidates requiring qualified review before release. Runtime
hashing uses Node crypto; browser integration is unverified. The
[Savings model](../../../knowledge/protocols/musd/savings/README.md) explains
accounting separately from classic MUSD borrowing.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/musd-savings check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
