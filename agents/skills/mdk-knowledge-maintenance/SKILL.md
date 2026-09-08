---
name: mdk-knowledge-maintenance
description: Maintain, migrate, validate or generate knowledge modules and derived outputs while preserving evidence, stable identities and domain ownership.
---

# Knowledge maintenance

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. Read `docs/standards/knowledge-management.md`.
3. Read the owning module's `README.md` and `index.json`.
4. Load the relevant domain skill and only the indexed records, schemas,
   evidence, and validators needed by the task.

## Procedure

1. Classify the change as use, fact maintenance, re-verification, migration,
   deprecation, schema/validator work, or generation.
2. Identify the single owning module and preserve stable module, resource, and
   record IDs.
3. Apply the matching workflow and conformance checklist from the standard.
4. For a fact change, verify exact scope against pinned authoritative evidence;
   update evidence and canonical records together without weakening status,
   limitation, freshness, or review fields.
5. For a structural migration, preserve content and evidence coordinates,
   update index mappings and inbound superseded paths, and do not reprocess facts
   unless freshness or evidence requires it.
6. Regenerate declared projections from canonical inputs.
7. Run `node scripts/validate-knowledge-structure.ts`, all affected module
   checks, relevant link/drift checks, and `git diff --check`.
8. Record verification and unresolved review gates in the active task.

## Stop conditions

Stop when authoritative evidence is missing or conflicting, the owning domain
is unclear, scope or architecture must expand, a protocol-sensitive approval is
absent, an external dependency is required, or the only path weakens an
invariant.

## Avoid

- treating a schema pass as evidence or approval;
- using physical paths as cross-domain identity;
- putting facts in README, AGENTS, skills, tasks, or memory;
- hand-editing generated values;
- creating empty role directories or file-type buckets;
- silently converting existing lifecycle states during migration.
