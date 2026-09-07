# Plain-text memory provider

The filesystem is MDK's baseline memory provider. It requires no account,
service, index database, or external dependency.

## Stores

| Scope | Index | Git state | Allowed content |
| --- | --- | --- | --- |
| Shared | `agents/memory/seed/index.json` | tracked | reviewed, durable, export-safe context |
| Local | `.mdk/memory/index.json` | ignored | observations, unfinished investigation, sync state |

Each index entry points to one sibling JSON file whose name is
`<stable-memory-id>.json`. Index metadata duplicates only the fields needed to
select an entry without loading its summary.

## Retrieval

1. Classify the task by domain.
2. Read the two small indexes when they exist.
3. Select entries by `domain`, `title`, and lifecycle `status`.
4. Open only the selected files.
5. Follow `sources` and verify important claims before use.

An absent local index means the local store is empty. An empty shared index is
valid. Provider tooling must not require either store to contain an entry.

## Capture and lifecycle

Write a new observation to the local store unless it has already passed the
shared-memory criteria in `agents/memory/README.md`. Keep summaries under the
schema limit and use `sources` and `related` as pointers rather than copying
source content.

When an entry changes, update both its `updated` date and the matching index
metadata. IDs remain stable across lifecycle changes. Shared entries may be
`verified`, `promoted`, or `deprecated`; a `discovered` entry remains local.

Provider-specific databases, embeddings, hashes, credentials, caches, and
remote IDs belong below ignored local storage and are derived from these files.
