---
name: mdk-musd-borrowing-application
description: Integrate installed MDK borrower reads, calculations and direct borrowing workflows in an application.
---

# MUSD borrowing application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:musd-borrowing`. If uncached, use
`pnpm exec mdk docs fetch api:musd-borrowing --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Classify the task as borrower state, calculation, preparation or execution. Route redemptions and institutional debt to their separate package references.
2. Read positions at a coherent block and preserve the API distinctions between stored, pending, accrued and entire amounts. Do not calculate health from display-rounded values.
3. Use the owning SDK calculations and operation preconditions. Treat list hints as placement inputs, not evidence that an operation is valid; preserve unavailable price or position results.
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
