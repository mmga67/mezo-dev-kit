# MDK skill authoring

This guide explains how to create, update, validate, distribute, deprecate, and
review MDK contributor and consumer skills manually or with a coding agent. It
applies the portable source and audience model accepted in
[`ADR-0008`](../decisions/0008-portable-agent-skill-distribution.md) and the
repository rules in [`AGENTS.md`](../../AGENTS.md). It does not establish a new
agent runtime, public CLI, vendor metadata format, or protocol authority.

Canonical skill sources live under `agents/`. Discovery roots such as
`.agents/skills/` are materialized copies, not independently maintained
instructions.

## Decide whether the procedure deserves a skill

```text
Will the guidance materially improve a recurring class of agent task?
├── no → keep it in the one-off task/review or do not store it
└── yes
    ├── Repository-wide invariant or authority/routing rule?
    │   └── root or nearest AGENTS.md
    ├── Normative human/project standard or architecture decision?
    │   └── docs/standard, ARCHITECTURE.md, or ADR
    ├── Package-specific command/API/behavior contract?
    │   └── owning package documentation and code/tests
    ├── Evidence-backed protocol/network/contract fact?
    │   └── canonical knowledge module, not a skill
    ├── Human end-to-end explanation or tutorial?
    │   └── docs/guides
    ├── Durable retrieval context but not authority?
    │   └── memory, usually as a pointer
    └── Reusable agent decision procedure with real stop conditions?
        └── a narrowly scoped skill
```

| Owner                     | Use for                                                           | Do not put there                                            |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `AGENTS.md`               | Always-applicable scope, authority, routing, and safety rules     | A long task-specific tutorial or protocol database          |
| Standard/ADR/architecture | Normative policy, durable decision, dependency direction          | Runtime-specific prompt phrasing                            |
| Package docs/code/tests   | Implemented commands, public behavior, executable invariants      | Unimplemented plans or copied external facts                |
| Knowledge                 | Evidence-backed facts, identities, formulas, bounded observations | Agent procedure or vendor instructions                      |
| Guide                     | Human explanation and end-to-end workflow                         | A second normative owner when a standard exists             |
| Task/review               | Scope, progress, verification, acceptance, pending decisions      | Permanent reusable procedure                                |
| Memory                    | Compact supporting context and canonical pointers                 | Proof, policy, or copied skill bodies                       |
| Skill                     | Reusable task routing, procedure, verification, stop conditions   | Canonical facts, broad policy, secrets, or an entire manual |

A skill should contain guidance that changes an agent's decisions or improves
reliability. Do not create one merely to restate generic coding ability,
duplicate a guide, or fill a planned catalog category.

## Choose the audience before writing

MDK has two non-interchangeable audiences:

| Concern                      | Contributor skill                                                                | Consumer skill                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Canonical root               | `agents/skills/<name>/`                                                          | `agents/consumer/skills/<name>/`                                                          |
| User                         | Maintainer changing the MDK repository                                           | Developer building an external application with a compatible MDK release                  |
| May reference                | Repository internals, tasks, standards, canonical knowledge, contributor tooling | Application instructions, installed public MDK APIs, version-compatible consumer guidance |
| Must not reference as usable | Unapproved external mutation or unsupported capability                           | MDK source-tree internals, contributor tasks/release procedures, unpublished packages     |
| Instruction authority        | Root/nested repository `AGENTS.md` and current task                              | Application-owned root/nested `AGENTS.md` and current task                                |
| Distribution                 | Maintainer discovery roots only                                                  | Selected consumer installation into an application discovery root                         |
| Default materialization      | Never ship to applications                                                       | Copy unchanged when the consumer audience is explicitly selected                          |

If one procedure tries to serve both audiences, split it. A consumer skill may
teach use of a released public API; it must not teach how to maintain the
registry, regenerate internal artifacts, approve a release, or inspect private
workspace internals.

## Portable skill structure

The machine contract is owned by
[`agents/catalog.json`](../../agents/catalog.json), its
[`catalog schema`](../../agents/schema/agent-skill-catalog.schema.json), and the
[`validator`](../../scripts/validate-agent-skills.ts). The human architecture
summary lives in [`agents/README.md`](../../agents/README.md).

A minimal skill is:

