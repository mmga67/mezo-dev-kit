---
name: mdk-incentives-application
description: Integrate installed MDK gauges, locks, voting and reward accounting in an application.
---

# Incentives application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:incentives`. If uncached, use
`pnpm exec mdk docs fetch api:incentives --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Select the voting and escrow domain before interpreting a lock or vote. Keep pool, validator and third-party voting state distinct even where arithmetic resembles another domain.
2. Preserve epoch and block coordinates, reward-token identity, beneficiary and custody. Separate accrued estimates from settled claims and missing historical inputs.
3. Use the installed API for the supported lock/gauge workflow. Recheck ownership, approval, epoch windows and current mappings before preparing a mutation; reference coverage alone does not establish a writer.
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
