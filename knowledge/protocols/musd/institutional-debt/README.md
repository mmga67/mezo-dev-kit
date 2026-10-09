# Institutional MUSD debt

Institutional MUSD debt connects assets held through Enclave custody with debt
positions and collateral pledges. Custody activity and debt accounting are
separate: an asset movement alone does not establish that a position's debt or
pledge changed.

This directory explains the roles, positions, fees, repayment, and health
calculations on Mezo Mainnet. It helps you trace a position change through the
matching debt-manager call, event, and resulting state.

## Trace a position

- [Institutional debt reference](generated/reference.md): roles, positions, formulas, and aggregate boundaries.
- [Institutional debt SDK](../../../../packages/protocols/musd-institutional-debt/README.md): read selected positions and calculate debt and health.
- [Classic borrowing](../borrowing/README.md): the separate trove model.
- [Contract deployments](../../../contracts/README.md): Enclave and debt-manager generations.

## What a position record establishes

Roles, allowed accounts, Bitcoin transaction outputs (UTXOs), positions, rates,
and totals describe their recorded block. Recorded UTXOs do not establish that
the Bitcoin outputs remain unspent, confirm off-chain custody, or prove a product's
backing ratio.

Institutional positions do not enter classic borrower-position or Stability Pool
accounting. The SDK provides private reads and calculations; no partner
transaction writer is implemented. Use its documentation for exact inputs and
availability limits.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
