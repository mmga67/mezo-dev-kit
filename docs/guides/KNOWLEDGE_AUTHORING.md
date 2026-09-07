# MDK knowledge authoring

This guide turns the accepted knowledge-module v0.4 contract into a practical
workflow for human maintainers and coding agents. It applies the normative
[`knowledge-management standard`](../standards/knowledge-management.md) and
[`ADR-0006`](../decisions/0006-knowledge-module-architecture.md); it does not
replace either owner or define new protocol facts.

Use this guide for changes under `knowledge/`, including source catalogs,
evidence, canonical records, schemas, fixtures, generated projections, review
material, lifecycle, and physical migrations. Protocol-sensitive work remains
Level 3 even when the file edit is small.

For a mainnet oracle evidence refresh, use the concrete
[refresh instructions](oracle-evidence-refresh.md), including source checkout
setup, capture/import, generation, checks, and common failures. A successful
`pnpm check` alone does not refresh observations or renew their review windows.

## Choose the canonical owner first

Ask what the information is and why it must be retained:

```text
Is the information durable and useful to the repository?
├── no → do not store it
└── yes
    ├── Evidence-backed reusable Mezo fact or deterministic protocol rule?
    │   └── knowledge/, in the existing owning domain
    ├── Accepted architecture, governance, rationale, or public boundary?
    │   └── ARCHITECTURE.md, an ADR, or the owning standard
    ├── Implemented behavior or executable invariant?
    │   └── owning code plus tests
    ├── Human explanation or end-to-end procedure?
    │   └── docs/
    ├── Reusable agent procedure?
    │   └── agents/skills/
    ├── Scope, progress, review state, or pending decision?
    │   └── issue or pull-request review
    ├── Compact retrieval context that is not an authority?
    │   └── local/shared memory under the memory contract
    └── Unverified, duplicated, sensitive, or routine material?
        └── investigate locally, report securely, or do not store it
```

| Destination       | Owns                                                                 | Must not become                                                   |
| ----------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `knowledge/`      | Scoped evidence-backed facts, deterministic rules, stable identities | Procedures, task history, product plans, or unsupported narrative |
| Docs/ADR/standard | Explanation, decisions, policy, architecture, contributor procedure  | A second address, ABI, parameter, formula, or endpoint database   |
| Code/tests        | Implemented behavior and executable invariants                       | An unreviewed source of protocol facts                            |
| Task/review       | Approved scope, progress, decisions, verification, acceptance        | Permanent project or protocol knowledge                           |
| Skill             | Agent procedure and stop conditions                                  | Embedded volatile protocol data                                   |
| Memory            | Provider-neutral retrieval context and pointers                      | Proof, authorization, or a canonical fact store                   |
| Nowhere           | Noise, routine history, secrets, speculation, duplicates             | A tracked artifact added “just in case”                           |

Use the domain table in the
[`knowledge entry point`](../../knowledge/README.md) and the repository
[`architecture`](../../ARCHITECTURE.md) to select the owner. Do not create a
new module merely because no convenient directory exists. A new domain owner
is an architecture decision requiring explicit human-approved scope.

## Understand the v0.4 resource map

Every maintained module has a human `README.md` and machine `index.json`.
Create only role directories that contain maintained resources; empty
placeholder directories are invalid.

```text
authoritative source at an exact identity/coordinate
                     ↓
source catalog ──→ captured evidence
                     ↓
               canonical record
                 ↙         ↘
       deterministic fixture  generated projection
                     ↓               ↓
              semantic checks   drift check

review material evaluates the change; memory may point to the owner.
Neither is evidence or canonical protocol authority.
```

