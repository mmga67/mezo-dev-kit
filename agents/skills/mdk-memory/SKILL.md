---
name: mdk-memory
description: Retrieve or curate provider-neutral MDK memory and promote verified discoveries. Memory is supporting context, not protocol authority.
---

# Memory

## Purpose

Preserve compact development context that prevents repeated investigation while
keeping canonical facts, decisions, procedures, and executable behavior in
their proper owners.

## Use when / do not use when

Use this skill when a task needs to retrieve prior observations, retain a
durable finding, curate shared seed memory, or synchronize a replaceable memory
provider.

Do not use memory to store secrets, personal data, raw logs, copied source
trees, routine task history, speculation presented as fact, or information that
belongs directly in `knowledge/`, current project docs, code/tests, or another skill.

## Relevant repository areas

- `agents/memory/README.md` — architecture, authority, and lifecycle contract.
- `agents/memory/schema/` — normalized entry and index shapes.
- `agents/memory/seed/` — reviewed shared memory committed to Git.
- `.mdk/memory/` — local observations and provider state, ignored by Git.

## Required canonical sources

Read `agents/memory/README.md` before changing memory. For security and
promotion boundaries, follow `SECURITY.md`, `CONTRIBUTING.md`, and the canonical
owner for the affected domain. Memory is retrieval context, not evidence of
current Mezo behavior.

## Procedure

1. Classify the task and name the narrow domain whose memory could help.
2. Use `pnpm context find --query '<topic>' --memory-domain <domain>` to retrieve
   relevant shared pointers alongside canonical knowledge. Include
   `--local-memory` when local context is relevant. `memory-read --scope
shared|local --id <id>` opens one indexed entry. The
   [retrieval manual](../../../scripts/agents/CONTEXT.md) owns exact commands and
   coverage. Alternatively select from the shared/optional local index by
   domain and title. A known direct canonical reference needs no memory detour.
3. Verify any important retrieved claim against current code, tests, canonical
   knowledge, or authoritative external evidence before relying on it.
4. At the end of meaningful work, make the memory decision required by
   `CONTRIBUTING.md`.
5. Follow [memory authoring](../../../docs/guides/MEMORY_MANAGEMENT.md#write-for-future-retrieval):
   search before saving, choose the canonical owner or appropriate store, use a
   concrete searchable title, and preserve source pointers, applicability,
   uncertainty and recheck conditions. Capture useful uncertain observations
   locally by default. Keep task progress and exploratory reasoning out of
   memory. Update one stable JSON entry and its index together.
6. Share an entry only when it is durable, broadly useful, reviewed, safe to
   export, and not better placed in a canonical owner. A shared entry must be
   grounded by sources and added to `agents/memory/seed/index.json`.
7. When authoritative content is promoted to knowledge, current project docs,
   code/tests, or a skill, reduce the memory to a useful pointer and mark it
   `promoted`, or mark it `deprecated` if the pointer adds no retrieval value.
8. Keep provider indexes, embeddings, credentials, remote record IDs, and
   synchronization state under ignored local storage. Preserve stable entry IDs
   and source identity when synchronizing; never make a provider required for
   repository operation.

## Verification

- Validate changed JSON against the schemas under `agents/memory/schema/` and
  ensure every plain-text entry is listed exactly once in its index.
- Run `pnpm context memory-check`, adding `--local-memory` for local changes.
  Search a realistic phrase/domain, read the returned entry and follow its
  sources. Tool validity does not verify source truth, privacy or review.
- Confirm local memory and provider state remain ignored with
  `git check-ignore -v`.
- Check shared entries for source links, compactness, export safety, correct
  lifecycle status, and duplication of canonical material.
- Run applicable repository link checks and `git diff --check` for tracked
  changes.

## Stop conditions

Stop and request direction when a proposed shared entry contains sensitive or
private material, an important claim cannot be verified, sources conflict, the
canonical owner is unclear, provider synchronization needs new credentials or
an external dependency, or promotion would change architecture/public behavior
beyond the active task.

## Common failure modes

- Loading all memory before classifying the task.
- Treating a concise summary as proof instead of following its sources.
- Copying canonical facts into memory instead of storing a retrieval pointer.
- Committing `.mdk/` or provider state.
- Promoting a local observation to shared memory without review.
- Leaving promoted or contradicted entries marked current.