```text
agents/skills/mdk-example-task/
└── SKILL.md
```

Add `references/`, `scripts/`, or `assets/` only when they serve a concrete
workflow:

```text
mdk-example-task/
├── SKILL.md
├── references/    detailed material loaded only for a selected mode
├── scripts/       repeatable executable helpers
└── assets/        files copied or adapted into generated output
```

Do not add empty directories, scaffold placeholders, a redundant README,
changelog, or installation guide. Link every supporting reference from
`SKILL.md` at the point where it becomes relevant. Assets are outputs, not
instructions; scripts must use the repository's approved language/toolchain
and be tested as authored code.

### Identity and path invariants

- The name is globally unique, lowercase hyphenated text, begins with `mdk-`,
  and is at most 64 characters.
- The skill directory basename, frontmatter `name`, and catalog `name` are
  identical.
- A contributor catalog path is exactly `agents/skills/<name>`.
- A consumer catalog path is exactly `agents/consumer/skills/<name>`.
- A maintained skill appears exactly once in the catalog. Nested unindexed
  `SKILL.md` files are rejected.
- Skill source directories contain no symbolic links. Materialization copies a
  regular directory tree unchanged.

Treat the name as a discovery identity. Improving wording, adding a bounded
mode, or moving detail into a reference normally does not justify a rename.

### Frontmatter

Every `SKILL.md` begins with portable YAML frontmatter:

```yaml
---
name: mdk-example-task
description: Perform or review <specific capability>. Use for <clear trigger>; do not use for <important neighboring boundary>.
---
```

`name` and `description` are required. The current validator permits only the
portable top-level fields `name`, `description`, `license`, `compatibility`,
`metadata`, and `allowed-tools`. Add optional fields only for an approved,
portable need. Do not make vendor-only metadata necessary for the skill to
work, and do not add an unrecognized top-level field.

The description is visible during selection, before the body is loaded. Make
it discriminating: state what the skill does and the important use/do-not-use
boundary. Avoid a broad list of vaguely related topics that causes unrelated
requests to activate it.

### Instruction body

The validator requires a non-empty body. Repository review additionally
expects the relevant subset of the structure routed by the root
`AGENTS.md`:

- purpose;
- use when / do not use when;
- relevant repository or application areas;
- required canonical sources/context;
- procedure;
- verification;
- stop conditions; and
- common failure modes.

Use only sections that help the target task, but do not omit real safety,
authority, verification, or stop boundaries. Keep common instructions in
`SKILL.md`; move substantial mode-specific detail into focused references so an
agent does not load unrelated material.

Write for a capable agent. State non-obvious decisions and constraints, not
generic reminders. Preserve user authorization boundaries: a skill may explain
how to mutate an external system, but it must require the appropriate
authorization at execution time and must not treat skill invocation as that
authorization.

### Catalog entry

Add exactly one entry:

```json
{
  "name": "mdk-example-task",
  "audience": "contributor",
  "path": "agents/skills/mdk-example-task",
  "domains": ["example", "maintenance"]
}
```

For a consumer skill, use `"audience": "consumer"` and
`agents/consumer/skills/<name>`. Domains are unique lowercase-hyphenated routing
labels, not a second description or capability database. Preserve deliberate
catalog ordering and keep the catalog entry synchronized with the directory.

## Exercise the disposable examples

The
[`synthetic example repository`](./examples/skill-authoring/README.md) contains
one contributor skill and one consumer skill. Both are fictional and live
outside the canonical catalog.

Create separate disposable copies representing a manual path and a
coding-agent path:

```bash
manual_skill_root="$(mktemp -d)"
agent_skill_root="$(mktemp -d)"
cp -R docs/guides/examples/skill-authoring/repository/. "$manual_skill_root/"
cp -R docs/guides/examples/skill-authoring/repository/. "$agent_skill_root/"
cp -R agents/schema "$manual_skill_root/agents/schema"
cp -R agents/schema "$agent_skill_root/agents/schema"
```

Validate either disposable root through the same maintained library. This
command uses the repository's Node baseline and adds no dependency:

```bash
node --input-type=module --eval '
  import { validateAgentSkills } from "./scripts/lib/agent-skills.ts";
  const result = await validateAgentSkills(process.argv[1]);
  process.stdout.write(`validated ${result.catalog.skills.length} synthetic skills\n`);
' "$manual_skill_root"
```

