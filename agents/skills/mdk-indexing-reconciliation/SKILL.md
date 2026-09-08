---
name: mdk-indexing-reconciliation
description: Design or diagnose bounded event scans, checkpoints, backfills, reorgs and reconciliation. Does not select hosted indexers or infer completion from stored status.
---

# Provider-neutral indexing and reconciliation

## Required context

1. Read the active task, applicable `AGENTS.md`, and
   `docs/guides/INDEXING_RECONCILIATION.md`.
2. Resolve network/provider capability, deployment generation/ABI, and the
   owning protocol or workflow's event/post-state rules through stable
   knowledge references.
3. Load `mdk-transaction-execution` for transaction lifecycle work,
   `mdk-bridge-knowledge` for cross-chain completion, or the applicable
   protocol skill. Load only the domains involved.
4. For implementation and tests, also load `mdk-typescript-development` and
   `mdk-testing`.

## Current implementation

Core exposes `createEventScanner` for bounded raw logs from one registered
current generation. Its README/reference own policies, explicit coverage,
JSON-safe checkpoint candidates, overlap and changed-anchor outcomes. Callers
retain atomic storage, required protocol joins and provider capability evidence.
Complete provider-query coverage is not protocol or cross-chain completion.

## Procedure

For account-history requests, first define which transactions/events and what
coverage the user needs. Assess current public package capabilities through the
root-routed assessment; this skill supplies scan/reconciliation procedure, not
a hosted history API or proof that such an API exists. Preserve supported
package reuse while identifying the missing source or adapter precisely.

1. Define the inclusive scan range, confirmed head, prior block/hash
   checkpoint, overlap/reorg policy, source/deployment generation, freshness,
   completeness, and required versus optional reads.
2. Verify the chosen provider's required archive/log/batch capability. Reduce
   ranges or fail over only while preserving chain and block coordinates;
   otherwise return partial/unknown coverage.
3. Normalize events with source-aware identity and block-hash provenance.
   Deduplicate overlaps idempotently and advance a checkpoint only after the
   full contiguous range is committed.
4. Retain a valid parent observation when optional metadata fails. Mark missing
   required joins or post-state as incomplete without deleting the parent.
5. Recheck the checkpoint anchor and bounded overlap. On hash mismatch,
   invalidate affected projections/negative evidence, restore the last
   matching checkpoint, and rescan.
6. Record negative evidence with exact source/query/range/finality, coverage,
   attempt, cooldown, and retry classification. Treat provider/archive failure
   as unknown, not absence.
7. Preserve all destination candidates and provenance. A canonical candidate
   satisfying the owning workflow's event and post-state rules outranks later
   failed/progress candidates unless a reorg invalidates it.
8. Keep absent, unknown, delayed, failed, and completed distinct. Materialized
   status and receipt success never replace protocol reconciliation.
9. Retry only bounded idempotent reads. Never retry, replace, bridge, or replay
   value because destination evidence is missing.

## Boundaries

- Storage tables, APIs, providers, schedulers, polling intervals, block caps,
  dashboards, and route-health policy are application/operations choices.
- Canonical facts stay with Networks, Contracts, and the owning protocol or
  workflow; an indexed projection is not a new fact owner.
- One bounded invocation must be usable without a hosted database, daemon,
  credentials, or remote indexing service.

## Verification

Run the deterministic cases in `agents/evals/indexing-reconciliation.json`
through `scripts/test-indexing-reconciliation.test.ts`, then validate the
agent-skill catalog and every referenced transaction, bridge, protocol,
network, contract, or troubleshooting owner changed by the task. Exercise
coverage gaps, optional metadata, stale results, checkpoint commits, overlap,
reorg rollback, retryable negative evidence, candidate precedence, and missing
post-state.

## Stop conditions

Stop when provider capability, deployment generation, canonical event/join, or
post-state rules are missing or conflicting; a stored product status would be
treated as protocol authority; an application schema or hosted topology would
be made universal; retry could duplicate a value-bearing action; a new
dependency is required; or public runtime/package scope would expand.
