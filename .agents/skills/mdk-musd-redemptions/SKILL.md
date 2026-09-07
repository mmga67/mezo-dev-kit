---
name: mdk-musd-redemptions
description: Resolve, calculate, verify, or maintain supported MUSD redemption eligibility, ordering, formulas, hints, fees, settlement, and reconciliation through the v0.4 redemptions module. Use for reads and deterministic rules; the public writer remains separately gated.
---

# MUSD redemptions knowledge

## Purpose

Apply deployment-evidenced MUSD redemption ordering, math, hints, and settlement
without importing explorer instructions, analytics models, or stale prose.

## Use When

- Explaining, quoting, simulating, or reconciling a redemption.
- Computing actual/gross/net collateral and fee outcomes.
- Generating or validating redemption and partial-reinsertion hints.

## Do Not Use When

- Copying addresses/ABIs or explorer function numbers.
- Treating attempted amount as guaranteed actual fill.
- Assuming borrowers receive the documented fee waiver.
- Submitting writes before a public writer capability and shared transaction
  API are reviewed and released.

## Required Sources

1. Root/nested `AGENTS.md` and active task.
2. `knowledge/protocols/musd/redemptions/index.json` and only the relevant
   indexed resources.
3. Shared MUSD and borrowing records resolved through the logical references in
   the index.
4. Network/contract registries.
5. Pinned source and fixed-block evidence when changing a claim.

## Procedure

1. Resolve network and contracts through registry IDs.
2. Give block-pinned deployment state and version-matched source precedence over
   descriptive docs; retain conflicts as discrepancies.
3. At one explicit block where practical, read price, TCR, redemption rate,
   min debt, redeemer balance, queue state, and entire position amounts.
4. Compute hints and truncated amount from that state. Preserve NICR ordering
   versus current-ICR filtering as separate concepts.
5. Apply only integer formulas and shared borrowing formulas with floor
   semantics.
6. Simulate the exact call immediately before submission. Because the contract
   lacks minimum-received inputs, enforce user minimum-fill/net-BTC policy
   outside the call and fail closed on stale simulation.
7. Reconcile receipt success, `Redemption` attempted/actual/gross/fee values,
   redeemer balances, pool/PCV movements, affected troves, and surplus.
8. Never retry a stale or failed write blindly.
9. Run redemption, borrowing, MUSD, contract, and network validators.

## Stop Conditions

- Deployment identity, source match, price, or parameter state is uncertain.
- Simulation cannot enforce the user's explicit fill/output policy.
- A requested public writer precedes transaction-interface and qualified review.
- Evidence conflicts internally about deployed behavior.

## Common Failure Modes

- Sorting by current ICR instead of following the deployed NICR list.
- Treating zero max iterations as zero.
- Passing arbitrary fixed partial NICR/hints.
- Ignoring HintHelpers truncated amount or the attempted/actual distinction.
- Charging the fee on requested MUSD rather than actual gross collateral.
- Applying the stale borrower fee waiver.
- Treating a hash as completion evidence.