Run the same command with `"$agent_skill_root"`, then compare the two artifact
trees:

```bash
diff -qr "$manual_skill_root" "$agent_skill_root"
```

Both paths must contain one cataloged contributor skill and one cataloged
consumer skill with matching names, paths, and audiences. The same validator,
review criteria, and materialization rules apply regardless of who authored
the files.

To rehearse a bounded update, change only the description or one procedural
instruction in both disposable copies, preserve the stable names, update no
catalog field unless routing actually changed, rerun validation, and review the
exact diff. Do not edit the documentation fixture in place.

Remove the disposable roots after the exercise:

```bash
rm -rf -- "$manual_skill_root" "$agent_skill_root"
```

## Create a skill manually

### 1. Define the recurring decision

Write down:

- representative requests that should activate the skill;
- neighboring requests that should not activate it;
- audience and canonical source directory;
- the non-obvious decisions the agent needs;
- relevant authorities and supporting resources;
- allowed side effects and authorization boundaries;
- verification and stop conditions; and
- why existing instructions, docs, or skills do not already own the procedure.

Use a task when the skill changes architecture, distribution, public behavior,
multiple domains, security, or a significant contributor workflow.

### 2. Inspect existing patterns

Read `agents/README.md`, the catalog/schema, the nearest instructions, and one
representative skill for the chosen audience. Search names, descriptions, and
domains before introducing a new identity. For consumer work, also read the
[`external-application guide`](./EXTERNAL_APPLICATIONS.md) and
[`APP_AGENTS.template.md`](../../agents/consumer/APP_AGENTS.template.md).

### 3. Choose the stable name and audience

Select a short `mdk-*` name that describes the capability rather than an
implementation detail, vendor, temporary task, or current file path. Decide
contributor versus consumer before creating the directory. If ownership or
audience is ambiguous, stop for human direction.

### 4. Create only the necessary files

Add `<source-root>/<name>/SKILL.md`. Add supporting resources only when their
concrete use is explained from the entrypoint. Replace or remove every
placeholder before review. Do not place a skill inside another skill.

An available skill-creation capability may help draft or scaffold the files,
but give it the MDK path, audience, portable-frontmatter restriction, canonical
sources, and prohibited content explicitly. Generic initializers may create
vendor UI metadata or empty resource directories; remove or separately review
anything that is not part of the approved portable MDK source.

### 5. Write discriminating frontmatter and concise instructions

Make the description selective. In the body, route to authorities rather than
copying them. Give a decision procedure, exact fragile commands only where
needed, proportional stop conditions, and meaningful verification. Avoid
turning one historical failure into a universal rule.

Never embed addresses, ABIs, endpoints, parameters, protocol formulas,
deployment state, release state, credentials, raw logs, or large copied docs.
Use stable knowledge or package/API references and tell the agent when to load
them.

### 6. Add the catalog entry in the same change

Set the exact name, audience-derived path, and narrow routing domains. Do not
use the catalog to repeat instructions. Validate complete coverage so the new
directory cannot remain hidden or duplicated.

### 7. Validate structure and behavior

Run:

```bash
node scripts/validate-agent-skills.ts
node scripts/test-agent-skills.test.ts
```

The validator proves portable frontmatter, stable identity, path containment,
catalog uniqueness/coverage, audience placement, and absence of symlinks. It
does not prove that instructions are useful, safe, correct, or appropriately
scoped.

Exercise realistic requests that should and should not trigger the skill.
Inspect whether the result loads only relevant context, follows canonical
owners, stops at missing authorization/evidence, runs valid commands, and
avoids prohibited side effects. Prefer behavioral outcomes over tests that
merely match headings or exact prose. For a complex or risky skill, use an
independent forward test when delegation is available and authorized.

### 8. Review distribution and documentation

For consumer skills, materialize the consumer audience into a new/empty target
and compare every file with its source. Confirm no contributor directory or
application-owned instruction file entered the output. Update the catalog,
agent/docs indexes, external-application guidance, and examples only where
discovery or supported workflow actually changed.

### 9. Record review and memory outcomes

