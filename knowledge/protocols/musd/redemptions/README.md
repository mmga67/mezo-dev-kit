# MUSD redemptions

A redemption uses MUSD to settle debt through eligible classic borrower positions.
The order of those positions, their eligibility, and the fee calculation affect
the result. Hints help locate positions for the contract call; settlement records
what was actually received and which positions changed.

Use this directory to follow that process and understand the difference between
an expected output and the amount a transaction ultimately delivers.

## Follow a redemption

First distinguish redemption from repayment: repayment reduces your own loan,
whereas redemption works through eligible borrower positions selected under
the protocol's rules. Those positions use the
[borrowing model](../borrowing/README.md), including its complete debt amounts.

Selection follows the deployed position list and eligibility checks. Hints
are inputs that help locate positions and place a partially redeemed position
back into the list; they do not guarantee a fill. The
[redemption explanation](../../../../docs/reference/musd-redemptions.md)
connects ordering, partial fills, fees and the final changes to positions.

The [Redemption SDK](../../../../packages/protocols/musd-redemptions/README.md)
provides bounded discovery, hints, output simulation and settlement checks.
Its simulation adapter needs a provider that supports the required trace
methods. A successful call without output information is not enough to check
how much a redemption would deliver.

## Understand the output limit

The deployed contract call has no input for a minimum amount received. Checking
a recent quote and simulating the exact output lets an application enforce a
policy before signing. State may still change before the transaction is included,
so those checks do not create a contract-enforced output guarantee.

After inclusion, compare the actual output, fee and position changes with what
was requested. A confirmed redemption that misses an application's output bound
must be reported as that outcome, not automatically submitted again.
The SDK documentation above explains its private implementation and release
limits. Apply the rules for the recorded contract version and use current
inputs when preparing a transaction.

## Quick links

| Link                                                                        | What you will find                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Redemption explanation](../../../../docs/reference/musd-redemptions.md)    | Ordering, hints, full and partial fills, fees and settlement.   |
| [Rules and formulas](generated/reference.md)                                | The recorded redemption model and parameters.                   |
| [Redemption SDK](../../../../packages/protocols/musd-redemptions/README.md) | Discovery, simulation requirements and checking actual outputs. |
| [Borrowing model](../borrowing/README.md)                                   | The positions and debt calculations used by redemptions.        |
| [Module index](index.json)                                                  | Exact rule, parameter, fixture and evidence records.            |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