| Role               | Normal directory | Purpose                                                                          | Authority boundary                                                         |
| ------------------ | ---------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `canonical-record` | `records/`       | Maintained fact, identity, model, parameter, or rule                             | Canonical only for its declared owner, scope, lifecycle, and limitations   |
| `source-catalog`   | `sources/`       | Stable source identity, authority class, revision/coordinate, retrieval metadata | Describes provenance; the source remains the proof                         |
| `evidence`         | `evidence/`      | Bounded observation or reproduction tied to exact conditions                     | Proves only the observed scope; negative results are not universal absence |
| `fixture`          | `fixtures/`      | Deterministic input/output or boundary vector                                    | Tests a rule; it does not independently prove deployment behavior          |
| `schema`           | `schema/`        | JSON shape, types, required fields, and local structural constraints             | A schema pass does not prove semantic correctness, evidence, or support    |
| `artifact`         | `artifacts/`     | Raw immutable material such as a full ABI or pinned synthetic source             | Must retain provenance; physical placement is not identity                 |
| `generated`        | `generated/`     | Deterministic projection for humans or consumers                                 | Derived, never an independent owner, and not hand-edited                   |
| `review`           | `review/`        | Candidates, migration notes, gaps, equivalence, or review packets                | Deliberation and audit context, not accepted facts by location alone       |

The common envelope keeps three independent axes:

- `status` describes evidence/knowledge state;
- `supportStatus` describes MDK support disposition; and
- `reviewStatus` describes the review gate.