Review usefulness, scope, authority, portability, commands, failure/stop
conditions, audience, catalog coverage, and materialized bytes. Usually no
memory update is needed because the durable procedure lives in the skill and
its authorities; retain only a useful pointer under the
[`memory contract`](./MEMORY_MANAGEMENT.md).

## Update an existing skill

1. Resolve it by catalog name and confirm the audience/source path.
2. Read the complete `SKILL.md` and only the supporting resources required for
   the requested mode.
3. Identify the demonstrated request, failure, stale reference, command, or
   authority change that justifies the update.
4. Preserve the name and audience unless an explicit compatibility migration
   is approved.
5. Update the smallest owning instruction or supporting resource. Do not add a
   general rule for a narrow one-off incident.
6. When an authoritative standard, package API, or knowledge owner changed,
   link the new owner and remove stale duplicated detail.
7. Run structural validation, relevant behavioral/eval tests, materialization
   checks for consumer changes, links, formatting, and whitespace review.
8. Inspect the materialized diff and confirm unchanged application or runtime
   instructions remain untouched.

If an existing optional `agents/openai.yaml` or other runtime adapter is in
scope, preserve unrelated policy/dependency fields and review it as a thin
compatibility layer. Do not make it the portable skill's canonical owner.

## Materialize consumer skills safely

The application owns its `AGENTS.md`; MDK owns only selected consumer skill
directories. Create the application instructions once, then synchronize skills
into a new or empty discovery directory.

Exercise the current source-alpha behavior in a disposable application:

```bash
application_root="$(mktemp -d)"
cp agents/consumer/APP_AGENTS.template.md "$application_root/AGENTS.md"
application_agents_digest="$(sha256sum "$application_root/AGENTS.md" | cut -d " " -f 1)"
node scripts/materialize-agent-skills.ts \
  --audience consumer \
  --output "$application_root/.agents/skills"
```

Verify selection, unchanged content, and application ownership:

```bash
test "$(sha256sum "$application_root/AGENTS.md" | cut -d " " -f 1)" = \
  "$application_agents_digest"
diff -qr \
  agents/consumer/skills/mdk-typescript-application \
  "$application_root/.agents/skills/mdk-typescript-application"
test ! -e "$application_root/.agents/skills/mdk-typescript-development"
```

The materializer rejects a non-empty output directory rather than merging or
overwriting it. Choose another new/empty target for a compatibility root such
as `.claude/skills`; do not rewrite skill bodies for that target. During the
GitHub source alpha this is repository-development proof, not a published
package or universal runtime compatibility claim.

Remove the disposable application after review:

```bash
rm -rf -- "$application_root"
```

## Deprecate or rename a skill

The current catalog has no alias, lifecycle, or version field. Do not invent
one in an entry.

For deprecation:

1. identify affected callers, discovery copies, consumer versions, and the
   replacement or reason for removal;
2. keep the stable name/catalog entry while compatibility requires discovery;
3. narrow the description so the deprecated skill does not attract new work,
   and put the replacement/migration boundary in the body;
4. validate and materialize both old and replacement skills when both must be
   available during a transition;
5. remove the directory and catalog entry together only at an explicitly
   reviewed compatibility/release boundary; and
6. update docs, templates, evals, and tracked discovery views in the same
   removal change.

A rename is a new discovery identity plus deprecation of the old identity, not
a silent directory move. It requires explicit human scope and consumer
compatibility review. Do not claim forwarding/alias behavior that the current
catalog and materializer do not implement.

## Request coding-agent work

Coding agents use the same portable sources, audience rules, validator,
materializer, behavioral checks, and human review gates as manual authors.

### New contributor skill

```text
Task: <approved task ID and recurring contributor outcome>
Operation: create one contributor skill
Canonical path/name: agents/skills/<mdk-name> / <mdk-name>
Audience and trigger/non-trigger examples: <exact requests>
Required authorities: root/nested AGENTS, standards, code/tests, knowledge
Allowed supporting resources: <none or exact references/scripts/assets>
Catalog domains: <narrow lowercase labels>
Use an available skill-creation capability if helpful, but keep MDK portable
  frontmatter and remove unapproved vendor metadata/placeholders
Prohibited: canonical facts, secrets, consumer guidance, external mutations,
  new dependencies, nested skills, discovery-copy edits
Required checks: catalog validator, agent-skill tests, realistic forward tests,
  links/format/diff as applicable
Stop when: an existing owner fits, audience/authority is unclear, scope expands,
  or authorization/dependency/security decisions are missing
Return: exact source/catalog/docs diff, behavioral evidence, risks, and memory
  decision; do not edit materialized copies as sources
```

