# ADR-0006 — Knowledge module architecture v0.4

- Status: Accepted
- Date: 2026-08-20

## Context

The migrated knowledge domains are evidence-backed, but their directory shapes
and record envelopes grew independently. Human orientation, agent procedure,
schema prose, executable validation, candidate inventories, canonical records,
and evidence can appear together at a module root. Indexes use different field
names and status vocabularies, while cross-domain consumers sometimes depend on
physical paths.

This is workable during extraction but is not a clear long-term contract. A
human must be able to understand and maintain a module without reading
agent-only instructions. An agent needs concise automatically scoped rules and
an on-demand procedure rather than duplicated narrative. Moving files into a
cleaner layout must not change their logical identities or require facts to be
researched again.

## Proposed Decision

### Universal module contract

Every v0.4 knowledge module has exactly two required root files:

- `README.md` is the human entry point and describes purpose, scope, status,
  ownership, and the normal validation command;
- `index.json` is the machine entry point and maps stable resource IDs to
  physical files.

Other locations exist only when the module has content for their role:

```text
module/
├── README.md
├── index.json
├── records/       # canonical machine-readable facts
├── sources/       # source catalogs and pinned source metadata
├── evidence/      # bounded observations and reproductions
├── fixtures/      # deterministic validation inputs
├── schema/        # domain structural schemas
├── review/        # candidates, gaps, conflicts, and review packets
├── artifacts/     # raw canonical inputs such as ABIs
└── generated/     # derived output only when it must live with the module
```

Directories are organized by responsibility, not file extension. The root
`index.json` is the intentional machine-routing exception. Empty role
directories and placeholder files are not required.

Specialized domains may extend records and use specialized artifacts, but they
must use the same roles and common envelope. A nested `AGENTS.md` is allowed
only when a subtree needs concise rules that cannot be expressed by the root
knowledge instructions and the relevant skill.

### Human, agent, and executable surfaces

Each surface has one responsibility:

| Surface | Responsibility |
| --- | --- |
| module `README.md` | Human orientation and domain entry point |
| `docs/standards/knowledge-management.md` | Human-neutral maintenance policy and workflows |
| `knowledge/AGENTS.md` | Concise, automatically scoped agent constraints and routing |
| `agents/skills/mdk-knowledge-maintenance/SKILL.md` | Reusable agent maintenance procedure |
| domain skill | Additional domain procedure and risk checks |
| JSON Schema | Machine-readable structural shape |
| semantic validator | Cross-record, evidence, digest, freshness, and domain invariants |
| generated reference | Human-readable projection; never an independent authority |

The handbook is not agent-only. Humans and agents follow the same maintenance
contract; agent files say how an agent should retrieve and apply it.

### Common envelope and lifecycle vocabulary

Every v0.4 module index and maintained JSON record, except raw artifacts,
schemas, and generated output, declares:

- `schemaVersion`: positive integer version of that record kind;
- `kind` and stable `id`;
- `owner`;
- `status`: `candidate`, `unverified`, `verified`, `conflicting`, or
  `superseded`;
- `supportStatus`: `none`, `proposed`, `supported`, `historical`, or
  `deprecated`;
- `reviewStatus`: `unreviewed`, `pending-architecture-review`,
  `pending-qualified-review`, `accepted`, or `rejected`;
- `verifiedAt` and `reviewAfter`, each an RFC 3339 timestamp or `null`;
- explicit `scope` and `limitations`.

`status` describes evidence maturity, `supportStatus` describes the MDK support
promise, and `reviewStatus` describes human approval. None implies another.
`verifiedAt` records the last completed evidence check; `reviewAfter` is a
freshness trigger, not an automatic statement that a fact became false.

The module index also declares `knowledgeVersion: "0.4"`, its stable
`moduleId`, resource mappings, and named validation commands.

### Stable references and physical resolution

A cross-resource reference uses:

