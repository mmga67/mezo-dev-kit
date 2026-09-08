---
name: mdk-musd-redemptions
description: Resolve MUSD redemption ordering, eligibility, hints, fees and settlement. Inspect private redemption reads, bounded hints, exact-output simulation and reconciliation; release remains gated.
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

## Current private SDK

The approved full-SDK task adds `@mezo-dev-kit/musd-redemptions`; inspect its
[README](../../../packages/protocols/musd-redemptions/README.md) and
[reference](../../../packages/protocols/musd-redemptions/REFERENCE.md) before
assessing capability. It composes Borrowing state, bounded tail/iteration inputs,
a required explicit output simulator and Core execution. The provided adapter
requires `debug_traceCall` with `callTracer`/`withLog`; the public Boar endpoint
returned method-not-found when checked on 2026-09-08. Do not replace actual output
verification with empty-call success. Qualified review/release is still required.
Native wallet reconciliation requires canonical receipt gas fields and pinned
balances; inclusion can violate preflight minimums, reported as `boundsSatisfied`.

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