### New consumer skill

```text
Task: <approved consumer capability and compatible MDK release/source scope>
Operation: create one consumer skill
Canonical path/name: agents/consumer/skills/<mdk-name> / <mdk-name>
Trigger/non-trigger examples: <application requests>
Public capability boundary: <installed public APIs and version-compatible docs>
Application authority: application-owned AGENTS.md and project conventions
Catalog domains: <narrow labels>
Prohibited: repository internals, contributor tasks/tools, unpublished APIs,
  copied protocol facts, application instruction overwrite, credentials
Required checks: validator/tests, realistic application cases, consumer-only
  materialization to a new/empty target, byte comparison, links/format/diff
Stop when: public capability is unavailable, version guidance conflicts,
  contributor procedure is required, or dependency/security scope expands
Leave application AGENTS.md untouched and return the exact source/catalog and
  materialized comparison evidence for human review.
```

### Bounded skill update

```text
Task: <task or demonstrated defect>
Operation: update <cataloged skill name> without renaming it
Affected request/failure: <reproduction or stale authority>
Allowed files: <exact SKILL.md/supporting/catalog/docs paths>
Required current sources: <authorities and implementation reality>
Preserve: audience, stable name, unrelated modes, user authorization boundaries
Prohibited: speculative rules, copied manuals/facts, vendor lock-in, unrelated
  refactor, source edits through a materialized discovery path
Verification: validator, targeted behavioral/negative cases, audience-specific
  materialization if applicable, links/format/diff
Stop when: identity/audience/architecture/public capability must change or the
  requested rule is unsupported by evidence/implementation.
```

### Independent skill review

```text
Review: <task and skill name>
Operation: read-only review; do not repair files
Audience and intended requests: <contributor|consumer plus cases>
Inspect: name/path/frontmatter/catalog agreement, description discrimination,
  progressive disclosure, canonical-source routing, command reality, user
  authorization, stop conditions, failure modes, secrets/privacy, audience
  leakage, supporting resources, behavioral tests, materialized bytes
Run: validator, relevant tests/evals, consumer materialization when applicable,
  links/format/diff
Reject for: overly broad activation, canonical facts/policy duplication, stale
  or unsafe commands, vendor requirement, hidden external mutation, nested or
  uncataloged skill, contributor/consumer leakage, rewritten discovery copy
Report findings first, exact commands/results, unresolved risks, and a review
recommendation; do not record human acceptance.
```

### Distribution check

```text
Task: verify consumer skill distribution only
Source: agents/catalog.json and agents/consumer/skills/
Target: <new/empty disposable application>/.agents/skills
Application-owned files: AGENTS.md and all project files; hash/check but do not
  modify them
Operation: validate catalog, materialize audience=consumer, list selected names,
  compare every target directory byte-for-byte with its cataloged source
Prohibited: contributor skills, merge into non-empty target, body rewrites,
  vendor compilation, package/release compatibility claims
Stop on: non-empty target, catalog failure, source/target drift, audience leak,
  symlink, or application-owned file change
Return exact selection, comparisons, unchanged application proof, and cleanup.
```

## Review agent-generated skills

Review the files and observed behavior, not only the agent's explanation:

- [ ] The recurring task merits a skill rather than another canonical owner or
      one-off task note.
- [ ] Contributor/consumer audience is explicit and the body never crosses that
      boundary.
- [ ] Directory basename, frontmatter name, catalog name/path, and global
      identity agree exactly.
- [ ] The description selects the intended requests and excludes important
      neighboring work without becoming a catchall.
- [ ] Instructions add useful non-obvious decisions and progressively load
      supporting detail instead of repeating generic capability or large docs.
- [ ] Canonical facts, standards, package behavior, and application rules remain
      with their owners and are referenced at the point of use.
- [ ] Commands exist, paths are current, expected side effects are explicit,
      and failures are neither swallowed nor relabeled as success.
- [ ] External writes, dependencies, credentials, security work, and other
      authority expansions require task-time approval; skill invocation is not
      treated as permission.
