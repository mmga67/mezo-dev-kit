---
name: mdk-musd-savings-application
description: Integrate installed MDK savings principal, indexed yield and savings workflows in an application.
---

# MUSD savings application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:musd-savings`. If uncached, use
`pnpm exec mdk docs fetch api:musd-savings --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Identify the Savings generation and relevant gauge mapping before composing a position. Follow the Savings API rather than substituting a generic vault integration.
2. Keep principal receipts, pending yield, paid yield and gauge custody in separate application fields. Count a receipt once even when its beneficial owner differs from its custodian.
3. Use SDK calculations for index updates and rounding. Preserve the reader coordinate and missing optional inputs; do not fold savings into borrower debt totals.
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
