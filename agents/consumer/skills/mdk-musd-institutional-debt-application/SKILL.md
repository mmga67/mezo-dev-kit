---
name: mdk-musd-institutional-debt-application
description: Integrate installed MDK institutional MUSD position, collateral authority, health and fee reads in an application.
---

# Institutional debt application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:musd-institutional-debt`. If uncached, use
`pnpm exec mdk docs fetch api:musd-institutional-debt --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Select the institutional contract generation before interpreting roles and target selectors. ABI presence alone is not current permission.
2. Keep custody, pledged collateral, principal, interest and fees distinct from classic borrower totals. A requested subset of positions is not a complete inventory.
3. Preserve unknown health when price inputs are unavailable. Use only documented public readers/calculations; do not infer partner writer support from operation records or generic execution ports.
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