- [ ] Stop conditions are proportional and cover missing evidence/capability,
      conflicting authority, unsafe mutation, new dependencies, and material
      scope expansion where applicable.
- [ ] Supporting scripts/references/assets have a concrete caller, contain no
      placeholders or secrets, and introduce no nested `SKILL.md` or symlink.
- [ ] Realistic positive and negative requests demonstrate useful routing and
      safe behavior; tests do more than match wording/headings.
- [ ] The complete catalog validates exactly once per skill and no canonical
      directory is missing or unlisted.
- [ ] Consumer materialization selects only consumer entries, copies directories
      unchanged, rejects non-empty targets, and leaves application `AGENTS.md`
      untouched.
- [ ] Deprecation/rename work has an explicit compatibility boundary and does
      not claim unimplemented alias/version behavior.
- [ ] Links, formatting, tests/evals, materialized diffs, and `git diff --check`
      pass; unavailable checks are reported exactly.

## What not to do

- Do not let directory, frontmatter, and catalog names drift.
- Do not hide a nested or uncataloged skill inside another resource directory.
- Do not make a vendor discovery root, UI metadata file, MCP service, or remote
  store the canonical skill source.
- Do not embed copied addresses, ABIs, endpoints, parameters, formulas,
  deployment/release state, policy bodies, or large documentation extracts.
- Do not load every module, reference, skill, or memory record by default;
  route progressively to the minimum context needed.
- Do not edit `.agents/skills/`, `.claude/skills/`, or another materialized view
  and forget the canonical source.
- Do not store secrets, credentials, private endpoints, personal data, raw
  logs, or sensitive security findings in skill instructions, fixtures,
  scripts, references, or assets.
- Do not ship contributor repository-maintenance procedures to consumer
  applications or let consumer guidance depend on private workspace internals.
- Do not overwrite or synchronize an application's `AGENTS.md`; it is created
  once and then owned by the application.
- Do not bypass validation, weaken a stop condition, silently skip behavioral
  checks, or rewrite materialized output to make a review pass.
- Do not prescribe one rigid workflow where multiple safe approaches are
  valid, or turn one user's preference into a universal instruction.
- Do not create optional directories, metadata, helpers, abstractions, or
  compatibility wrappers without a demonstrated caller and review boundary.
- Do not infer package publication, universal runtime support, or public CLI
  availability from the internal validator/materializer.

## Command and review matrix

| Change                       | Structural proof                         | Behavioral/distribution proof                                   | Wider review                                  |
| ---------------------------- | ---------------------------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Body/description only        | `validate-agent-skills.ts`               | Trigger/non-trigger and stop-condition cases                    | Links, Prettier, diff                         |
| Supporting reference/asset   | Catalog validation and path review       | Progressive-load or generated-output use case                   | Secrets, duplication, links, diff             |
| Supporting TypeScript script | Catalog validation                       | Targeted tests plus typecheck/lint/runtime behavior             | Root code gates as required                   |
| New contributor skill        | Catalog validation and agent-skill tests | Realistic maintainer forward test                               | Root/nested instructions and authority review |
| New consumer skill           | Catalog validation and agent-skill tests | Consumer-only empty-target materialization and application case | Public API/version and external-app review    |
| Audience/path/catalog change | Full catalog/tests                       | Both audience materializations and byte comparison              | Compatibility, docs/templates/discovery views |
| Deprecation/rename/removal   | Full catalog/tests                       | Old/new discovery and materialization cases                     | Explicit compatibility/release acceptance     |

Common commands from the repository root:

```bash
node scripts/validate-agent-skills.ts
node scripts/test-agent-skills.test.ts
node scripts/materialize-agent-skills.ts \
  --audience contributor \
  --output <new-empty-contributor-root>
node scripts/materialize-agent-skills.ts \
  --audience consumer \
  --output <new-empty-consumer-root>
node scripts/validate-markdown-links.ts
pnpm exec prettier --check <changed-files>
git diff --check
```

Add the authored-code gates from the
[`coding standard`](../standards/coding.md) and tests from the
[`testing standard`](../standards/testing.md) when scripts, examples, or other
code change. Passing structure and materialization still does not prove that a
skill is useful, current, safe, or accepted; the human review remains the final
source-alpha gate.
