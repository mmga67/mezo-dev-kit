# MDK memory management

MDK memory preserves compact retrieval context that can prevent repeated
investigation. It is not proof, authorization, canonical project knowledge, or
a substitute for current code and tests.

The repository must work without an external memory service. The baseline is
the plain-text provider defined in
[`agents/memory/README.md`](../../agents/memory/README.md) and
[`agents/memory/providers/plain-text.md`](../../agents/memory/providers/plain-text.md).

## Choose the right owner

Use this decision flow before writing anything:

```text
Will the note materially help a later task?
├── no  → do not store it
└── yes
    ├── Is it a project/protocol fact, decision, procedure, or behavior?
    │   ├── yes → update knowledge, docs/ADR, skill, or code/tests
    │   │         optionally retain only a useful memory pointer
    │   └── no
    ├── Is it uncertain, investigation-local, or provider synchronization state?
    │   └── yes → local .mdk/memory
    └── Is it durable, reviewed, broadly useful, grounded, and export-safe?
        ├── yes → shared agents/memory/seed
        └── no  → local memory or no memory
```

| Destination                     | Use for                                                         | Git state | Authority                        |
| ------------------------------- | --------------------------------------------------------------- | --------- | -------------------------------- |
| No memory                       | Routine progress, disposable context, or duplicated material    | None      | None                             |
| `.mdk/memory/`                  | Discoveries, unfinished investigation, local/sync state         | Ignored   | Supporting local context only    |
| `agents/memory/seed/`           | Reviewed, durable, compact, export-safe cross-developer context | Tracked   | Supporting shared context only   |
| Knowledge/docs/ADR/code/skill   | Maintained fact, decision, behavior, or procedure               | Tracked   | Canonical for its owned concern  |
| External provider/index storage | Rebuildable search index, embedding, cache, or remote ID        | External  | Derived retrieval infrastructure |

If the same content belongs in a canonical owner, put it there. Do not create a
memory copy merely because it may be easier to search.

## Entry and index contract

One memory entry is stored in one JSON file named `<stable-id>.json`. Its
normalized shape is owned by
[`memory-entry.schema.json`](../../agents/memory/schema/memory-entry.schema.json).
Every plain-text entry must appear exactly once in its sibling index, whose
shape is owned by
[`memory-index.schema.json`](../../agents/memory/schema/memory-index.schema.json).

Entry fields:

| Field           | Rule                                                                  |
| --------------- | --------------------------------------------------------------------- |
| `schemaVersion` | Exactly `1`                                                           |
| `id`            | Stable lowercase/digit/hyphen ID, at most 80 characters               |
| `domain`        | Narrow lowercase path using `/` or `-`, at most 120 characters        |
| `status`        | `discovered`, `verified`, `promoted`, or `deprecated`                 |
| `title`         | Short searchable title, at most 120 characters                        |
| `summary`       | Concise independently understandable context, at most 800 characters  |
| `sources`       | Unique source/evidence pointers; required for verified/promoted state |
| `related`       | Unique owning or related pointers; required for promoted state        |
| `updated`       | Actual update date as `YYYY-MM-DD`                                    |

The index repeats only `id`, `domain`, `status`, `title`, and the sibling file
`path` so retrieval can select an entry without loading every summary. When an
entry changes, update its `updated` date and matching index metadata. Do not
change its stable ID merely because status or wording changes.

## Retrieve memory progressively

1. Classify the current task and choose one narrow domain.
2. Inspect the shared index and the optional local index, not every entry.
3. Select by `domain`, `title`, and `status`.
4. Open only matching entry files.
5. Follow `sources` and verify every important claim against current canonical
   knowledge, docs, code/tests, or authoritative evidence before relying on it.

Start with the tracked shared index:

```sh
sed -n '1,200p' agents/memory/seed/index.json
```

Check for a local index without requiring one to exist:

```sh
if test -f .mdk/memory/index.json; then
  sed -n '1,200p' .mdk/memory/index.json
fi
```

