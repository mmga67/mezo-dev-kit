---
name: mdk-memory-application
description: Retrieve and maintain concise application memory when earlier findings can help a task or new verified context is worth retaining across sessions. Uses the local MDK CLI without a source checkout or memory service.
---

# Application memory

The application owns memory contents. MDK supplies the procedure and local
commands; guidance synchronization never owns these entries. Memory helps find
sources and does not establish current protocol facts.

## Retrieve only relevant context

1. Read application instructions and classify the task. Skip memory when a
   direct code or documentation pointer already answers it.
2. Search the relevant scope with `pnpm exec mdk memory search "topic"` and,
   for team context, `pnpm exec mdk memory search "topic" --scope shared`.
   Add `--domain application-area` when useful. Search returns concise metadata;
   open selected entries with `pnpm exec mdk memory show entry-id` in the same scope.
3. Follow the sources and recheck important claims against current application
   code and matching installed SDK references. A remembered limitation may have
   changed after an upgrade. Never use remembered chain state as live input.

## Retain useful findings

Read the distributed guide with
`pnpm exec mdk docs show guide:docs/guides/application_memory.md` for the entry
shape, paths and a complete example. Fetch that ID with `--offline` if uncached.

Search before saving. Prefer improving the owning code, test or document;
retain memory only when a concise pointer and context improve future retrieval.
Use one stable ID, a searchable title, a bounded summary, source pointers and a
real update date. Keep uncertain observations local with `discovered` status.
Review sources before marking `verified`; share only useful, reviewed context.
For a promoted finding, link its authoritative destination. Deprecate obsolete
entries instead of retaining contradictory current guidance.

Write the entry to a temporary JSON file and preview
`pnpm exec mdk memory save --file entry.json --dry-run`, then save it without
`--dry-run`. The default scope is local; `--scope shared` is an explicit sharing
choice. Use a temporary location consistent with application policy and remove
the input file after a successful save. Run `pnpm exec mdk memory check` for the
changed scope, then search a realistic phrase and follow its source pointers.

Never retain secrets, private keys, credentials, wallet data, personal data,
raw logs, chat transcripts, copied SDK documentation or routine task history.
Report no memory change when the durable result already has a clear owner.
Structure validation does not prove source truth, privacy or freshness.
