# MUSD redemptions

A redemption uses MUSD to settle debt through eligible classic borrower positions.
The order of those positions, their eligibility, and the fee calculation affect
the result. Hints help locate positions for the contract call; settlement records
what was actually received and which positions changed.

Use this directory to follow that process and understand the difference between
an expected output and the amount a transaction ultimately delivers.

## Follow a redemption

- [Redemption explanation](../../../../docs/reference/musd-redemptions.md): how ordering and settlement work.
- [Redemption reference](generated/reference.md): the recorded model, formulas, and parameters.
- [Redemption SDK](../../../../packages/protocols/musd-redemptions/README.md): find eligible positions, simulate outputs, and check the settled result.
- [Borrowing model](../borrowing/README.md): underlying position state and calculations.

## Understand the output limit

The deployed entrypoint has no minimum-received parameter. Quote freshness and
exact-output simulation enforce a preflight policy, not an on-chain received-amount
guarantee. Settlement must preserve actual outputs, fees, and position changes.
The SDK documentation above explains its private implementation and release
limits. Apply the rules for the recorded contract version and use current
inputs when preparing a transaction.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