After identifying a candidate, open that one file. Do not recursively load
`.mdk/memory`, the shared seed, provider indexes, or the entire repository by
default.

## Capture a local discovery

Local capture is the default for uncertain or unfinished observations.

1. Confirm the note is useful and contains no prohibited data.
2. Create `.mdk/memory/` if needed.
3. Create or update `.mdk/memory/index.json` with `scope: "local"`.
4. Add one sibling entry using a stable ID and `status: "discovered"`.
5. Keep the summary explicit about uncertainty and point to the reproduction or
   source instead of copying raw output.
6. Validate JSON, schema constraints, index/entry agreement, and Git ignore
   status.

Confirm local memory remains ignored:

```sh
git check-ignore -v .mdk/memory/index.json
```

The synthetic
[`discovered` example](./examples/memory/example-discovered-local.json) and its
[`local index`](./examples/memory/local-index.example.json) show the shape. The
files under `docs/guides/examples/` are documentation fixtures, not live memory
stores.

## Propose shared memory

Shared memory is exceptional. A candidate must be durable, useful across tasks,
reviewed, source-grounded, safe to export, and not better represented by a
canonical owner.

1. Verify the finding before sharing it; a `discovered` entry remains local.
2. Reduce it to retrieval context or a pointer rather than copying the source.
3. Add the entry under `agents/memory/seed/<stable-id>.json` with `verified`,
   `promoted`, or `deprecated` status.
4. Add matching selection metadata to `agents/memory/seed/index.json`.
5. Review privacy, duplication, sources, related pointers, and lifecycle.
6. Obtain normal human review before merging shared memory.

The synthetic
[`verified` example](./examples/memory/example-verified-shared.json) points to
the canonical tooling owners rather than restating their rules.

## Verify and promote

### Verification

Verification follows sources out of memory:

- protocol/network/contract claims → authoritative evidence and canonical
  knowledge;
- architecture or governance → accepted architecture/ADR;
- runtime behavior → current code plus meaningful tests;
- procedure → the maintained guide/skill and an executed workflow.

Only then may an entry become `verified`. Protocol-sensitive content still
requires its normal Level 3 evidence and qualified review; a memory status
cannot lower that gate.

### Promotion

When a finding is actually a durable fact, decision, procedure, or executable
behavior:

1. Update the canonical owner.
2. Verify and review that owner at the appropriate risk level.
3. Change the memory to `promoted` only if a short retrieval pointer remains
   useful.
4. Put the canonical destination in `related` and retain provenance in
   `sources`.
5. Otherwise delete an unshared local draft or deprecate a shared record.

The synthetic
[`promoted` example](./examples/memory/example-promoted-pointer.json) contains a
pointer to ADR-0013 rather than another copy of its governance policy.

## Deprecate, supersede, or delete

These actions are different:

- **Deprecate:** keep a shared or useful local record for historical retrieval,
  set `status: "deprecated"`, explain why it is stale, and point to the current
  owner.
- **Supersede:** when newer context replaces older context, normally deprecate
  the old entry and use `related`/`summary` to identify the replacement. There
  is no separate `superseded` schema status.
- **Promote:** authoritative content moved into its canonical owner; keep only a
  pointer if it still aids retrieval.
- **Delete:** remove a disposable local draft with no future value, or remove
  sensitive/prohibited material through the repository's security process.
  Deletion is not a way to hide a contradicted shared conclusion.

When deleting a plain-text entry, also remove its index row. When retaining it,
keep the stable ID and update both entry and index status. The
[`deprecated` example](./examples/memory/example-deprecated-context.json) shows
how an obsolete package-publication assumption points to the accepted source-
alpha decision.

## Validate an entry manually

No dedicated memory-schema validator is currently implemented. Do not claim
that JSON parsing alone proves schema conformance.

For every changed entry and index:

1. Parse and format the JSON with the repository's pinned Prettier:

   ```sh
   pnpm exec prettier --check <entry.json> <index.json>
   ```

