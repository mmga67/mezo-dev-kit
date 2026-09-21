# The MUSD system

Learn the shared MUSD terminology, component roles, units, and parameter ownership. Start here before exploring a particular borrowing, redemption, Savings, or institutional debt workflow.

## Start here

- [MUSD explanation](../../../docs/reference/musd-system.md): how the system fits together.
- [System reference](generated/reference.md): the recorded components and their responsibilities.
- [Borrowing](borrowing/README.md) and [redemptions](redemptions/README.md): classic collateralized debt and settlement.
- [Savings](savings/README.md) and [institutional debt](institutional-debt/README.md): separate accounting models.
- [BTC/mUSDC lending](../lending/musdc/README.md): the independent market for bridged USDC.

## Scope and evidence

The shared model is supported and reviewed for its declared source and deployment
scope. Governed values and deployment state still change; follow the recorded
sources and observation dates.

Savings principal/yield and institutional positions do not enter classic trove,
collateral-ratio, Stability Pool, or redemption accounting. mUSDC is a different
asset from MUSD. Contracts owns deployments and ABIs; Prices owns reusable feed
semantics, while MUSD owns its configured oracle policy.

For implemented workflows and their release status, use the [SDK reference](../../../docs/reference/sdk.md).

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
