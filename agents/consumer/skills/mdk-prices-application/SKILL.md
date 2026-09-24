---
name: mdk-prices-application
description: Use installed MDK price APIs for source identity, typed scaling, freshness and explicit fallback in an application.
---

# Price application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:prices`. If uncached, use
`pnpm exec mdk docs fetch api:prices --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Select the price purpose and source class before normalization. Preserve feed identity, units, exponent, timestamp and confidence semantics from the returned type.
2. Inject the application clock and maximum-age policy. Keep stale, future-dated, unavailable and invalid-price results distinct; missing data must not become zero.
3. Retain fallback attempts and the selected source. Do not present a market estimate as a protocol oracle value; the matching reference owns the distinction.
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