2. Compare the entry field names, types, lengths, patterns, status-dependent
   source/related requirements, and `additionalProperties: false` rule with the
   two current schemas.
3. Confirm the index `scope` matches the store, each `path` is a sibling JSON
   file, IDs are unique, and every entry is indexed exactly once.
4. Confirm entry/index `id`, `domain`, `status`, and `title` agree.
5. For local memory, run `git check-ignore -v`; for shared memory, review the
   tracked diff and export safety.
6. Run agent-skill and documentation checks when tracked guidance changes:

   ```sh
   node scripts/validate-agent-skills.ts
   node scripts/validate-markdown-links.ts
   git diff --check
   ```

The example fixture directory includes both local and shared example indexes so
the one-entry/one-index relationship can be reviewed directly.

## Optional provider synchronization

MDK does not currently implement a provider sync command, content-hash
contract, credential flow, hosted/vector adapter, or remote record format.

Any future adapter must:

- preserve stable entry IDs and source identity;
- treat embeddings, provider IDs, hashes, caches, credentials, and sync state
  as derived local/external state;
- remain replaceable and rebuildable from approved source material;
- never promote provider results automatically;
- redact secrets and private data; and
- receive explicit approval before adding a provider, dependency, credential,
  or external mutation.

Until such an adapter is approved, “synchronize” means no more than validating
the provider-neutral files and designing a bounded export/import separately.
Do not invent a provider API or credential location.

## Coding-agent request template

Use a request with explicit authority and privacy boundaries:

```text
Task: <task ID and outcome>
Memory domain: <narrow lowercase domain>
Operation: retrieve | capture-local | propose-shared | verify | promote | deprecate
Allowed store: none | .mdk/memory | agents/memory/seed
Canonical sources to verify: <paths/evidence>
Related canonical owner: <knowledge/doc/ADR/code/skill path or none>
Prohibited data: secrets, credentials, private endpoints, personal data,
  raw logs, copied source files, speculation, routine task history
Required checks: entry/index schema review, JSON formatting, index agreement,
  git-ignore/export-safety review, relevant links/tests
Human gate: shared memory and protocol-sensitive verification require review
```

The coding agent must first classify the task, read only relevant indexes,
verify important claims outside memory, and finish with an explicit decision:
no memory update, local capture, shared proposal, promotion, or deprecation.

## Review checklist

- [ ] The note will materially help later work.
- [ ] The selected store is correct and no canonical owner is being duplicated.
- [ ] Domain and stable ID are narrow, searchable, and schema-valid.
- [ ] Summary is concise, independently understandable, and honest about
      uncertainty.
- [ ] Sources and related pointers lead to current owners/evidence.
- [ ] Entry and index metadata agree; lifecycle transition and date are
      updated.
- [ ] Local/provider state is ignored or external; shared material is reviewed
      and export-safe.
- [ ] No prohibited data or broad repository dump is present.
- [ ] Important and protocol-sensitive claims were verified at their normal
      risk level.
- [ ] Exact checks and human review outcomes are recorded.

## Never store

- private keys, mnemonics, signing material, tokens, credentials, cookies, or
  private endpoints;
- personal, customer, partner-confidential, or wallet-identifying data;
- raw logs, raw provider dumps, embeddings, caches, remote IDs, or large copied
  files;
- speculation presented as fact or an unverifiable protocol claim;
- routine task progress, chat history, completion reports, or source-code
  copies;
- duplicated addresses, ABIs, deployments, formulas, procedures, or accepted
  decisions; or
- an indiscriminate “memory of the whole repository.”

Never treat memory status, provider ranking, similarity score, or retrieval
frequency as proof, support status, or authorization.

## Worked example index

The complete synthetic fixture set is documented in
[`examples/memory/README.md`](./examples/memory/README.md):

- `discovered` — an unverified local timeout observation;
- `verified` — a reviewed pointer to current tooling owners;
- `promoted` — a short pointer after governance moved to ADR-0013; and
- `deprecated` — a stale package-publication assumption retained only to route
  readers to the accepted source-alpha decision.
