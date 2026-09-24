# Project memory in an MDK application

The default **App essentials** set installs `mdk-memory-application`. An existing
application can add it through **Add capabilities or skills → Project memory**
in `pnpm mdk`, or with `pnpm exec mdk add memory`.

The skill tells an agent when to retrieve or retain context. The CLI stores,
searches and validates entries locally. Neither records conversations
automatically nor requires an external memory service.

## Ownership and storage

| Content                              | Owner and location                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| Memory procedure                     | MDK-managed `mdk-memory-application` skill                                             |
| Local observations                   | Application-owned `.mdk/memory/<id>.json`; an internal `.gitignore` excludes the store |
| Reviewed team context                | Application-owned `docs/mdk-memory/<id>.json`; commit deliberately                     |
| SDK documentation and Mezo knowledge | Matching references under `.mdk/reference/`                                            |
| Authoritative application decisions  | Application code, tests and maintained documentation                                   |

Guidance sync preserves both memory stores. A new app starts with no observations;
MDK contributor memories are never copied into it. Skill directories contain
instructions, not captured memory. The local scope is the command default;
shared scope always requires `--scope shared`.

Entries use the existing [provider-neutral entry schema](../../agents/memory/schema/memory-entry.schema.json).
The application store uses flat files keyed by stable IDs and derives search
metadata during reads, without a separate maintained index. It does not use
MDK repository commands such as `pnpm context`.

## Retrieve relevant context

```sh
pnpm exec mdk memory search "fixture" --domain application/demo
pnpm exec mdk memory show starter-demo-fixture
pnpm exec mdk memory search "transport" --scope shared
pnpm exec mdk memory check
pnpm exec mdk memory check --scope shared
```

Search matches all query terms in ID, domain, title or summary, excludes deprecated
entries and returns up to twenty metadata records. Follow with `show` to read
one complete entry. Commands fail on malformed stores rather than silently
omitting bad entries. Stores are bounded to 2,000 entries; curate obsolete
context instead of growing a transcript archive.

Verify important claims against the linked current code or matching SDK reference.
Memory is supporting context, never proof of current balances, prices, deployment
state or protocol support.

## Save a useful finding

For example, after inspecting the unmodified starter, an agent can prepare this
entry as a temporary `entry.json` file. Use the actual inspection date and only
retain the observation if it is useful to future work:

```json
{
  "schemaVersion": 1,
  "id": "starter-demo-fixture",
  "domain": "application/demo",
  "status": "verified",
  "title": "The starter demo uses an offline fixture",
  "summary": "Inspect the starter network fixture before interpreting demo output as an observation from a live RPC endpoint.",
  "sources": ["src/network.ts", "src/index.ts"],
  "related": [],
  "updated": "2026-09-22"
}
```

```sh
pnpm exec mdk memory save --file entry.json --dry-run
pnpm exec mdk memory save --file entry.json
pnpm exec mdk memory check
pnpm exec mdk memory search "offline fixture"
```

Remove the temporary input file after saving. Saving an existing ID updates that
entry; the CLI preserves its neighbors. Writes replace one file atomically and
check for an intervening edit. Do not run concurrent saves to the same ID.

Local `discovered` entries can capture a bounded observation needing verification.
`verified` entries require source pointers. `promoted` entries also require a
`related` pointer to their canonical destination. Mark obsolete entries
`deprecated`. Shared saves reject `discovered` entries; a status and successful
validation do not substitute for reviewing truth, privacy or usefulness.

The entry schema bounds titles to 120 characters and summaries to 800. The CLI
also caps each pointer list at 100 items and stored files at 64 KiB. Keep entries
short, searchable and independently understandable.

Never store secrets, credentials, wallet data, personal information, raw logs,
chat transcripts, copied documentation or routine task completion history.
Prefer updating the authoritative document or code and retaining a pointer.

## Work with an agent

The generated application instructions route relevant work to installed skills.
For an existing `AGENTS.md`, add application-owned routing such as:

```markdown
For work that benefits from previous findings, use the installed
mdk-memory-application skill. After meaningful work, retain only useful,
verified context; otherwise report that no memory update was needed.
```

A first task can be:

> Follow AGENTS.md and the installed MDK skills. Explain the offline demo,
> add a meaningful invalid-input example, and run the application checks.
> Use project memory only if a reusable finding is worth retaining.

In a later session:

> Use the project memory skill to find prior demo findings, verify their
> sources against current code, and explain the existing validation approach.

The agent must load and follow the skill. MDK installs the files and checks their
integrity; automatic discovery depends on the agent host and its workspace.
