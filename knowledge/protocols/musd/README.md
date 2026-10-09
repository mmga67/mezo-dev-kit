# The MUSD system

MUSD connects several activities with different accounting rules: borrowing
against collateral, redeeming MUSD through borrower positions, earning Savings
yield, and managing institutional debt. Understanding one activity does not mean
its balances or rules apply to the others.

This directory explains the shared terms, components, and units, then routes you
to the activity you need. MUSD and mUSDC are different assets; the BTC/mUSDC
lending market has its own model.

## Choose an activity

For an individual loan, start with [borrowing](borrowing/README.md). It explains
how BTC collateral and MUSD debt are tracked in a borrower position, called a
trove. Repaying that loan changes the borrower's own debt.

[Redemption](redemptions/README.md) is a different process: a holder uses MUSD
to settle debt through eligible borrower positions. Which positions are selected,
the fees and the amount actually received all matter to the result.

[Savings](savings/README.md) follows deposited MUSD, receipt tokens and yield.
[Institutional debt](institutional-debt/README.md) follows positions and pledges
connected to Enclave custody. Each has its own accounting; start with its page
before combining balances or interpreting a position.

The [MUSD explanation](../../../docs/reference/musd-system.md) connects the
shared terms and components. Use the [system reference](generated/reference.md)
when you need the recorded responsibilities of a particular component.

## Keep the accounting separate

Savings balances and institutional positions do not belong in classic borrower
collateral ratios, redemption calculations or Stability Pool accounting. The
Stability Pool participates in settling liquidated borrower debt; its rules
belong to the classic borrowing model.

MUSD and mUSDC also need separate treatment. The
[BTC/mUSDC lending market](../lending/musdc/README.md) uses bridged USDC and its
own market model. Similar names do not make the assets or debt rules interchangeable.

When applying a rule, follow its source and observation date. The
[Contracts module](../../contracts/README.md) owns deployments and contract
interfaces, and [Prices](../../prices/README.md) explains reusable price-source
rules. MUSD's own model defines how its configured oracle is used. Governed
parameters and deployments can change, so a saved value is not a timeless constant.

For implemented workflows and their release status, use the [SDK reference](../../../docs/reference/sdk.md).

## Quick links

| Link                                                       | What you will find                                       |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| [MUSD explanation](../../../docs/reference/musd-system.md) | Shared terms, component roles and accounting boundaries. |
| [System reference](generated/reference.md)                 | Recorded components and their responsibilities.          |
| [Borrowing](borrowing/README.md)                           | Individual collateral, debt, interest and repayment.     |
| [Redemptions](redemptions/README.md)                       | Position selection, fees and settlement.                 |
| [Savings](savings/README.md)                               | Deposited principal, receipt tokens and yield.           |
| [Institutional debt](institutional-debt/README.md)         | Enclave custody, pledges and the separate debt model.    |
| [BTC/mUSDC lending](../lending/musdc/README.md)            | The independent lending market for bridged USDC.         |
| [SDK reference](../../../docs/reference/sdk.md)            | Implemented workflows and their requirements.            |
| [Module index](index.json)                                 | Exact terminology, model, source and evidence records.   |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
