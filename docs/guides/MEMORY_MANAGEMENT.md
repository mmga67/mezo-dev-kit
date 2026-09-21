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
    │   ├── yes → update knowledge, current docs, skill, or code/tests
    │   │         optionally retain only a useful memory pointer
    │   └── no
    ├── Is it uncertain, investigation-local, or provider synchronization state?
    │   └── yes → local .mdk/memory
    └── Is it durable, reviewed, broadly useful, grounded, and export-safe?
        ├── yes → shared agents/memory/seed
        └── no  → local memory or no memory
```

| Destination                       | Use for                                                         | Git state | Authority                        |
| --------------------------------- | --------------------------------------------------------------- | --------- | -------------------------------- |
| No memory                         | Routine progress, disposable context, or duplicated material    | None      | None                             |
| `.mdk/memory/`                    | Discoveries, unfinished investigation, local/sync state         | Ignored   | Supporting local context only    |
| `agents/memory/seed/`             | Reviewed, durable, compact, export-safe cross-developer context | Tracked   | Supporting shared context only   |
| Knowledge/current docs/code/skill | Maintained fact, decision, behavior, or procedure               | Tracked   | Canonical for its owned concern  |
| External provider/index storage   | Rebuildable search index, embedding, cache, or remote ID        | External  | Derived retrieval infrastructure |

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

The offline contributor tool searches knowledge and relevant memory together:

```sh
pnpm context find --query 'price' --module prices --memory-domain prices
pnpm context memory-read --scope shared --id price-selection-evidence-routing
pnpm context find --query 'price' --module prices --memory-domain prices --local-memory
```

Use memory when prior context could shorten a search, resolve terminology or
prevent a repeated investigation. A direct known canonical reference needs no
mandatory memory detour. Instructions define the procedure; memory preserves
useful context between sessions; canonical knowledge establishes the facts.
One query can find both without treating them as equally authoritative.

Without a domain filter, memory index metadata selects candidates before their
summaries are read. With `--memory-domain`, summaries in that narrow domain and
its children are searched. Local memory is explicit and optional; deprecated
entries require `--include-deprecated`. Absent local storage does not require
setup or a replacement provider. See the [retrieval manual](../../scripts/agents/CONTEXT.md)
for exact coverage and output limits.

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

## Write for future retrieval

Save a note only when it will help a later task. The goal is a useful route back
to the right evidence, not a larger store. Follow this sequence when finishing
an investigation or maintaining a durable finding.

### 1. Decide what survives this session

| Information                                                                                   | Save it in                                                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Verified protocol rule, deployment identity, formula or bounded observation                   | Its indexed knowledge owner and evidence resources                           |
| Reusable way to perform a task                                                                | The existing skill or guide                                                  |
| Runtime behavior or a regression                                                              | The owning code and meaningful tests                                         |
| Active work, next actions or a review decision                                                | The local task/review record                                                 |
| Useful cross-session route, terminology connection or explanation of an earlier investigation | A compact memory entry linked to the owner                                   |
| Raw output, exploratory reasoning, repeated progress or copied documentation                  | Do not store in memory; retain necessary evidence under its designated owner |

For example, a transaction's wallet, token ID and receipt do not belong in
shared memory. A useful memory might instead explain which indexed operation
and source catalog answer a recurring class of integration question. If the
guide already supplies that route clearly, no memory entry is needed.

### 2. Search before creating an entry

Choose the existing narrow domain, search relevant shared and optional local
memory, and inspect candidate entries. Update an existing stable ID for the
same subject. Similar wording is not enough to merge unrelated scopes; a local
entry never silently overrides a shared entry with the same ID.

Use the established schema. Do not invent parallel Markdown notes, append a
chat transcript, or add unvalidated fields because a provider once supported
them. `sources` and `related` contain pointers; they do not carry copied facts.

### 3. Make the entry independently useful

- **Title:** include concrete topic nouns and the lookup question. Prefer
  “Locate retained widget parser evidence” to “Important discovery”. Use the
  domain's normal terminology rather than a transaction hash or task number.
- **Summary:** state when the pointer helps, where to look, and what must be
  rechecked. Keep it within 800 characters. Distinguish an observed result
  from an unresolved question. Do not include exploratory reasoning.
- **Sources:** point to the canonical record/evidence or exact source section
  supporting the context. For knowledge, include its owning file/index and
  name the stable module/resource/record identity in the summary when useful.
  Use `pnpm context` to resolve those IDs; paths alone can move.
- **Related:** point to the current owner, replacement or follow-up context.
  Keep task progress in the task itself. A promoted memory needs a canonical
  destination here.
- **Scope and invalidation:** use the summary to state meaningful version,
  network or change conditions when needed. For example, recheck when the
  package export map or source generation changes. Schema v1 has no dedicated
  validity fields; do not invent them or interpret `updated` as verification.
- **Status/date:** choose an existing lifecycle state and use the actual edit
  date. A recent edit, search ranking or successful schema check does not make
  the claim current or accepted.

Keep source bytes, hashes, historical coordinates and full reproduction detail
in their canonical evidence owner. Memory should lead there, not maintain a
second snapshot that must be kept synchronized by hand.

### 4. Write the entry and index together

Create/update `<stable-id>.json` in the selected store and the matching entry
in its sibling `index.json`. Preserve the ID when improving wording or moving
through the lifecycle. New uncertain observations remain local and explicitly
`discovered`; shared promotion follows the existing review procedure below.

Run:

```sh
pnpm context memory-check
pnpm context memory-check --local-memory
git check-ignore -v .mdk/memory/index.json
```

The tool checks the owning schemas, duplicates, filenames, orphan entries and
index agreement. It rejects discovered entries in shared storage. It does not
certify privacy, links, source truth or review; inspect those separately.

### 5. Prove the note is retrievable

Search with a plausible future question and its domain, rather than the exact
ID you just wrote. Read the returned entry and follow its sources to the
canonical answer. Check that the title/domain select it and that its scope and
uncertainty remain visible. If the note cannot be found, improve its useful
wording or domain; do not repeat keywords or copy the source into it.

Record only the task's actual validation outcome. Do not create another memory
entry saying that memory maintenance completed.

### 6. Maintain the pointer when the owner changes

Recheck a retrieved pointer against current source before depending on it.
After promotion, shorten it to a route and mark it `promoted` if it still helps.
When contradicted or superseded, mark shared context `deprecated` and link the
replacement; update or discard a local draft under the lifecycle below.
Deprecated entries remain available for deliberate historical lookup but are
excluded from ordinary retrieval. An absent search match is not a conclusion
that a capability or historical fact is unavailable.

## Moving from a previous memory application

An external memory service is replaceable infrastructure. Existing useful
context can be preserved through a separately authorized export, but it must
not be silently reconstructed from recollection or imported as verified fact.

1. Obtain a bounded export through the provider's actual documented capability.
   Do not guess its API, install a replacement provider or add credentials just
   to read this repository.
2. Keep the export in approved ignored storage and review it for prohibited
   content. Do not place raw exports in shared seed memory.
3. Match each useful item to an existing canonical owner or memory ID; discard
   duplicate, obsolete and routine history.
4. Verify source identity and scope outside the old provider. If the source
   cannot be recovered, keep only an explicit local evidence gap when useful;
   do not mark the old provider's assertion verified.
5. Write valid provider-neutral entries using the normal capture/review flow,
   then test retrieval without the provider. Provider record IDs and caches
   remain derived local state.

No provider export or synchronization is performed by `pnpm context`.

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
- architecture or governance → manifest and detailed architecture;
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
pointer to the original source-governance decision rather than a copy of its
policy. That historical example retains its original reference; new pointers
to current governance use the manifest.

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
   node scripts/agents/validate-agent-skills.ts
   node scripts/checks/validate-markdown-links.ts
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
Related canonical owner: <knowledge/current-doc/code/skill path or none>
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
- `promoted` — a historical pointer after governance moved into a decision record; and
- `deprecated` — a stale package-publication assumption retained only to route
  readers to the accepted source-alpha decision.
