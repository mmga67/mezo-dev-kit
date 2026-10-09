---
name: mdk-bridge-knowledge
description: Verify BTC custody, asset representations and Mezo bridge routes. Select Native or token-specific NTT evidence for explanations, preparation, recovery and delivery observation.
---

# Mezo bridge knowledge

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. Read the transaction skill for cross-chain lifecycle work and the indexing
   skill for scan, backfill, or materialized reconciliation projections.
3. For maintenance, read the knowledge skill and management standard.
4. Resolve module `workflows/bridges` with `pnpm context`.
5. Load only the provider, asset, route, lifecycle, source, evidence, or review
   resources required.

Tracker/UI status, negative scans, and documentation address tables are not
protocol authority.

For whole-system economic architecture, use
[economic-system reasoning](../mdk-economic-system/SKILL.md). For asset-entry
explanations, use the bridge sections of
[Mezo's economic system](../../../docs/architecture/mezo-economic-system-composition.md)
and their authoritative sources. The qualified route catalog is a subset:
preserve custody versus token representation, provider, direction and
asset-specific destination sets. Missing MEZO NTT or Bitcoin-delivery records
are coverage gaps; MUSD NTT records cannot establish their absence or readiness.

For operation review, load only [Native procedures](references/native.md) or
[NTT procedures](references/ntt.md) for the selected provider. For custody and
published route explanations, resolve `bridge-economic-routes` and the owning
`economic-relationships`; preserve their candidate review state.

## Procedure

1. Classify explanation, historical observation, current preparation, or
   maintenance. Select the provider and route evidence needed for that claim;
   enforce support gates for the requested operation. An explanation may describe
   published routes with their evidence limits. Resolve support from the selected
   resource and current package reference.
2. Resolve the network identities needed by the selected provider and route
   through the Networks module and the
   bounded provider contract graph through `bridge-contract-roles`. Treat
   proposed Contract records as unaccepted and dated evidence addresses as
   checked coordinates. Token representations remain workflow-scoped unless a
   separate canonical owner is explicitly referenced.
3. For current transfer preparation, resolve provider configuration at one block per chain: identity,
   implementation, peers/mappings, pause, capacity, limits, fees, and recipient
   encoding. Historical evidence is not a current quote.
4. Apply `bridge-ntt-lifecycle` only to MUSD NTT. Join source and destination by
   the same NTT digest; a source receipt or message observation is not terminal.
5. Apply `bridge-native-lifecycle` only to Native Bridge. Join the full
   direction-specific sequence tuple. For inbound ERC-20, require mapped-token
   recipient post-state or equivalent delivery proof beyond system execution.
6. Keep submitted, source-included, message-progress, destination-progress,
   completed, reverted, and ambiguous states distinct. Absence is not failure.
7. Never retry or resubmit value from missing destination evidence alone.
8. For writer preparation, validate assets/representations, user bounds,
   approvals/authorization, exact calldata/value, simulation, and recovery;
   define source plus destination reconciliation.
9. On changes, update candidate/gap disposition, pinned sources, evidence
   digests, canonical projections, generated reference, and validators together.
10. For maintenance, run the affected bridge, transaction, troubleshooting,
    network, contract, structural, and drift checks. Ordinary explanation does
    not require maintenance checks or current transfer simulation.

## Invariants

- NTT digest reconciliation and Native sequence/post-state reconciliation are
  distinct and must not be normalized into one proof rule.
- Dated evidence coordinates do not override canonical Network or Contract
  references.
- Completed traces do not imply additional assets, directions, providers,
  delivery SLAs, or writer support.
- A successful source transaction never proves cross-chain completion.

## Stop conditions

Stop when a canonical network/deployment identity is required but absent,
source/destination tuples cannot be joined, asset representation or recipient
encoding is ambiguous, current quote/simulation/recovery requirements are
missing, evidence is stale or conflicting, a route/candidate would be promoted,
a value-bearing verification is proposed without explicit authority, or a new
dependency/public architecture decision is required.
