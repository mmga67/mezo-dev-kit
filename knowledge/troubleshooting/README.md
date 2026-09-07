# Troubleshooting knowledge

This directory owns reproducible diagnosis and safe mitigation records. It does
not own the underlying network, deployment, protocol, or transaction fact.
Every issue links to that canonical owner and to the evidence used to reproduce
the symptom.

Start at `index.json`. It resolves seven stable issue resources plus the
generated human reference. Retained records must state exact scope, repeatable
verification, a negative/control case, a bounded mitigation, review timing, and
limitations. A missing RPC result is not automatically a missing transaction;
a documentation statement is not deployed evidence; and an unreproduced report
is not automatically an MDK issue.

For human diagnosis, start with `troubleshooting-reference`, then open the one
issue and its logical canonical-owner references. For agent procedure, use the
troubleshooting skill; for maintenance, use the knowledge-management standard.

Troubleshooting records are validated projections of evidence. If a record
conflicts with the source or block-pinned observation it cites, the record is
drift and must be corrected.

For archive gaps, bounded rescans, retryable negative evidence, and indexed
reconciliation projections, use `docs/guides/INDEXING_RECONCILIATION.md`.
Provider omission remains unknown/partial evidence unless the exact canonical
source, range, and finality establish absence.

## Production boundary

The v0.4 module structure and the seven reproduced issues received qualified
protocol/security acceptance under implementation review on 2026-08-21. Issue support
remains `none`: acceptance makes no writer, route, provider-availability, or
security-support promise. Security reports follow `SECURITY.md`; they do not
belong in this public troubleshooting module.
