# MUSD Borrowing Candidate Inventory And Dispositions

This implementation review ledger compares published prose and implementation assumptions
with the pinned implementation. “Promote” means inclusion in proposed records
that still require qualified Level 3 review.

| ID | Candidate | Check | Disposition | Canonical owner / reason |
| --- | --- | --- | --- | --- |
| BORROW-C003 | MUSD safety can share one generic LTV model with other venues. | Current source uses CR, gas compensation, min debt, and mode-specific rules. | Reject | Venue-native semantics remain separate. |
| BORROW-C004 | A trove can be moved to another wallet. | State, list membership, and signature authorization remain keyed by borrower. | Reject as protocol operation | Any migration is a multi-transaction product workflow, not trove transfer. |
| BORROW-C005 | Native BTC and ERC-20 tBTC are interchangeable collateral inputs. | Borrower entry points are payable and ActivePool accounts native currency. | Reject | `position.json#native-collateral-custody` |
| BORROW-C006 | Recovery Mode implies inherited Liquity recovery liquidations. | Pinned source liquidates only at `ICR < MCR` in both modes. | Reject | `liquidations.json#liquidation-eligibility` |
| BORROW-C007 | StabilityPool liquidation is either fully covered or fully redistributed. | Current source offsets any available amount, interest first, then redistributes the remainder. | Supersede simplified prose | `liquidations.json#stability-pool-offset` |
| BORROW-C008 | The stale GasPool comment's 50 MUSD amount is current. | Pinned constant, official fee docs, and both fixed-block reads show 200 MUSD. | Reject | `parameters.json#musd-gas-compensation` |
| BORROW-C009 | The refinance fee is unambiguously 0.1%. | Official fee page says 0.1%; pinned source computes `borrowingRate * floor(refinancingFeePercentage * netDebt / 100)`, and observed 0.1% plus 20 implies 0.02%. | Supersede prose for deployed behavior | The deployed 0.02% formula is canonical for the recorded blocks. Retain the page as stale discrepancy evidence in `index.json#resolvedDiscrepancies`. |
| BORROW-C010 | Minimum requested borrowing is exactly the `minNetDebt` storage value in every mode. | Contract checks requested amount plus fee in normal non-exempt mode; fee-free paths check requested amount directly. Docs present 1,800 MUSD as the user minimum. | Promote distinction | `parameters.json#minimum-net-debt`; do not recommend below the documented product floor. |
| BORROW-C011 | Opening 1,800 MUSD always creates exactly 2,000 MUSD debt. | With current 0.1% borrowing fee, normal non-exempt composite debt is 2,001.8 MUSD; 2,000 is simplified fee-free arithmetic. | Reject exactness | Use formula composition and current exemption/mode state. |
| BORROW-C012 | Adding collateral or a higher price automatically expands future borrowing capacity. | Stored capacity is set on open, decreases on withdrawal, and resets on refinance; ordinary top-ups do not increase it. | Promote versioned quirk | `operations.json#add-collateral`; cross-linked to implementation review. |
| BORROW-C013 | Repayment reduces principal before interest. | Current debt adjustment pays materialized interest first. | Reject | `formulas.json#debt-payment-split` |
| BORROW-C014 | Closing rules are invariant across all deployments. | Source has a no-mint-role migration branch; fixed-block reads show the supported deployments use the mint-role branch. | Scope narrowly | `operations.json#close-trove`; re-read role before release/write. |
| BORROW-C015 | Liquidation changes MUSD already in the borrower's wallet or returns surplus collateral. | Current liquidation closes position accounting, pays liquidator, offsets/redistributes all remaining collateral/debt, and does not touch borrower wallet balance. | Reject | `liquidations.json#borrower-outcome` |

## Conflict and compatibility report

- The refinance discrepancy is resolved for current deployed behavior: pinned
  source plus fixed-block parameters establish the nested formula and effective
  0.02% fee. The official 0.1% prose is stale for this scope. This resolution
  reports execution behavior and does not speculate about unpublished intent.
- Official minimum-debt and opening examples are useful product guidance but
  omit fee-dependent contract rounding. Canonical records preserve both the
  contract predicate and the safer published floor.
- Official liquidation prose is a conceptual overview. Current source permits
  partial StabilityPool offset and has no separate Recovery Mode liquidation
  algorithm.
- The no-mint-role close branch appears to support a deployment migration. It
  is not generalized into ordinary close support because both scoped networks
  currently report the mint role as enabled.
## Derived-artifact decisions

- Documentation: add a derived borrowing/liquidation reference linked to these
  catalogs.
- Skill: add a borrowing-specific evidence and safety procedure.
- Examples and SDK: none until qualified review and implementation review interface work.
- Memory: no new record; canonical knowledge and candidate dispositions already
  preserve the durable result without provider-specific duplication.
