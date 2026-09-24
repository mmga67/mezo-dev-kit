# Manifest improvement log

Every material improvement to `docs/manifest` is recorded here. The manifest
is versioned independently from packages and the knowledge-layout
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

## 1.3.0 — 2026-09-22

- Add a small default consumer set and explicit optional capability additions
  combining compatible private packages, portable skills and references.
- Establish application-owned memory with reusable consumer guidance and local
  CLI retrieval/validation, separate from contributor memory and guidance locks.
- Preserve application configuration ownership, package-installation failure
  boundaries and separate SDK upgrade, protocol support and release decisions.

## 1.2.0 — 2026-09-22

- Add guided project setup through the root and project-local CLI, with explicit
  external targets and the existing noninteractive command engine.
- Include a prebuilt console in portable private kits; retain artifact matching,
  application ownership, recovery limits, and separate public-release approval.

## 1.1.0 — 2026-09-16

- Add the private Native source preparation and current delivery boundary for
  the two initial routes, retaining separate historical and native execution evidence.
- Require explicit native authorization, honest destination fee estimates and
  governance recovery for confirmed failed payouts; preserve qualified release review.

## 1.0.0 — 2026-09-15

- Adopt the manifest as the current project baseline and define its delegated
  architecture, policy, evidence, and API owners.
- Consolidate the operative rules from the 27 historical decisions by topic,
  including private execution, historical observation, current testnet scope,
  shared branch history, and standalone project tooling.
- Preserve decision history and scoped acceptance while retiring superseded
  bootstrap instructions from current policy.
- Establish human documentation and reference conventions. Package versions,
  knowledge schema compatibility, evidence dates, and release gates retain
  their independent owners.

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
