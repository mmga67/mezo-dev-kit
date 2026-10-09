# Institutional MUSD debt

Institutional MUSD debt connects assets held through Enclave custody with debt
positions and collateral pledges. Custody activity and debt accounting are
separate: an asset movement alone does not establish that a position's debt or
pledge changed.

This directory explains the roles, positions, fees, repayment, and health
calculations on Mezo Mainnet. It helps you trace a position change through the
matching debt-manager call, event, and resulting state.

## Trace a position

Begin with the contracts and the position you want to inspect. An Enclave is
the custody contract involved in holding and moving assets; the debt manager
records the debt position. The
[contract records](../../../contracts/README.md) identify their versions, and
the [institutional reference](generated/reference.md#enclave-generations)
explains why permissions must be interpreted for the selected version.

Next, read the position's collateral, pledged assets, principal and fees. These
amounts have different roles: custody tells you where assets are held, while
the position records how they relate to the debt. The
[accounting reference](generated/reference.md#position-and-accounting-model)
and its formulas explain repayment and health without folding these positions
into the classic borrower model.

The [Institutional debt SDK](../../../../packages/protocols/musd-institutional-debt/README.md)
reads selected positions and permissions at one block and provides calculations.
The application chooses that selection. A successful read of a subset does not
establish a complete inventory of institutional positions.

## What a position record establishes

Roles, allowed accounts, recorded Bitcoin outputs, positions, rates,
and totals describe their recorded block. A UTXO is an unspent Bitcoin transaction
output. A saved record alone cannot establish that the output is still unspent,
confirm off-chain custody, or prove a product's backing ratio.

Institutional positions do not enter classic borrower-position or Stability Pool
accounting. The SDK provides private reads and calculations; no partner
transaction writer is implemented. Use its documentation for exact inputs and
availability limits.

## Quick links

| Link                                                                                       | What you will find                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [Institutional reference](generated/reference.md)                                          | Contract versions, permissions, position accounting, formulas and evidence. |
| [Institutional debt SDK](../../../../packages/protocols/musd-institutional-debt/README.md) | Selected position reads, fees, repayment and health calculations.           |
| [Contract records](../../../contracts/README.md)                                           | Enclave and debt-manager deployments and interfaces.                        |
| [Classic borrowing](../borrowing/README.md)                                                | The separate model for individual borrower positions.                       |
| [Module index](index.json)                                                                 | Exact custody, accounting, source, evidence and review records.             |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
