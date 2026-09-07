---
name: mdk-bridge-knowledge
description: Resolve, verify, reconcile, or maintain evidence-scoped MUSD Wormhole NTT and Mezo Native Bridge provider, asset, route, lifecycle, and transfer knowledge through the v0.4 bridge module. Use for cross-chain evidence; all routes and writers remain unsupported.
---

# Mezo bridge knowledge

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. Read the transaction skill for cross-chain lifecycle work and the indexing
   skill for scan, backfill, or materialized reconciliation projections.
3. For maintenance, read the knowledge skill and management standard.
4. Read `knowledge/workflows/bridges/README.md` and `index.json`.
5. Load only the provider, asset, route, lifecycle, source, evidence, or review
   resources required.

Tracker/UI status, negative scans, and documentation address tables are not
protocol authority.

## Procedure

1. Select provider and route record; fail if route status is not explicitly
   usable for the requested purpose. Current module support is `none`.
2. Resolve all three network identities through the Networks module and the
   bounded provider contract graph through `bridge-contract-roles`. Treat
   proposed Contract records as unaccepted and dated evidence addresses as
   checked coordinates. Token representations remain workflow-scoped unless a
   separate canonical owner is explicitly referenced.
3. Resolve current provider configuration at one block per chain: identity,
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
8. Before any future writer, validate assets/representations, user bounds,
   approvals/authorization, exact calldata/value, simulation, and recovery;
   define source plus destination reconciliation.
9. On changes, update candidate/gap disposition, pinned sources, evidence
   digests, canonical projections, generated reference, and validators together.
10. Run bridge, transaction, troubleshooting, network, contract, structural,
    and drift checks.

## Invariants

- NTT digest reconciliation and Native sequence/post-state reconciliation are
  distinct and must not be normalized into one proof rule.
- Dated evidence coordinates do not override canonical Network or Contract
  references.
- Six completed traces do not imply additional assets, directions, providers,
  delivery SLAs, or writer support.
- A successful source transaction never proves cross-chain completion.

## Stop conditions

Stop when a canonical network/deployment identity is required but absent,
source/destination tuples cannot be joined, asset representation or recipient
encoding is ambiguous, current quote/simulation/recovery requirements are
missing, evidence is stale or conflicting, a route/candidate would be promoted,
a value-bearing verification is proposed without explicit authority, or a new
dependency/public architecture decision is required.
