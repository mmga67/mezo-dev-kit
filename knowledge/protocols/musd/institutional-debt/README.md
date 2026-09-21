# Institutional MUSD debt

Understand Enclave roles and custody boundaries, institutional debt positions, pledged collateral, fees, repayment, and health on Mezo Mainnet.

## Start here

- [Institutional debt reference](generated/reference.md): roles, positions, formulas, and aggregate boundaries.
- [Institutional debt SDK](../../../../packages/protocols/musd-institutional-debt/README.md): bounded reads and pure calculations.
- [Classic borrowing](../borrowing/README.md): the separate trove model.
- [Contract deployments](../../../contracts/README.md): Enclave and debt-manager generations.

## Scope and evidence

The module's review is accepted and knowledge support remains proposed. Roles,
allowlists, UTXOs, positions, rates, and totals describe their recorded block.
The SDK provides private reads; no partner writer is implemented.

Institutional positions do not enter classic trove or Stability Pool accounting.
Enclave asset movement alone does not prove a debt-position change: the matching
debt-manager call/event and post-state matter. Recorded UTXOs do not prove
Bitcoin unspent state, off-chain custody, or a product backing ratio.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
