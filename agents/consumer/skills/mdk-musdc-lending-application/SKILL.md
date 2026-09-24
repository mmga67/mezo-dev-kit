---
name: mdk-musdc-lending-application
description: Integrate installed MDK BTC/mUSDC market reads, share accounting, health and lending workflows in an application.
---

# BTC mUSDC lending application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:musdc-lending`. If uncached, use
`pnpm exec mdk docs fetch api:musdc-lending --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Resolve the complete market identity, including its token pair, oracle, interest model and risk parameter, through the owning API. Keep mUSDC and MUSD distinct.
2. Use the SDK share and interest calculations with their declared rounding and time inputs. Preserve assets, supply shares, borrow shares, collateral and liquidity separately.
3. Keep unavailable or stale oracle state explicit in health displays. Route vault depositor accounting to the vault package rather than treating market supply as an individual vault position.
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
