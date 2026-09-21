# MUSD Savings

Understand Savings principal receipts, indexed MUSD yield, and the relationship between wallet holdings and gauge stake. Savings accounting is separate from classic MUSD debt.

## Start here

- [Savings reference](generated/reference.md): principal, yield, roles, and double-counting guards.
- [Savings SDK](../../../../packages/protocols/musd-savings/README.md): read, calculate, deposit, withdraw, and claim yield.
- [Incentives knowledge](../../incentives/README.md): gauge rewards and voting.
- [Shared MUSD explanation](../../../../docs/reference/musd-system.md): the wider system.

## Scope and evidence

The bounded knowledge review is accepted while support remains proposed.
Each proxy generation and observation retains its own coordinate and evidence
limits; package docs describe the separately reviewed reader and private writers.

Deposits create principal receipts one-for-one; yield is indexed and paid
separately. Savings balances do not enter classic troves, collateral ratios,
the Stability Pool, or the redemption queue. Gauge stake, custody, and redirected
yield must not be counted as extra principal.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
