---
name: mdk-history-application
description: Build bounded event scans, checkpoints and reorg-aware projections with installed MDK Core APIs and application-owned storage. Does not imply a hosted history service or complete archive coverage.
---

# Application history and reconciliation

Follow application instructions and read `api:core` using
`pnpm exec mdk docs show api:core`. Search matching protocol references for
operation-specific reconciliation rules. Fetch uncached references explicitly
with `pnpm exec mdk docs fetch <id> --offline`.

1. Establish the inclusive scan range, confirmed head, deployment generation,
   checkpoint block/hash, overlap and finality policy. Verify the provider's
   actual log/archive capabilities before claiming historical coverage.
2. Use the public bounded scan API with application-owned transport and
   storage. Keep source-aware event identity and block/hash provenance.
3. Deduplicate overlap idempotently. Commit a contiguous range and its checkpoint
   together; a partially fetched page cannot advance a complete checkpoint.
4. Recheck the anchor and overlap. On a hash mismatch, invalidate affected
   projections and resume from the last valid checkpoint.
5. Preserve unknown, absent, partial and completed results separately. A failed
   provider call cannot prove event absence. Stored status cannot replace the
   protocol's required event/post-state reconciliation.
6. Test duplicate pages, restart, partial ranges and a changed checkpoint hash.
   Report actual coverage and unresolved gaps, including unsupported history.

Choose storage, scheduling and hosted services in the application. Missing
observations do not authorize resubmitting transactions or bridge transfers.
