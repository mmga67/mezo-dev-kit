---
name: mdk-musd-redemptions-application
description: Integrate installed MDK bounded redemption planning, simulation and settlement reconciliation in an application.
---

# MUSD redemption application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:musd-redemptions`. If uncached, use
`pnpm exec mdk docs fetch api:musd-redemptions --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Keep queue ordering, eligibility filtering, iteration budgets and partial redemption outcomes distinct. Use the SDK hint and quote results at their recorded state coordinate.
2. Carry requested and executable amounts separately. Define the user fill/output policy and verify whether the exact call and simulation can enforce it; do not invent a contract parameter.
3. Reconcile attempted versus actual settlement, fees and recipient post-state through the owning API. Reprepare after state changes; never reuse stale hints merely because a prior quote succeeded.
4. Inspect the actual installed public exports and required application ports.
   Keep app transport, wallet, storage and policy explicit. Preserve the
   reference's implementation and release limitations.
5. For an authorized transaction workflow, follow the owning API's preparation,
   separate approvals, exact-call simulation and reconciliation. Installing this
   skill does not authorize a transaction or qualify a protocol for release.

## Verification and gaps

Run the application's relevant typecheck, tests and build. Test the integration
against the installed entrypoint, including unavailable inputs and partial
outcomes relevant to the change. Identify fixtures separately from live reads.
If an export, pinned reference or required live input is missing, report that
precise gap and continue independent supported work. Do not copy MDK repository
internals, protocol constants or maintenance commands into the application.
