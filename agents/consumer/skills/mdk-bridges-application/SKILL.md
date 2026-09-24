---
name: mdk-bridges-application
description: Integrate installed MDK bridge preparation, recovery and separate delivery observation in an application.
---

# Bridge application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:bridges`. If uncached, use
`pnpm exec mdk docs fetch api:bridges --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Select the provider, direction and token representation first. Check the reference for the exact implemented preparation, recovery and observer boundaries.
2. Inject source and destination observation ports separately. Retain chain and block identities and the provider-specific message identity; do not join transfers using amounts alone.
3. Model source inclusion, message progress, destination progress, completion and ambiguity separately. A successful source receipt is not delivery; missing destination evidence does not authorize sending value again.
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
