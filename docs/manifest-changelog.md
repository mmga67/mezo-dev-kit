# Manifest improvement log

Every material improvement to `docs/manifest` is recorded here. The manifest
is versioned independently from packages and the v0.4 knowledge-layout
contract.

## Versioning policy

- Major: a backward-incompatible change to the mission, authority model, or
  repository constitution.
- Minor: a new architectural capability, domain boundary, or development
  system.
- Patch: a clarification or correction that does not change intended
  architecture.

Every manifest edit must update its version and add a dated entry describing
the improvement. A task may bump the version more than once when distinct
reviewable improvements land.

## 0.6.1 — 2026-09-07

Clarify the public source snapshot boundary and issue/pull-request workflow.
Individual development records and internal review history are not distributed.
Package architecture, protocol support, and evidence requirements are unchanged.

## 0.6.0 — 2026-08-23

- Made version metadata and bump rules explicit.
- Added this durable improvement log.
- Added the Mezo economic-system composition principle: separate canonical
  accounting owners connected through stable logical references.
- Added the MUSD Savings, mUSDC lending-market, and USDC Lending Vault domains
  without merging them into classic MUSD or incentives.
- Reconciled the manifest with ADR-0006 through ADR-0011.

## 0.5.0 — 2026-08-21

- Reconciled the manifest with accepted core-client, transaction-lifecycle,
  external-network, contract-provenance, TypeScript, agent-skill, price-owner,
  and testing decisions established during the foundation program.

## 0.4.0 — 2026-08-20

- Introduced the universal v0.4 knowledge-module architecture later accepted
  by ADR-0006.
