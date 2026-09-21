# MUSD redemptions

Understand redemption ordering, position eligibility, hints, fees, and settlement. These records explain how MUSD is redeemed through classic borrower positions.

## Start here

- [Redemption explanation](../../../../docs/reference/musd-redemptions.md): how ordering and settlement work.
- [Redemption reference](generated/reference.md): the recorded model, formulas, and parameters.
- [Redemption SDK](../../../../packages/protocols/musd-redemptions/README.md): bounded discovery, output simulation, execution, and reconciliation.
- [Borrowing model](../borrowing/README.md): underlying position state and calculations.

## Scope and evidence

The knowledge is supported and reviewed for its declared deployment scope.
The private SDK's implementation and release status are documented separately.

The deployed entrypoint has no minimum-received parameter. Quote freshness and
exact-output simulation enforce a preflight policy, not an on-chain received-amount
guarantee. Settlement must preserve actual outputs, fees, and position changes.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
