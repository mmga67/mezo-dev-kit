# Knowledge management standard

This standard defines how humans and agents read, add, update, review, move,
deprecate, and generate MDK knowledge. It applies to every knowledge module,
while domain schemas and validators add stricter rules where needed.

The [manifest](../manifest#knowledge-structure) defines the knowledge boundary.
This standard owns the detailed maintenance contract. The layout identifier
remains `knowledgeVersion: "0.4"`; it is independent of the manifest version.

## Authority and audiences

`knowledge/` is the canonical MDK retrieval layer for reusable,
evidence-backed Mezo facts. Canonical means maintained owner; it does not mean
that a record proves itself. The evidence cited by a claim remains the proof
for the scope it establishes.

Humans and agents use the same facts and lifecycle:

| Need                            | Start here                  | Responsibility                                     |
| ------------------------------- | --------------------------- | -------------------------------------------------- |
| Understand a domain             | module `README.md`          | Purpose, subjects, relevant limits, and next steps |
| Find machine-readable content   | module `index.json`         | Stable resource IDs and physical resolution        |
| Learn maintenance policy        | this standard               | Human-neutral repository workflow                  |
| Receive automatic agent rules   | `knowledge/AGENTS.md`       | Short subtree constraints and routing              |
| Perform repeated maintenance    | knowledge and domain skills | Agent procedures, not facts                        |
| Check record shape              | JSON Schema                 | Local structural contract                          |
| Check meaning and relationships | semantic validator          | Cross-record and domain invariants                 |

Follow the [documentation standard](documentation.md) for README structure,
human/agent separation, and references. Human maintenance follows the
[authoring guide](../guides/KNOWLEDGE_AUTHORING.md). Skills route agents through
this policy without copying it or the protocol facts.

## Universal module contract

Every knowledge module requires:

```text
README.md    human entry point
index.json   machine entry point and physical resolver
```

Add only the role directories the module actually needs:

```text
records/     canonical machine-readable facts
sources/     source catalogs and pinned source metadata
evidence/    bounded observations and reproductions
fixtures/    deterministic test and validation inputs
schema/      domain structural schemas
review/      candidates, gaps, conflicts, and review packets
artifacts/   canonical raw inputs that are not record envelopes, such as ABIs
generated/   derived output only when it must be colocated with the module
```

The organization is universal by **role**, not by identical content. Networks,
contracts, protocols, workflows, and troubleshooting may define different
record kinds inside the contract. Do not create empty role directories.

Most JSON therefore leaves the module root, but the goal is not a `json/`
bucket. `records/model.json` and `evidence/probe.json` have different authority
even though both are JSON. `index.json` intentionally remains at the root so a
human or tool can find the module without guessing. `README.md` is the only
required Markdown root document; review Markdown belongs in `review/` when it
is not necessary for basic orientation.

### Resource roles

Every maintained content file, excluding the required `README.md` and
`index.json` control files and any applicable `AGENTS.md`, is indexed with a
stable resource ID and one role:

- `canonical-record` — maintained facts queried by consumers;
- `source-catalog` — authoritative-source identity and what each source can
  establish;
- `evidence` — bounded observations or reproductions;
- `fixture` — deterministic input used to test behavior or validation;
- `schema` — structural contract;
- `review` — non-canonical candidates, gaps, conflicts, and decisions awaiting
  promotion;
- `artifact` — canonical raw input such as an ABI or source bundle;
- `generated` — reproducible projection of indexed canonical inputs.

A file has one primary role. If one file appears to need two roles, split it or
choose the owner whose lifecycle actually governs it.

The contract was checked against the repository's domain shapes:

| Domain shape    | v0.4 specialization                                                       |
| --------------- | ------------------------------------------------------------------------- |
| Networks        | Chain and endpoint records; short-lived probe evidence                    |
| Contracts       | Deployment records plus ABI/source-bundle `artifacts/`                    |
| Protocols       | Semantic/model records, governed-state evidence, and calculation fixtures |
| Workflows       | Lifecycle/requirement records and end-to-end observation evidence         |
| Troubleshooting | Issue records, reproduction evidence, and review-only unresolved leads    |

These differences extend record kinds and semantic checks; they do not require
different human, index, evidence, lifecycle, or stable-reference contracts.

## Common record envelope

Every v0.4 maintained JSON record, module index included, uses the common
envelope. Raw artifacts, JSON Schemas, and generated outputs are exempt because
their formats have separate owners.

| Field           | Meaning                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | Positive integer version of that record kind                                                                 |
| `kind`          | Stable machine-readable record kind                                                                          |
| `id`            | Stable identity within the owning module                                                                     |
| `owner`         | Team/domain responsible for maintenance                                                                      |
| `status`        | Evidence maturity: `candidate`, `unverified`, `verified`, `conflicting`, or `superseded`                     |
| `supportStatus` | MDK promise: `none`, `proposed`, `supported`, `historical`, or `deprecated`                                  |
| `reviewStatus`  | Approval: `unreviewed`, `pending-architecture-review`, `pending-qualified-review`, `accepted`, or `rejected` |
| `verifiedAt`    | Last completed evidence check, or `null` when not verified                                                   |
| `reviewAfter`   | Freshness/review trigger, or `null` when governed another way                                                |
| `scope`         | Explicit networks, versions, deployments, blocks, or other applicability                                     |
| `limitations`   | What must not be inferred from the record                                                                    |

The three status fields are independent. In particular, `verified` does not
mean `supported`, and `accepted` review does not waive a future freshness
check. A semantic validator must reject impossible combinations, such as
`status: verified` with no `verifiedAt`, when the domain contract requires a
timestamp.

`schemaVersion` versions a record kind. The module index separately declares
`knowledgeVersion: "0.4"`, which identifies this repository-wide layout and
coordination contract.

The executable common shapes are in `knowledge/schema/v0.4/`. Domain record
schemas may add fields and narrower enums but must not redefine these fields
with conflicting meanings.

## Indexes and logical references

The module index declares:

- `knowledgeVersion: "0.4"` and `kind: knowledge-module-index`;
- a stable `moduleId` equal to its envelope `id`;
- one resource entry for every maintained module resource;
- named structural, semantic, generation, or drift checks.

A resource containing multiple addressable records declares both `recordIds`
and `recordCollectionPointer`. The pointer identifies the array containing
those records, such as `/records`, `/sources`, or `/observations`. A resource
whose root object is the addressed record declares `recordIds` without a
collection pointer. This keeps resolution explicit without forcing every
domain to rename its established collection field.

Resource IDs are stable even when paths change. A logical reference has:

```json
{
  "moduleId": "networks",
  "resourceId": "network-records",
  "recordId": "mezo-mainnet",
  "pointer": "/values/evmChainId"
}
```

`recordId` and `pointer` are optional. The pointer follows RFC 6901. Resolve the
module and resource through indexes before reading a path. `recordId` selects
the root record or an indexed collection item; `pointer` is then evaluated
relative to that selected record. Never use a relative file path as a
cross-domain identity. Repository paths may still appear inside evidence
locators when the path is part of the pinned artifact description.

Module and resource IDs use the conservative lowercase path-like grammar.
Record IDs additionally permit `@` and `#` as stable domain delimiters, for
example `musd.token@mezo-mainnet` and a later `#deployment-key` suffix. These
characters are part of record identity; they do not alter module/resource
resolution.

When moving a file, keep its stable IDs, update its index mapping, repair
legacy path-based references, and run reference checks. A move is not a reason
to change the fact or silently refresh its verification timestamp.

## Structural and semantic validation

Validation has two deliberately separate layers:

1. JSON Schema checks local shape: required fields, data types, enums, and
   simple formats.
2. Semantic validators check relationships and evidence: uniqueness across
   files, logical-reference resolution, digests, bytecode identity, activation
   ranges, time comparisons, evidence sufficiency, domain invariants, and
   generated drift.

The dependency-free repository conformance check is:

```bash
node scripts/checks/validate-knowledge-structure.ts
```

It validates every v0.4 index it finds. Use `--module <module-id>` for one
module and `--require-all-v0.4` for the required repository-wide production
gate. The validator rejects unindexed maintained files and unresolved generated
references.

The conformance check does not replace domain validators. Run every check named
by the module index plus relevant repository validators. Passing validation
does not supply missing evidence, review, or a support promise.

The contract's five-domain fixture and negative cases run with:

```bash
node scripts/tests/test-knowledge-structure.ts
```

## Human maintenance workflows

### Read or use knowledge

1. Start at `knowledge/README.md` and choose the owning domain.
2. Read the module README for scope and current status.
3. Resolve resources through `index.json`; load only what the task needs.
4. Check status, support, review, freshness, scope, and limitations before use.
5. Follow the cited evidence for any protocol-sensitive decision.

Classify each requested claim as a recorded fact/explanation, historical fact,
current observation, or execution prerequisite. Resolve its owner and as-of
scope before collecting evidence. Reuse previously loaded, unchanged material;
"read" requirements mean obtain the relevant missing context, not repeatedly
load entire manuals. Maintenance verification applies when maintaining or
re-verifying inputs, not to every lookup.

Discover paths from catalog results or file listing, collection shapes from
indexes/schema, and exact methods, overloads and parameters from the matching
ABI or package reference. Never probe a guessed API or endpoint to discover
its existence. The offline [contributor retrieval manual](../../scripts/agents/CONTEXT.md)
describes bounded search, record/field selection, reference following, source
inspection, and supporting memory retrieval. Search results are discovery;
read the selected record and its applicable evidence before relying on it.

For an explanation, accepted indexed semantics and canonical interfaces are
the normal starting point. Before opening external documentation or raw
source, identify the unanswered claim, freshness question, or citation need.
Retrieve only the resource that can resolve it and stop when the evidence is
sufficient. An explanation does not inherit the live-state, simulation, or
compiler-reproduction requirements of executing the described operation.
Higher-priority tool or task requirements still apply.

Before an online request, establish the exact missing claim, which local owner
or evidence was insufficient and why, and the authoritative source that can
resolve it. An unavailable, incompatible, contradicted or out-of-scope local
record can justify targeted retrieval; an empty search alone cannot prove the
fact absent. Preserve partial coverage and failures. Prefer a bounded live read
for a missing state field to downloading unrelated sources. Check deployment,
network, historical coordinates and review conditions required by the claim;
do not renew all evidence merely because one current field is needed.

Select records or fields from large catalogs; if output truncates, narrow the
selection instead of repeating the full read. Use retained source artifacts
through their indexed identity before consulting caches or remote endpoints.
Distinguish a full response digest from a source-content digest according to
the owning module's procedure.

When the task requests an action log, record completed retrievals with the
requested resource/selection, the received result, and whether it resolved
the stated need. For a partial or failed result, name the remaining gap.
Keep one brief result per action; avoid unresolved `pending` placeholders.
Include command/tool identity and timestamps when measuring calls or latency;
do not infer either from the number of log lines. Logging is task-specific,
not required for every knowledge read.

### Add or update a fact

1. Identify the single owning module and stable record ID.
2. Inspect the module README, index, schema, semantic validator, and active
   task if the change is significant.
3. Locate and pin authoritative evidence. State exactly what it establishes.
4. Update evidence/source metadata before or with the canonical record.
5. Preserve explicit scope, limitations, lifecycle fields, and review gate.
6. Update the index only when a resource is added, removed, or moved.
7. Regenerate declared outputs; never patch generated facts by hand.
8. Run structural, semantic, drift, and relevant link checks.
9. Obtain the risk-appropriate human review before promotion or release.

### Store information for retrieval

Store authoritative information in its existing owner first. Memory may retain
a useful route, investigation context or rationale pointer; it must not become
a second copy of maintained facts. The [memory guide](../guides/MEMORY_MANAGEMENT.md#write-for-future-retrieval)
owns memory-specific capture and lifecycle instructions.

For a new or revised knowledge record:

1. Keep one coherent subject and stable identity. Use the owning schema's
   supported fields and the terminology a future caller will search for;
   include exact method/error names where they describe the evidenced fact.
   Do not add undocumented fields or maintain a separate handwritten synonym
   database. Discovery indexes are derived from canonical bytes.
2. Preserve network/version/coordinate, units, boundaries, uncertainty and
   applicability beside the claim. Separate a recorded observation from a
   general rule. A successful historical call does not establish current
   eligibility.
3. Link to precise source/evidence resources through logical references and
   applicable locators. Retain source captures under indexed artifacts when
   required to reproduce the claim; record the owning digest procedure and
   what those bytes establish. Do not leave sole proof in a temporary file or
   provider-only record.
4. Declare the resource and record IDs in the module index, including the
   actual `recordCollectionPointer` for a collection. Preserve incoming IDs
   across moves. Update related records/projections instead of leaving two
   competing current explanations.
5. Validate the owning module and exercise retrieval: search a realistic
   phrase/identifier without supplying the answer's path, read the returned
   record/field, and follow its evidence. Confirm the result preserves scope
   and limitations without loading the whole artifact.
6. Apply the normal review/promotion process. Retrieval success is not evidence
   acceptance. Keep unresolved gaps explicit and retire superseded records
   through their lifecycle rather than silently replacing history.

### Reverify stale knowledge

`reviewAfter` is a trigger to inspect the claim, not an expiry mutation. Repeat
the bounded verification against current authoritative evidence, append or
replace evidence according to the domain policy, update `verifiedAt` and the
next `reviewAfter`, then regenerate and review affected outputs. Preserve old
evidence when it is needed for activation history or discrepancy analysis.

### Handle a conflict

Do not average sources or edit evidence to match a preferred narrative. Set the
record to `conflicting` when the conflict affects its claim, preserve each
source and exact scope, record the issue under `review/`, and stop promotion if
the conflict is protocol-sensitive or changes a support promise.

### Deprecate or supersede

Do not delete a referenced stable ID as the first step. Mark the knowledge
`superseded` and/or its support `deprecated`, name the replacement with a
logical reference, define the compatibility or removal boundary, and update
derived consumers. Remove only after the repository's deprecation policy and
reference checks permit it.

### Move or migrate files

Migration is a controlled structural transformation, not manual re-research.
Preserve content, evidence coordinates, and stable IDs; update the module index
and path-based legacy references; run both old domain validators and the v0.4
check. Reprocess a record only if its evidence is stale, conflicting, missing,
or invalidated. Migrate one module per reviewed task so failures remain bounded.

## Generated human reference

Generate a human reference when canonical records are too fragmented or
technical for the intended reader. A generated page must identify its canonical
inputs and generator, be reproducible, and carry a drift check. Explanations
and how-to guides may be hand-authored when they teach concepts or procedures;
they link to facts rather than restating volatile values.

Use these documentation roles:

- README: orientation and routing;
- how-to: steps toward a concrete outcome;
- reference: exact consumer-facing facts, preferably generated;
- explanation: concepts, reasoning, and tradeoffs.

## Agent maintenance workflow

An agent working anywhere under `knowledge/` follows `knowledge/AGENTS.md`,
then loads `agents/skills/mdk-knowledge-maintenance/SKILL.md` and the relevant
domain skill. The agent uses the same workflows above, loads only indexed
resources needed for the task, and stops at evidence, architecture, scope,
dependency, or qualified-review gates. Agent output must not introduce facts
into instruction files.

## Module conformance checklist

Before declaring a module v0.4-conformant, verify:

- [ ] `README.md` identifies purpose, scope, owner, state, and normal checks.
- [ ] `index.json` conforms to the v0.4 schema and has stable module/resource
      IDs.
- [ ] Every maintained content resource is indexed once with the correct
      semantic role.
- [ ] Machine-readable content is in the appropriate role directory; no
      catch-all file-type directory or empty placeholder directory exists.
- [ ] Maintained JSON records use the common envelope; exemptions are explicit.
- [ ] Cross-domain references are logical; legacy physical references are
      accounted for during migration.
- [ ] Source catalogs say what each source establishes and evidence is bounded.
- [ ] Schema and semantic validator responsibilities do not overlap or leave a
      critical invariant unenforced.
- [ ] Generated outputs declare canonical inputs and pass drift checks.
- [ ] Candidate/gap/review material cannot be mistaken for canonical facts.
- [ ] Existing protocol-sensitive evidence, statuses, and review gates were not
      weakened by the structural migration.
- [ ] Common conformance, domain validators, links, and `git diff --check` pass.

## Cutover state

The module-by-module migration preserved semantic equivalence. The all-module
cutover completed and received architecture and qualified Level 3 acceptance
on 2026-08-21. This is migration history, not a new evidence observation.
`knowledge/index.json` now catalogs every maintained module. The required
production gate is:

```bash
node scripts/checks/validate-knowledge-structure.ts --require-all-v0.4
node scripts/checks/validate-knowledge-catalog.ts
node scripts/checks/validate-markdown-links.ts
```

No legacy module index or empty planned knowledge domain remains. Historical
migration notes stay under module `review/` directories and migration reports;
they are not active schemas or canonical facts.
