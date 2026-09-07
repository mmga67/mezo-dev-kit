# Institutional MUSD debt knowledge

This module owns deployment-scoped knowledge for the Enclave custody and
execution boundary and the separate EnclaveDebtManager position/accounting
model on Mezo Mainnet.

Start with `generated/reference.md`, then resolve the required resource through
`index.json`. Roles, target-selector allowlists, UTXOs, positions, rates, caps,
and totals are governed state and are only current at their recorded block.

## Current boundary

- The module review is accepted under institutional debt evidence review; knowledge support remains
  proposed and no public reader or writer is enabled.
- The two active Enclave generations and the current debt-manager generation
  are distinct accepted Contract identities with full ABI artifacts.
- Institutional positions are not classic troves and their collateral and debt
  do not enter classic ActivePool, DefaultPool, ICR, TCR, Recovery Mode,
  Stability Pool, redemption, or liquidation accounting.
- Enclave asset movement is not proof of a debt-position mutation. A matching
  debt-manager call/event and post-state are required.
- No read facade, transaction writer, portfolio metric, or product backing
  ratio is supported.

Maintainers follow the knowledge-management standard and the institutional
debt, MUSD, Contracts, Networks, incentives, transaction, troubleshooting, and
TypeScript skills applicable to the change.
