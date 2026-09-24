---
name: mdk-usdc-lending-vault-application
description: Integrate installed MDK USDC vault shares, receipt wrappers, yield and depositor workflows in an application.
---

# USDC vault application

Read the application's AGENTS.md and existing integration first. Run
`pnpm exec mdk doctor` to check installed compatibility, then read
`pnpm exec mdk docs show api:usdc-lending-vault`. If uncached, use
`pnpm exec mdk docs fetch api:usdc-lending-vault --offline`. Search the
matching local corpus for only the knowledge needed by the task.

## Procedure

1. Resolve the current vault, adapter, receipt wrapper and gauge topology from the reference and current reads. Preserve generation differences.
2. Use SDK previews with their exact rounding and availability rules. Do not infer capacity from a getter name, add adapter assets twice, or combine vault shares with underlying assets.
3. Count wallet receipts and beneficial gauge stake once. Keep redirected yield, emissions and claimable rewards separated by asset and owner; route borrower health to the lending package.
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