```json
{
  "moduleId": "networks",
  "resourceId": "network-records",
  "recordId": "mezo-mainnet",
  "pointer": "/values/evmChainId"
}
```

Only `moduleId` and `resourceId` are required. `recordId` selects an item in a
collection and `pointer` is an RFC 6901 JSON Pointer. The target module's
`index.json` resolves the resource ID to a repository path. Cross-domain
records must not use relative paths as identity. Paths inside a source/evidence
record may still identify a pinned repository artifact when the path itself is
part of the evidence locator.

The Networks pilot refined collection resolution without changing this model:
a resource with multiple addressable records declares its `recordIds` and an
RFC 6901 `recordCollectionPointer` to the containing array. A root-record
resource needs no collection pointer. This avoids domain-specific guessing
while allowing established fields such as `records`, `sources`, and
`observations` to remain intact.

The Contracts migration further refined only the `recordId` grammar. Existing
deployment identities use `contractId@networkId` and may append a
`#deployment-key`; logical references and indexed `recordIds` therefore permit
`@` and `#`. Module and resource ID grammar is unchanged, and no deployment ID
is renamed.

### Schema and validation boundary

Repository-wide JSON Schemas under `knowledge/schema/v0.4/` own the common
envelope, module index, and logical reference shapes. A module's `schema/`
directory may extend those structures for its record kinds.

JSON Schema owns local structural constraints: required fields, primitive
types, enums, and simple formats. Dependency-free semantic validators continue
to own uniqueness across files, reference resolution, digest and bytecode
checks, evidence sufficiency, time comparisons, generated drift, and protocol
invariants. Passing either layer alone is not proof or approval.

### Generation and migration

Generated resources declare their canonical inputs. Generators must be
deterministic, and verification must fail when checked-in output drifts from
its declared inputs. Generated Markdown may improve human readability but does
not replace the module README or canonical records.

Migration from v0.3 was completed module-by-module. Moving a file updates only its resource
mapping and inbound legacy paths; stable module/resource/record IDs remain the
same. Existing evidence and records are preserved. Re-verification is required
only when evidence is stale, conflicting, invalidated by the move, or otherwise
required by the domain's risk rules. Mixed v0.3/v0.4 operation was permitted
during migration. The all-v0.4 cutover implementation completed on 2026-08-21
and was accepted under knowledge architecture acceptance's architecture and qualified Level 3 review on
2026-08-21.

## Alternatives

- Keep each domain's current bespoke layout: rejected because maintainers and
  consumers must learn unrelated routing and lifecycle conventions.
- Put all JSON in one `json/` directory and all Markdown at the root: rejected
  because file type does not communicate authority or lifecycle role.
- Put detailed human and agent instructions in every module: rejected because
  duplicated procedure will drift and inflate automatically loaded context.
- Require one generic validator dependency immediately: rejected because the
  present contract can be enforced without adding an unapproved dependency;
  a future dependency can be evaluated separately.
- Make physical paths canonical identifiers: rejected because routine layout
  improvements would become breaking data changes.

## Consequences

- Humans get a predictable README plus a single maintainer handbook.
- Agents get short scoped rules and load detailed procedures only when needed.
- Most module roots become smaller while evidence, schemas, and review material
  remain visibly distinct.
- Indexes and records require an explicit migration to the common envelope.
- During migration, consumers must tolerate legacy indexes or use the v0.4
  conformance validator's mixed-mode behavior. After knowledge architecture acceptance, repository
  consumers require the root catalog and all-v0.4 conformance.
- Domain validators remain necessary; the common structural schema does not
  encode protocol truth.

## Acceptance Gate

A human architecture reviewer must accept the module roles, lifecycle
vocabulary, reference contract, and schema/validator boundary before network schema migration
moves the Networks module. Acceptance must update this ADR to `Accepted` and
record any amendments in knowledge conformance review.

Accepted by the human maintainer on 2026-08-20 without amendment. Acceptance
establishes the v0.4 contract; it does not claim that any existing domain has
already migrated or passed its domain review.
