---
name: mdk-swaps-application
description: Integrate installed MDK swap discovery, bounded quotes and supported execution paths in an application.
---

# Swap application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:swaps`. If uncached, use
`pnpm exec mdk docs fetch api:swaps --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Select basic or concentrated-liquidity routing and read the matching public reference, including the documented quote subpath when relevant. Verify every hop through the discovery API.
2. Preserve route architecture, block coordinate, partial-fill status, traversal budgets and quote assumptions. A quote is not exact-call simulation or guaranteed output.
3. Keep read-only quote availability separate from writer route compatibility. Supply explicit sender, recipient, minimum output and deadline; follow the exact spender and native-value policy of the selected writer.
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
