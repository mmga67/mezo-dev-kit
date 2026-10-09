# MUSD borrowing and collateral

Classic MUSD borrowing records collateral and debt in a position called a trove.
Collateral requirements and liquidation rules determine how that position is
treated as its debt, interest, and collateral value change. Refinancing changes
the borrowing terms under the rules of the deployed contract version.

Use this directory to understand a position, follow its debt calculation, and
find the evidence behind those rules. Institutional debt uses a separate
position model.

## Understand a borrowing position

Start with what the borrower owes and what secures it. The trove records BTC
collateral and debt, but the stored amounts are only part of a complete view.
Interest may have accrued since the last update, and debt or collateral changes
from liquidations may still be pending. The
[borrowing explanation](../../../../docs/reference/musd-borrowing.md#position-and-debt-model)
shows how these amounts fit together.

That complete debt matters when assessing the position. Its collateral ratio
compares collateral value with debt, using the protocol's price. The
[safety-ratio explanation](../../../../docs/reference/musd-borrowing.md#safety-ratios-and-modes)
distinguishes this risk measure from the ratio used to order positions and the
system-wide measure used to determine Recovery Mode, which changes the allowed
borrower operations.

With those distinctions in place, follow an action such as adding collateral,
repaying debt or refinancing. Each has its own conditions and effects.
The [borrowing reference](generated/reference.md) provides the recorded formulas;
the [Borrowing SDK](../../../../packages/protocols/musd-borrowing/README.md)
explains the readers, calculations and direct borrower workflows that implement them.

## Applying the rules

Read a borrower's state and the applicable parameters at an explicit block.
When preparing an operation, the SDK documentation identifies the private workflows available and
their release limits; a recorded position is not a current borrowing quote.

[Institutional positions](../institutional-debt/README.md) use a separate model
and do not enter classic borrower or system collateral ratios, Recovery Mode,
Stability Pool or liquidation accounting.

Refinancing has a documented source disagreement. The
[fee explanation](../../../../docs/reference/musd-borrowing.md#evidence-resolution-refinance-fee)
shows why the contract source and observed parameters for the recorded version
take precedence over the older descriptive fee statement.

## Quick links

| Link                                                                                                   | What you will find                                                  |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [Borrowing explanation](../../../../docs/reference/musd-borrowing.md)                                  | How positions, debt, borrower actions and liquidation fit together. |
| [Rules and formulas](generated/reference.md)                                                           | Recorded calculations and operation capability states.              |
| [Borrowing SDK](../../../../packages/protocols/musd-borrowing/README.md)                               | Position reads, calculations and direct borrower workflows.         |
| [Refinancing evidence](../../../../docs/reference/musd-borrowing.md#evidence-resolution-refinance-fee) | The recorded fee calculation and disagreement with older prose.     |
| [Institutional debt](../institutional-debt/README.md)                                                  | The separate custody and position model.                            |
| [Module index](index.json)                                                                             | Exact position, parameter, operation, evidence and fixture records. |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