Use only the lifecycle vocabulary and transition rules from the
[`knowledge-management standard`](../standards/knowledge-management.md#common-record-envelope).
Never infer support from `verified`, catalog inclusion, a passing check, or a
successful observation.

Cross-resource identity uses a logical reference:

```json
{
  "moduleId": "<stable-module-id>",
  "resourceId": "<stable-resource-id>",
  "recordId": "<optional-stable-record-id>",
  "pointer": "<optional-rfc-6901-pointer>"
}
```

`moduleId` and `resourceId` are required. Use `recordId` for a member of an
indexed collection and `pointer` only for a subvalue whose identity cannot be
expressed by the record. Paths are resolver mappings in indexes, not durable
cross-domain identities.

## Discover the owner without loading everything

1. Read the root [`AGENTS.md`](../../AGENTS.md), the active task, and
   [`knowledge/AGENTS.md`](../../knowledge/AGENTS.md).
2. Open [`knowledge/index.json`](../../knowledge/index.json) and resolve the
   stable module ID through its `knowledge-module-catalog` resource.
3. Read only that module's `README.md` and `index.json`.
4. Resolve the resource ID, then the optional `recordId` and
   `recordCollectionPointer`; do not search by path and treat the first match as
   authority.
5. Inspect the selected record's scope, limitations, evidence state, support,
   review, `verifiedAt`, and `reviewAfter`.
6. Load the module schema, semantic validator, generator, review material, and
   relevant evidence only when the requested operation needs them.
7. For agent work, load
   [`mdk-knowledge-maintenance`](../../agents/skills/mdk-knowledge-maintenance/SKILL.md)
   plus the owning domain skill. Add the
   [`testing skill`](../../agents/skills/mdk-testing/SKILL.md) when fixtures,
   regressions, or test behavior change, and the
   [`TypeScript skill`](../../agents/skills/mdk-typescript-development/SKILL.md)
   when authored code or automation changes.

The module index's `checks` array owns the exact first commands. For example,
Networks and Contracts each declare structural, semantic, negative, and
generated-drift checks in their current indexes:

- [`Networks index`](../../knowledge/networks/index.json)
- [`Contracts index`](../../knowledge/contracts/index.json)

Those examples show command composition, not interchangeable evidence. A
network endpoint observation cannot prove contract provenance, and the latest
contract ABI cannot be applied to a historical proxy generation by default.

## Exercise the synthetic teaching module

The
[`synthetic widget example`](./examples/knowledge-authoring/README.md) is
deliberately outside canonical `knowledge/`. All identities and values are
fictional. It demonstrates resource separation and passing checks while
remaining unsupported and pending review.

From the repository root, create a disposable repository and copy the shared
v0.4 schemas plus the example module into it:

```bash
fixture_root="$(mktemp -d)"
mkdir -p "$fixture_root/knowledge/synthetic"
cp -R knowledge/schema "$fixture_root/knowledge/schema"
cp -R docs/guides/examples/knowledge-authoring/synthetic-widget-catalog \
  "$fixture_root/knowledge/synthetic/widget-catalog"
```

Run the three distinct checks:

```bash
node scripts/validate-knowledge-structure.ts \
  --repository-root "$fixture_root" \
  --module synthetic/widget-catalog
node scripts/validate-knowledge-authoring-example.ts \
  --module-root "$fixture_root/knowledge/synthetic/widget-catalog"
node scripts/generate-knowledge-authoring-example.ts \
  --module-root "$fixture_root/knowledge/synthetic/widget-catalog" \
  --check
```

The first command enforces universal v0.4 structure and common envelopes. The
second checks example-specific source digest, evidence, record, schema
declaration, and logical-reference relationships. The third proves the
generated projection matches its declared inputs. None proves that a source is
authoritative for Mezo or changes the fixture's lifecycle.

To rehearse an update, work only in the disposable directory:

1. Change the fictional source artifact's `Amber Widget` / `amber` values.
2. Calculate the artifact's new digest with
   `sha256sum "$fixture_root/knowledge/synthetic/widget-catalog/artifacts/widget-specification.json"`
   and update the source catalog. A real module also retains the authoritative
   source's exact revision, block, version, retrieval time, and method as
   applicable.
3. Capture the matching bounded observation in `evidence/observations.json`.
4. Update `records/widgets.json` from that evidence without changing stable IDs.
5. Leave `index.json` unchanged because no resource or record identity moved.
6. Run the semantic validator. If it passes, regenerate and drift-check:

   ```bash
   node scripts/generate-knowledge-authoring-example.ts \
     --module-root "$fixture_root/knowledge/synthetic/widget-catalog"
   node scripts/generate-knowledge-authoring-example.ts \
     --module-root "$fixture_root/knowledge/synthetic/widget-catalog" \
     --check
   ```

7. Rerun the structure check and inspect the exact diff against the original
   example. Confirm that source, evidence, record, and generated output changed
   for the same reason, while review and support did not silently advance.
8. Delete the disposable directory when finished:

   ```bash
   rm -rf -- "$fixture_root"
   ```

The test
[`test-knowledge-authoring-example.test.ts`](../../scripts/test-knowledge-authoring-example.test.ts)
also proves the clean fixture passes and that record drift or a stale source
digest fails closed. It uses temporary directories and never writes to
canonical knowledge.

## Update an existing fact manually

Use this sequence for additions, corrections, or bounded refreshes inside an
approved module.

### 1. Fix identity, scope, and risk

- Name the task, owning module/resource/record, desired outcome, affected
  consumers, and risk level.
- Preserve the stable IDs unless the identity itself was wrong. A display name,
  file path, deployment generation, timestamp, or status change does not by
  itself create a new identity.
- State the exact network, deployment/version/block/time range, units, and
  exclusions before gathering evidence.
- Treat addresses, implementations, ABIs, financial formulas, transaction
  construction, registry changes, and security guidance as Level 3.

Stop if ownership is ambiguous, scope expands across domains, evidence
requirements are unknown, or an architecture/public API/security decision is
needed.

### 2. Select and pin sources

- Prefer the authority and provenance class required by the owning domain.
- Record immutable source identity where available: repository plus commit and
  path, signed release plus digest, deployment plus block, transaction/log
  coordinate, or exact document version.
- Keep mutable URLs as locators, not as the only identity. Record retrieval
  time and limitations.
- Use independently scoped sources when one source cannot establish identity,
  behavior, and deployment state.

An explorer label, docs page, package README, memory note, search result, or
agent summary may be a lead. It is not automatically sufficient evidence.

### 3. Capture source metadata and evidence before projection

Update or add the source catalog entry and immutable artifact first. Capture
the observation/reproduction with its method, coordinate, expected control,
actual result, and limitations. Preserve raw evidence faithfully; do not edit
an observation so an older record continues to look correct.

For a negative result, record exactly what was searched or called, over which
bounded range, with which provider/source and control. Classify the result as
absence only inside that proven coverage. Timeout, unavailable provider,
truncation, unsupported method, incomplete range, or failed control means
unknown or failed evidence, not absence.

### 4. Update the canonical record

- Project only claims established by the captured evidence.
- Preserve units, precision, validity ranges, ordering, and limitations.
- Reference sources/evidence by stable logical identity.
- Set `verifiedAt` to the actual completed verification time, never edit time.
- Set `reviewAfter` from the domain's volatility/review policy, not an arbitrary
  freshness extension.
- Change `status`, `supportStatus`, and `reviewStatus` independently and explain
  every promotion in the review packet.

For Level 3 work, a technically verified record normally remains `proposed`
and `pending-qualified-review` until a qualified human accepts its evidence,
compatibility, failure behavior, and scope.

### 5. Update the module index only when its mapping changed

Add, remove, or edit a resource entry when a maintained file, role, resource
ID, record collection, pointer, or generated dependency changed. Keep
`recordIds` in the same order as the selected collection and declare
`recordCollectionPointer` for collections. Do not churn the index for an
in-place value update whose identities and mappings are unchanged.

Every maintained module file other than `README.md`, `index.json`, and an
applicable `AGENTS.md` must be indexed exactly once under the correct role.

### 6. Regenerate from canonical inputs

Run the owning generator without `--check`, inspect the generated diff, then
run its drift command. Never patch the derived page to conceal canonical-input
or generator drift. If a desired projection has no declared generator, decide
in the task whether it is truly maintained manually or whether generator work
is required; do not label a hand-maintained file `generated` casually.

### 7. Validate from narrow to wide

Run the module index's declared commands first. Then run checks for every
referenced owner and consumer affected by the change. Widen to root catalog,
all-v0.4, workflow, link, formatting, type/lint/test, and whitespace checks
when the corresponding boundary changed. The [command selection
table](#select-the-right-commands) below gives the order.

### 8. Review the exact lifecycle and consumer diff

The reviewer inspects source identity, evidence coordinate, record projection,
stable IDs, support/review changes, generated output, validator coverage,
downstream references, compatibility, and deletions. Passing checks do not
replace source-authority or qualified review.

### 9. Make the memory decision

Usually no memory update is needed because the durable result lives in
knowledge and its review packet. Retain at most a compact retrieval pointer
when it will materially prevent repeated investigation. Follow the
[`memory-management guide`](./MEMORY_MANAGEMENT.md); never copy the canonical
fact into memory or use memory to promote lifecycle.

## Create a new module manually

Do not begin with directories. Begin with an approved owner and consumer.

1. **Obtain human-approved scope.** Create or activate a task describing the
   domain responsibility, facts/rules owned, non-goals, consumers, risk,
   evidence classes, lifecycle gate, and why no existing module owns it. Follow
   the contributor review workflow in `CONTRIBUTING.md`.
2. **Resolve architecture.** Update architecture or add/accept an ADR when
   domain ownership, dependency direction, public behavior, or governance
   changes. A proposed task alone does not establish a canonical owner.
3. **Choose a stable module ID.** Use a semantic ID that survives path changes.
   Record it in the new `index.json`, then add it to the root catalog only when
   the owner and entry point are approved.
4. **Create human and machine entry points.** Add `README.md` and `index.json`
   at the same module root. The README explains owned scope, current lifecycle,
   human discovery, limitations, and exact maintenance commands without
   copying volatile facts.
5. **Create only occupied role directories.** Add `records/`, `sources/`,
   `evidence/`, `fixtures/`, `schema/`, `artifacts/`, `generated/`, or `review/`
   only for real maintained resources. Never add `.gitkeep` placeholders.
6. **Define stable resources and records.** Index each file once by role. For a
   collection, declare ordered `recordIds` and its JSON pointer. Define logical
   cross-domain references instead of copied values or paths.
7. **Separate structural and semantic validation.** Compose the common v0.4
   envelope in local JSON Schemas for shape. Add a domain validator for
   cross-record identity, units, ordering, evidence, lifecycle, or other rules
   JSON Schema cannot establish. Add negative cases that prove malformed,
   ambiguous, missing, conflicting, or out-of-scope inputs fail.
8. **Add deterministic fixtures where calculations or state transitions need
   proof.** Name meaningful boundaries and keep them synthetic. A fixture does
   not replace deployed evidence.
9. **Add generation only for a real consumer.** Declare every canonical input
   in `generatedFrom`, make output deterministic, identify the generator in the
   output, and provide a drift check. Generated output is not a second owner.
10. **Capture sources/evidence and add proposed records.** Start conservative:
    `supportStatus: none` or `proposed` and the appropriate pending review.
    Do not bootstrap a module as supported merely because its initial records
    validate.
11. **Register and verify the boundary.** Update the root catalog, run the new
    module's checks, catalog discovery, all-v0.4 structure, logical-reference
    consumers, workflows, generators, docs, and applicable code gates.
12. **Obtain the required review.** New ownership requires human architecture
    acceptance. Level 3 facts additionally require qualified evidence and
    compatibility review before support or accepted lifecycle is recorded.

Stop and request direction if an existing owner could own the data, the new
module has no real consumer, evidence is missing/conflicting, a new dependency
is required, or the only implementation duplicates another module.

## Reverify, conflict, supersede, deprecate, or migrate

### Reverify stale knowledge

1. Resolve the same stable record and its original evidence method.
2. Confirm whether `reviewAfter`, an upgrade, a source revision, a provider
   change, or a consumer requirement triggered the refresh.
3. Repeat the bounded verification with current controls and retain new source
   and evidence identity.
4. Compare old/new scope and results; preserve historical evidence needed for
   audit or validity ranges.
5. Update the canonical projection and freshness only after verification
   completes, then regenerate, validate, and review.

Do not change only `verifiedAt`/`reviewAfter`, rerun against an unpinned latest
state, or describe an unavailable probe as successfully reverified.

### Preserve conflicts

When credible sources or observations disagree:

1. retain each source and observation without averaging or rewriting them;
2. narrow the conflict to the exact identity, coordinate, field, and scope;
3. set affected knowledge to `conflicting` where the standard/domain requires;
4. add review material describing competing claims, controls, and missing
   resolution evidence;
5. identify downstream consumers that must fail closed or remain unsupported;
6. stop Level 3 promotion and request qualified resolution.

### Record negative evidence

State the bounded search space, completeness proof, expected control, actual
outcome, provider/source, time/block range, and failure classification. “No
matching result in a complete bounded scan” may support scoped absence. “The
RPC timed out,” “the explorer omitted data,” or “the indexer is behind” supports
unknown/incomplete, not absence.

### Supersede or deprecate

- Use `superseded` when a newer record replaces the old fact/identity version
  while the old stable ID remains necessary for history or references.
- Use `historical` for supported historical resolution where the domain
  contract defines it, and `deprecated` when MDK discourages future use and
  names a replacement/migration boundary.
- Add the replacement logical reference, validity/removal conditions, and
  downstream migration notes before deleting anything.
- Regenerate and verify consumers at old and new coordinates when compatibility
  depends on history.

Do not delete a referenced ID first or make the latest record silently answer
historical queries. Follow the exact lifecycle definitions in the standard and
owning module.

### Move physical files

A path migration is not re-research:

1. preserve module/resource/record IDs, envelope lifecycle, evidence, and
   provenance;
2. move the file and update the owning index path;
3. update generated inputs or local links that are physical by design;
4. keep cross-domain references logical;
5. run old/new inventory and semantic-equivalence checks plus catalog,
   structure, generation, links, and consumer checks;
6. document any deliberate identity or semantic change separately.

If the move changes the canonical owner, public behavior, or identity, stop
and treat it as an architecture/migration decision rather than a path cleanup.

## Request coding-agent work

Humans and agents follow the same artifact order, evidence standard, lifecycle,
checks, and review gates. An agent may accelerate discovery and editing; it
cannot make a source authoritative, approve a new owner, or perform qualified
acceptance.

### Read-only discovery template

```text
Task: <task ID or read-only question>
Operation: discover and report only; do not edit files or mutate external state
Candidate domain: <narrow domain or unknown>
Start at: knowledge/index.json
Required context: root AGENTS.md, knowledge/AGENTS.md,
  mdk-knowledge-maintenance, then only the candidate domain skill/index
Question and exact scope: <identity/network/version/block/time/units>
Evidence requirement: <authority/provenance class and pinned coordinate>
Excluded by default: unrelated modules, memory bodies, unbounded web/RPC scans
Stop when: owner is ambiguous, evidence is missing/conflicting, scope expands,
  or security-sensitive material appears
Output: resolved module/resource/record IDs, lifecycle, evidence pointers,
  limitations, freshness, gaps, and commands that would verify a change
```

### Existing-resource maintenance template

```text
Task: <approved task ID and outcome>
Operation: add | correct | reverify | supersede | deprecate | migrate-path
Owner: <moduleId>:<resourceId>[:<recordId>]
Allowed files: <exact module/review/docs paths>
Exact scope: <network/deployment/version/block/time/units/exclusions>
Required skills: mdk-knowledge-maintenance + <domain skill>
Required sources/evidence: <authority class, immutable identities, controls>
Lifecycle ceiling: <maximum status/support/review allowed before human review>
Generated consumers: <resource IDs and generator commands>
Required checks: <module index checks, affected owners, root checks>
Prohibited: copied facts, path-based IDs, edited evidence, manual generated
  output, fabricated freshness, implicit support promotion, unrelated changes
Stop when: evidence conflicts/is insufficient, owner or public boundary changes,
  new dependency/credential/external write is needed, or Level 3 acceptance is
  requested without qualified review
Report: exact source/evidence/record/index/generated diff, checks, lifecycle,
  compatibility, unresolved risks, and memory decision
```

### New-module scaffolding template

```text
Task: <human-approved architecture/task ID>
Operation: scaffold and populate a proposed v0.4 module
Approved domain owner and module ID: <owner> / <moduleId>
Approved responsibility/non-goals/consumers: <exact boundaries>
Required skills: mdk-knowledge-maintenance + owning domain + TypeScript/testing
  skills when validators, generators, or fixtures are authored
Required artifacts: README, index, only occupied role directories, schemas,
  semantic validator/negative cases, sources/evidence, proposed records,
  generator/drift check if consumed, review packet, root catalog entry
Lifecycle ceiling: none/proposed + pending architecture/qualified review
Required checks: module checks, catalog, all-v0.4 structure, workflows,
  references, generation, docs, code gates as applicable
Stop when: an existing owner fits, ownership is not accepted, there is no real
  consumer, evidence conflicts/is missing, or public/security/dependency scope
  expands
Do not mark accepted or supported; return the complete diff for human review.
```

### Evidence-refresh template

```text
Task: <task ID>
Operation: refresh bounded evidence without changing support automatically
Owner/reference: <moduleId>:<resourceId>[:<recordId>]
Trigger: reviewAfter | upgrade | source revision | reproduced drift | other
Original method/control: <paths and exact procedure>
New coordinate: <network/provider/block/time/commit/version>
Authority and negative-evidence rules: <domain requirements>
Allowed external access/mutations: <read-only and exact scope, or none>
Required outputs: new source/evidence identity, old/new comparison, canonical
  projection if proven, freshness, limitations, generated diff, checks
Stop when: controls fail, coverage is incomplete, result conflicts, credentials
  or writes are needed, or the observation cannot prove the requested claim
Leave lifecycle pending for the required human/qualified review.
```

### Independent review template

```text
Review task: <task/review packet>
Operation: read-only review; do not repair the change
Claimed scope/risk: <scope and level>
Canonical owner: <module/resource/record IDs>
Required skills: mdk-knowledge-maintenance + representative owning/consumer
  domain skills
Inspect independently: source authority and immutable identity; evidence method,
  coordinate, controls and negative classification; record projection; stable
  IDs/references; lifecycle/support/review delta; generated inputs/output;
  schema vs semantic validator coverage; downstream compatibility; exact diff
Run: module-declared checks, affected-owner checks, root boundary checks
Reject/stop for: copied or mutable-only evidence, fabricated freshness,
  unresolved conflict, edited generated output, swallowed failure, path identity,
  implicit support promotion, out-of-scope change, or missing qualified review
Output: findings first, commands/results, unresolved risks, and recommendation;
  do not record acceptance on behalf of the human maintainer.
```

## Review agent-produced changes

The human reviewer checks the repository artifacts, not only the agent's
summary:

- [ ] The root catalog and module index resolve the intended stable owner.
- [ ] Source identity is authoritative for the claim and pinned at the required
      commit/version/block/time/deployment coordinate.
- [ ] Evidence records the exact method, control, result, bounded scope, and
      limitations; failures are not relabeled as absence.
- [ ] Canonical fields are supported by evidence with correct units, ranges,
      ordering, and validity coordinates.
- [ ] `status`, `supportStatus`, `reviewStatus`, `verifiedAt`, and `reviewAfter`
      changed only for a documented reason.
- [ ] Resource and record IDs remain stable; logical references resolve; paths
      did not become cross-domain identities.
- [ ] Every new/moved maintained file is indexed once under the correct role;
      no empty role directory was added.
- [ ] Schema changes cover structural shape, while semantic validators cover
      cross-resource/evidence/domain rules and meaningful negative cases.
- [ ] Generated output declares canonical inputs, was regenerated rather than
      hand-edited, and passes drift checks.
- [ ] The exact diff contains no unrelated fact, support, public API,
      dependency, credential, security, or workflow expansion.
- [ ] Affected consumers, historical resolution, and compatibility/failure
      behavior were reviewed.
- [ ] Module, affected-owner, repository-wide, docs, formatting, and code checks
      required by the risk actually ran; skipped/unavailable checks are named.
- [ ] Level 3 material remains proposed until qualified human acceptance is
      recorded in the owning task/review artifacts.
- [ ] The memory outcome is no update or a concise verified pointer, never a
      duplicate authority.

## Select the right commands

Read exact commands from each affected module's `index.json`; do not copy this
table as a substitute for the current index.

| Change                              | First checks                               | Then                                                           | Widen when                                         |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------- |
| In-place record/evidence update     | All commands declared by the owning module | Referenced owner/consumer semantic and generation checks       | Cross-domain claims, support, or docs changed      |
| Schema or semantic-validator change | Module structural/semantic/negative tests  | Typecheck, lint, targeted tests for authored TypeScript        | Shared tooling or multiple modules are affected    |
| Generated projection/input change   | Owning generator plus `--check`            | Module semantics and docs/consumer checks                      | Projection is cross-domain or public-facing        |
| New/moved resource                  | Module structure and semantics             | Catalog, logical references, generation, links                 | Root catalog or consumer paths changed             |
| New module / v0.4 migration         | New module checks                          | Catalog, all-v0.4 structure, workflows, references, generators | Always review architecture and all affected owners |
| Docs/skill-only procedure change    | Relevant examples/evals                    | Skill validation, links, Prettier, whitespace                  | Commands or authored code changed                  |

Common repository commands are:

```bash
node scripts/validate-knowledge-structure.ts --module <module-id>
node scripts/validate-knowledge-structure.ts --require-all-v0.4
node scripts/validate-knowledge-catalog.ts
node scripts/validate-knowledge-workflows.ts
node scripts/validate-agent-skills.ts
node scripts/validate-markdown-links.ts
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
git diff --check
```

Run only the applicable code gates for a documentation-only change, but run
the complete root `pnpm check` when shared automation, examples, toolchain, or
repository-wide behavior changes. Network and contract changes also use their
domain-declared provenance, negative, semantic, and generator checks. Live or
credentialed checks require explicit approved scope and must report the exact
provider/coordinate; never silently replace them with a different path.

## What not to do

- Do not copy addresses, ABIs, endpoints, parameters, formulas, deployment
  history, or protocol facts into docs, skills, examples, applications, or a
  second knowledge module.
- Do not cite a mutable “latest” page, explorer label, unpinned repository,
  package output, agent answer, or memory note as complete provenance.
- Do not rewrite captured evidence to match a desired canonical projection.
- Do not edit generated output instead of its declared inputs and generator.
- Do not update freshness timestamps without performing and recording the
  verification.
- Do not use paths, filenames, display names, addresses, or current versions as
  replacements for stable logical identities.
- Do not let two domains own the same fact “for convenience.” Reference the
  owner and keep consumer-specific semantics in the consumer.
- Do not treat memory as proof, review, authorization, or a support signal.
- Do not generalize one web/RPC/explorer observation into uptime, compatibility,
  global absence, historical truth, or protocol completion.
- Do not swallow, skip, weaken, or reroute validator failures to make a change
  pass. Report the failure and preserve the unsupported/conflicting state.
- Do not infer support from a schema pass, generated page, successful call,
  directory, catalog entry, accepted architecture, or agent confidence.
- Do not delete referenced or historical identities before a reviewed
  supersession/deprecation and downstream migration.
- Do not create empty modules, role directories, packages, validators, or
  generators merely to fill a planned structure.
- Do not run value-bearing writes, expose credentials, or publish security
  findings as knowledge-maintenance shortcuts. Follow
  [`SECURITY.md`](../../SECURITY.md).

## Final review matrix

| Concern              | Required artifact/evidence                           | Passing condition                                               | Stop condition                                           |
| -------------------- | ---------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Ownership            | Root catalog, module README/index, architecture/task | Exactly one approved owner and real scope                       | Duplicate/ambiguous owner or unapproved new domain       |
| Source               | Source catalog and immutable identity                | Authority and coordinate fit the exact claim                    | Mutable-only, missing, or insufficient source            |
| Evidence             | Bounded observation/reproduction and controls        | Method proves only the declared scope                           | Conflict, failed control, incomplete/unknown coverage    |
| Record               | Canonical projection and common envelope             | Fields, units, validity, limitations, freshness follow evidence | Unsupported inference or fabricated lifecycle            |
| Identity             | Module/resource/record IDs and logical refs          | Stable IDs resolve; physical paths remain mappings              | Path-based identity or broken/duplicate references       |
| Structure            | README, index, occupied roles, schemas               | All maintained files indexed once; v0.4 structure passes        | Empty roles, unindexed files, schema failure             |
| Semantics            | Domain validator and negative cases                  | Cross-resource/domain invariants and failures are enforced      | Schema-only proof for semantic/evidence claims           |
| Generation           | Declared inputs, generator, output, drift check      | Deterministic regeneration matches reviewed inputs              | Hand edit, undeclared input, or drift                    |
| Support/review       | Task and review packet                               | Independent axes and required human gate are explicit           | Implicit promotion or missing qualified review           |
| Compatibility        | Consumer/history checks                              | Old/new coordinates and affected consumers behave deliberately  | Latest-only substitution or silent breaking change       |
| Documentation/skills | Links, examples, agent routing                       | Procedure points to canonical owners and current commands       | Copied facts or conflicting procedure                    |
| Memory/security      | Memory decision and security review                  | No update or safe pointer; no sensitive material                | Memory-as-proof, credentials, private data, unsafe write |

A change is ready for acceptance only when every applicable row passes and all
required verification is recorded. For Level 3 work, technical completion is
still proposed work until the qualified human review gate is explicitly
accepted.
