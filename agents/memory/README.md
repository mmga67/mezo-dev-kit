# Agent Memory

This document defines the **provider-neutral memory architecture and lifecycle** for Mezo Developer Kit (MDK).

Memory exists to preserve useful development context and reduce repeated investigation. It is **not a source of truth**. Verified project facts belong in canonical knowledge, architecture, documentation, code, or ADRs.

## 1. Memory Model

```text
Agent
  │
  ▼
MemoryService
  ├── retrieval policy
  ├── lifecycle policy
  └── normalized memory schema
          │
          ▼
     MemoryProvider
       ├── Plain text
       ├── External service adapter
       └── other adapters
```

Agents and MDK workflows must depend on the provider-neutral memory contract, not provider-specific APIs.

Provider-specific search, ingestion, indexing, authentication, and maintenance belong in adapters and the memory skill.

## 2. Storage Levels

### Shared repository memory

```text
agents/memory/seed/index.json
```

Committed to Git.

Use only for curated, durable context that is useful across developers and agents but is not better represented as canonical project knowledge.

Keep this layer small.

### Local working memory

```text
.mdk/memory/index.json
```

Local and gitignored.

Use for investigation findings, temporary conclusions, unfinished reasoning, and provider synchronization state.

Local memory must not automatically become shared project knowledge.

### Provider state

External-provider indexes, databases, embeddings, caches, and provider record
IDs are **derived runtime state**.

They normally live outside Git and may be rebuilt from repository/local memory and canonical sources.

## 3. Memory Entry

Providers may store data differently, but MDK normalizes memories to the schema
in [`schema/memory-entry.schema.json`](./schema/memory-entry.schema.json). The
plain-text baseline stores one JSON file per entry with this logical shape:

```json
{
  "schemaVersion": 1,
  "id": "stable-memory-id",
  "domain": "protocols/redemptions",
  "status": "discovered",
  "title": "Short searchable title",
  "summary": "Durable context",
  "sources": ["path/or/source"],
  "related": ["path/to/code-or-doc"],
  "updated": "YYYY-MM-DD"
}
```

The allowed statuses are `discovered`, `verified`, `promoted`, and `deprecated`.
Stored entries must be valid JSON and conform to the schema.

Keep entries concise and independently understandable.

Never store secrets, credentials, private data, raw logs, large copied files, or routine task completion history.

## 4. Retrieval

Memory retrieval is **progressive**:

```text
classify task
→ determine relevant domain
→ retrieve relevant memory only
→ verify important claims against canonical sources/code
→ continue work
```

Do not search the entire memory store for every task.

Memory can suggest where to look or explain previous findings. It cannot independently prove protocol-sensitive behavior.

For the filesystem baseline, inspect the shared and optional local indexes,
select by domain and title, and open only the matching entry files. The
operational procedure is in
[`agents/skills/mdk-memory/SKILL.md`](../skills/mdk-memory/SKILL.md).

## 5. Ingestion and Provider Sync

Repository memory is portable source material. A provider may index it for better search.

Intended flow:

```text
agents/memory/seed/
+ optional local memory
        │
        ▼
normalize + validate
        │
        ▼
MemoryProvider.sync(...)
        │
        ▼
external provider
```

Synchronization should eventually use stable IDs and content hashes so unchanged memories are not repeatedly ingested.

Canonical documentation may also be indexed for retrieval efficiency, but indexed copies must retain their original source identity and remain **derived indexes**, not independent memories or competing sources of truth.

Do not periodically ask a provider to "learn the repository" without source tracking and lifecycle control.

## 6. Memory Lifecycle

The normal lifecycle is:

```text
SESSION DISCOVERY
      ↓
LOCAL MEMORY
      ↓
SHARED MEMORY          optional
      ↓
VERIFICATION
      ↓
CANONICAL KNOWLEDGE / DOC / ADR / CODE
      ↓
MEMORY PROMOTED OR DEPRECATED
```

### Discovery

An agent finds something useful during implementation or investigation.

If it is uncertain or only locally useful, keep it in local memory.

### Shared memory

Promote a finding to repository memory only when it is durable, useful to future work, and sufficiently grounded to share.

Shared memory still is not canonical authority.

### Verification

Important findings are checked against authoritative sources, current code, tests, or reproducible behavior.

### Promotion

If a verified finding represents a project fact, architecture decision, protocol rule, public behavior, or maintained procedure, move its authoritative content to the proper owner:

```text
knowledge/        verified Mezo facts
docs/             maintained explanations/reference
ADR               architecture decisions
code/tests        executable behavior
skill             reusable procedure
```

The memory should then become a short pointer/context record or be deprecated if it no longer adds value.

### Deprecation

Remove or mark memories that are obsolete, contradicted, superseded, or no longer useful.

Memory must not preserve stale conclusions indefinitely.

## 7. Repository Layout

```text
agents/memory/
├── README.md          # this architecture/lifecycle contract
├── schema/            # provider-neutral schemas
├── seed/              # curated shared index and entries
├── providers/         # provider adapters/config guidance
└── evals/             # retrieval/lifecycle evaluations
```

Local runtime state:

```text
.mdk/
└── memory/            # gitignored
```

## 8. Initial Implementation

V1 should remain simple:

```text
MemoryService
    ↓
PlainTextProvider
    ├── agents/memory/seed/   shared, tracked
    └── .mdk/memory/          local, ignored
```

The baseline format and retrieval behavior are defined in
[`providers/plain-text.md`](./providers/plain-text.md). Optional adapters may
support external providers without making them repository dependencies.

For the step-by-step human and coding-agent workflow—including storage
selection, lifecycle examples, manual schema review, privacy checks, promotion,
and deprecation—use the
[`memory management guide`](../../docs/guides/MEMORY_MANAGEMENT.md).

Add more complex vector/database providers only after the memory schema, retrieval policy, and lifecycle have proven useful.

## 9. Core Rule

**The repository is the durable project asset; memory providers are replaceable retrieval infrastructure.**

Memory preserves useful context. Canonical knowledge preserves truth.
