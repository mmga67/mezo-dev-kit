# The MUSD system

MUSD connects several activities with different accounting rules: borrowing
against collateral, redeeming MUSD through borrower positions, earning Savings
yield, and managing institutional debt. Understanding one activity does not mean
its balances or rules apply to the others.

This directory explains the shared terms, components, and units, then routes you
to the activity you need. MUSD and mUSDC are different assets; the BTC/mUSDC
lending market has its own model.

## Choose an activity

- [MUSD explanation](../../../docs/reference/musd-system.md): how the system fits together.
- [System reference](generated/reference.md): the recorded components and their responsibilities.
- [Borrowing](borrowing/README.md) and [redemptions](redemptions/README.md): classic collateralized debt and settlement.
- [Savings](savings/README.md) and [institutional debt](institutional-debt/README.md): separate accounting models.
- [BTC/mUSDC lending](../lending/musdc/README.md): the independent market for bridged USDC.

## Keep the accounting separate

Savings principal/yield and institutional positions do not enter classic trove,
collateral-ratio, Stability Pool, or redemption accounting. mUSDC is a different
asset from MUSD. Contracts owns deployments and ABIs; Prices owns reusable feed
semantics, while MUSD owns its configured oracle policy. Governed parameters and
deployments can change; use the source and observation date attached to the
selected rule.

For implemented workflows and their release status, use the [SDK reference](../../../docs/reference/sdk.md).

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
