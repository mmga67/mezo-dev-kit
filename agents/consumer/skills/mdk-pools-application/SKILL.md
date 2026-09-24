---
name: mdk-pools-application
description: Integrate installed MDK basic or concentrated-liquidity pool discovery, positions and liquidity workflows in an application.
---

# Pool liquidity application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:pools`. If uncached, use
`pnpm exec mdk docs fetch api:pools --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Select the pool architecture before interpreting identity, reserves, liquidity or positions. Resolve dynamic instances using the public discovery path and preserve its coordinate.
2. Keep basic LP balances, concentrated-liquidity positions and gauge custody distinct. Verify the current owner or beneficiary required by the selected operation.
3. Use SDK integer math and previews for amount, tick, price and liquidity conversions. Preserve partial discovery and absent gauge results; never treat an analytics row as verified pool identity.
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
