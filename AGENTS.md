# MDK contributor instructions

These instructions govern Mezo Developer Kit itself. External applications use
application-owned instructions from `agents/consumer/APP_AGENTS.template.md`
and selected consumer skills.

## Authority and ownership

The current human task owns outcome and scope. Root/nested `AGENTS.md` govern
work; `ARCHITECTURE.md` and accepted ADRs own package boundaries and dependency
direction. Registry and indexed `knowledge/` own Mezo facts; package docs and
exports own supported APIs; code/tests show implementation reality. Memory is
supporting context, never proof or authority. Resolve conflicts explicitly.

Keep one canonical owner for each fact/rule, including addresses, ABIs,
deployments, formulas, and generated data. Inspect existing code, preserve
unrelated human changes, and make the smallest complete change.

## Route the task once

1. Identify the outcome, affected owners, risk, and nearest nested `AGENTS.md`.
2. Reuse instructions and sources already in context; reread only missing,
   stale, or changed inputs. Search relevant sections rather than loading
   whole manuals, catalogs, logs, knowledge modules, or all skills.
3. For non-trivial contributor capability work, including trying workspace
   packages, use `agents/skills/mdk-capability-assessment/SKILL.md`. Inspect
   current public APIs and injected inputs; reassess after checkout changes.
   Alpha status and old conclusions do not prove an API unavailable. Skip
   capability assessment for unrelated edits.
4. For authored code, use `agents/skills/mdk-typescript-development/SKILL.md`
   and applicable sections of `docs/standards/coding.md`. For test strategy,
   fixtures, regressions, or test code, also use `mdk-testing` and
   `docs/standards/testing.md`. Add only the domain procedure needed by the task.
5. For knowledge changes, follow `knowledge/AGENTS.md`,
   `mdk-knowledge-maintenance`, the domain skill, and owning module index.
   `docs/standards/knowledge-management.md` owns v0.4 knowledge policy.
6. Retrieve only relevant memory and verify it against current owners.

Skills: `agents/skills/` owns contributor procedures; `agents/consumer/skills/`
owns consumer procedures; `agents/catalog.json` inventories both. Names match
directory basenames. Never edit discovery copies such as `.agents/skills/`
independently or ship contributor skills to apps. Use the skill-authoring guide
for unchanged materialization and maintenance.

## Implementation invariants

<<<<<<< HEAD
## 3. Repository Model

MDK has three coordinated systems:

```text
CODE        KNOWLEDGE        PROCESS
packages    docs             review
tooling     knowledge        reviews
templates   skills           standards
examples    memory           agent instructions
```

High-level domains:

- **chains / registry** — networks, deployments, canonical identifiers;
- **contracts** — verified metadata, ABIs, generated bindings, evidence;
- **core** — framework-independent execution infrastructure;
- **protocols** — Mezo protocol logic and workflows;
- **frameworks** — React and other adapters;
- **tooling** — CLI, Foundry, Hardhat, deployment, debugging;
- **templates / examples** — supported application starting points;
- **documentation / knowledge** — architecture, guides, verified Mezo knowledge;
- **agent infrastructure** — `AGENTS.md`, skills, memory adapters, evals.

`ARCHITECTURE.md` owns the current package graph, boundaries, dependency direction, and public architecture.

Do not create packages merely to fill a planned structure.

## 4. Context Routing

Before non-trivial work:

1. Understand the requested outcome.
2. Classify the task by domain and risk.
3. Identify the files/packages in scope.
4. Read the nearest applicable nested `AGENTS.md`.
5. For non-trivial contributor work that explains, uses, tests, or extends MDK
   capabilities, load `agents/skills/mdk-capability-assessment/SKILL.md` to map
   the requested operations to current package APIs, domain skills, canonical
   evidence, integration gaps, and verification. Trying workspace packages is
   contributor work, including during the alpha. Reassess relevant owners
   after checkout changes; neither the alpha label nor an old missing-capability
   conclusion substitutes for inspecting current exports and support.
   Load only relevant skill(s). For implementation work, load
   `agents/skills/mdk-typescript-development/SKILL.md` plus the applicable
   domain skill. Also load `agents/skills/mdk-testing/SKILL.md` when test
   behavior, strategy, fixtures, regressions, or review is in scope.
6. For authored-code work, follow `docs/standards/coding.md`; for test design
   and test code, also follow `docs/standards/testing.md`.
7. Retrieve only relevant knowledge and memory.
8. Inspect current code and tests.
9. Plan if complexity justifies it.
10. Implement the smallest complete change.
11. Verify at the appropriate risk level.

**Do not load unrelated domains by default.**

For a change under `knowledge/`, the nearest rules are
`knowledge/AGENTS.md`. Maintenance work also loads
`agents/skills/mdk-knowledge-maintenance/SKILL.md`, the relevant domain skill,
and the owning module's index; the human-neutral policy remains in
`docs/standards/knowledge-management.md`.

Example:

```text
frontend task
→ root AGENTS.md
→ nearest frontend/package AGENTS.md
→ frontend skill
→ frontend docs
→ relevant memory
→ relevant code/tests
```

## 5. Sources of Authority

```text
Current human task        → desired outcome and scope
Root AGENTS.md            → repository-wide operating rules
Nested AGENTS.md          → domain/package-local operating rules
ARCHITECTURE.md + ADRs    → intended architecture and accepted decisions
Registry + knowledge/     → verified Mezo/network/contract/protocol facts
Package docs              → package-owned behavior and interfaces
Code + tests              → current implementation reality
Memory                    → durable context; never canonical authority
```

Rules:

- Nested `AGENTS.md` may refine root rules within its scope, but must not violate repository-wide invariants.
- Memory never overrides canonical sources or current code without verification.
- Code contradicting architecture or canonical knowledge is a drift signal, not automatic authority.
- Resolve protocol-sensitive, architectural, or public-interface conflicts explicitly.
- When an intentional change modifies an authoritative rule, update that source in the same change.

## 6. Skills

Skills define **procedures for a class of work**. They do not own canonical protocol facts.

Canonical contributor skills live under:

```text
agents/skills/
```

Fresh checkouts contain canonical skills only. The repository-root `.agents/`
directory is ignored local setup output. Follow
[`docs/guides/CONTRIBUTOR_AGENT_SETUP.md`](docs/guides/CONTRIBUTOR_AGENT_SETUP.md)
to install or refresh contributor discovery before using an agent. If discovery
is unavailable during bootstrap, read the relevant canonical `SKILL.md` paths
directly; their absence from the runtime's skill list does not mean MDK lacks
the procedure. Author changes under `agents/skills/`, then regenerate local
copies. Do not commit `.agents/`.

Distributable consumer skills live under `agents/consumer/skills/`. All
maintained skills are indexed by `agents/catalog.json`; their directory
basename must match the frontmatter `name`.

Likely domains include architecture, memory, networks, contracts, protocols, SDK, frontend, Foundry, Hardhat, testing, documentation, troubleshooting, and release.

`docs/standards/testing.md` owns normative test design and code conventions.
The testing skill applies that standard; it does not replace package-owned
commands or domain-specific correctness rules.

Load only skills relevant to the task.

Each skill should define:

```text
Purpose
Use when / do not use when
Relevant repository areas
Required canonical sources
Procedure
Verification
Stop conditions
Common failure modes
```

`AGENTS.md` routes work to skills. Skills route work to the relevant code, docs, tools, and evidence.

Internal MDK skills under `agents/skills/` are not automatically shipped to
applications. Distributable consumer guidance belongs under
`agents/consumer/skills/` and is materialized as unchanged skill directories
under an application's supported discovery root, normally `.agents/skills/`.

## 7. Knowledge and Memory

Use this separation:

- `knowledge/` — canonical, evidence-backed Mezo facts reusable by code, docs, tooling, and agents.
- `docs/` — architecture, guides, reference, ADRs, troubleshooting, development process.
- `agents/skills/` — task-specific procedures.
- memory — durable supporting context and discoveries; never canonical authority.

Where applicable, canonical knowledge should record scope/network, version or deployment range, source/evidence, verification date, limitations, status, and owner.

The accepted universal module layout, lifecycle vocabulary, stable-reference
contract, and schema/validator boundary are defined in
`docs/standards/knowledge-management.md` and ADR-0006. Every maintained module
is discoverable through `knowledge/index.json` and conforms to v0.4. Resolve a
stable module/resource ID before treating a physical path as implementation
detail.

Preferred flow:

```text
authoritative source
→ verified canonical knowledge
→ SDK / docs / skills / examples
```

Do not maintain independent copies of the same protocol fact.

### Memory contract

Memory must be **provider-neutral**. MDK must work without an external memory service.

Plain-text repository memory is the baseline/reference provider. External
memory services may be supported through replaceable adapters.

- Classify the task before retrieving memory.
- Query only relevant domains.
- Treat memory as context, never proof.
- Verify important memory against current sources/code.
- Store durable, useful, verified context only.
- Do not store secrets, raw logs, speculation, or routine task history.
- Do not duplicate maintained documentation.
- Promote verified durable discoveries into knowledge, docs, ADRs, or code when appropriate.

Provider-specific APIs and retrieval procedures belong in the **memory skill**.

## 8. Repository-Wide Invariants

- Respect domain/package ownership.
- Follow dependency direction defined by `ARCHITECTURE.md`.
- Use the root-declared pnpm version for dependency management, workspace
  commands, and package scripts. Maintain one root `pnpm-lock.yaml`; do not
  create npm, Yarn, or package-local lockfiles.
- Implement authored product code, tests, and maintained repository automation
  in TypeScript by default.
- Follow `docs/standards/coding.md` for modular design, TypeScript, public API,
  errors, async work, formatting, suppressions, and required quality gates.
- Use Vitest as the default for authored TypeScript package tests and follow
  `docs/standards/testing.md`; document an owning-tool or established-stack
  exception instead of silently introducing another runner.
- Keep public boundaries deliberately typed and preserve type information
  across generated bindings, core/protocol APIs, adapters, and applications.
- Keep core and protocol logic framework-independent unless architecture explicitly says otherwise.
- Framework integrations consume public core/protocol APIs instead of reimplementing protocol behavior.
- Keep deterministic domain/financial calculations separate from RPC, wallets, UI, and global state.
- Prefer explicit dependencies/configuration over hidden globals.
- Generated outputs derive from canonical inputs and are not manually maintained.
- Contract addresses, ABIs, deployment metadata, and protocol facts require canonical ownership.
- Public APIs are typed, intentional, and changed deliberately.
=======
- Use TypeScript for packages, automation, tests, examples, templates, and
  generated applications; TSX for JSX. Solidity, JSON, schemas, Markdown, and
  evidence retain their formats. Tool-required language exceptions must be
  narrow and documented under ADR-0007 and the coding standard.
- Use the root-pinned pnpm version and one root `pnpm-lock.yaml`. Do not add
  npm, Yarn, or package-local lockfiles. Vitest is the default test runner;
  retain documented owning-tool/established-application exceptions.
- Preserve typed public boundaries, declared exports/dependencies, an acyclic
  graph, and framework-independent core/protocol logic. Do not deep-import
  packages. Create a package only for demonstrated responsibility and reuse.
- Keep deterministic calculations separate from RPC, wallets, UI, storage,
  clocks, and global state. Inject dependencies. Validate untrusted runtime
  data; types and casts are not validation. Keep financial values in integer
  base units with explicit precision, rounding, and bounds.
- Use `@mezo-dev-kit/evm` for supported EVM value validation/conversion; its
  package README owns the contract. Domain facts and errors keep their owners.
- Generate derived outputs from canonical inputs; never hand-maintain them.
  Do not hide failures, bypass validation, weaken checks, or add broad ignores.
>>>>>>> feat/next
- Every `docs/manifest` change bumps its semantic version, adds a dated entry
  to `docs/manifest-changelog.md`, and passes `node scripts/validate-manifest-version.ts`.

## Authorization and security

Existing user authorization persists. Continue independent supported work;
ask only for missing decisions required by the task. Stop the dependent work
for unverifiable protocol assumptions, conflicting authority without a safe
resolution, material scope expansion, unexpected public API/architecture
changes, new dependencies, destructive actions, or CI/CD/security-boundary
changes outside approved scope. Never bypass an invariant to proceed.

New dependencies require explicit approval and the review in
`CONTRIBUTING.md#dependencies`: necessity, compatibility, maintenance,
advisories, license, install scripts, transitives, provenance, and lockfile.
Follow `SECURITY.md`; never commit secrets or publish security findings through
issues, tasks, memory, or ordinary troubleshooting. Knowledge or a skill does
not authorize a transaction or establish a supported writer.

## Verification and completion

`CONTRIBUTING.md` owns task lifecycle and review. Architecture, migrations,
multi-package features, and protocol-sensitive work need an agreed task/issue
or PR. Planning records stay outside public source; humans own priorities and
material scope. Record unrelated discoveries as follow-ups.

Run checks that prove the changed behavior and crossed boundaries. Level 1
needs scoped docs/format checks; Level 2 needs targeted tests, type/lint/build,
and applicable integration checks; Level 3 additionally needs authoritative
evidence, failure/compatibility review, and qualified human review before
release. Shared configuration or multi-package changes require `pnpm check`.
Passing local checks does not publish a package or refresh live evidence.

Update affected canonical docs, examples, skills, and consumer guidance in the
same change. Report changed behavior, actual checks, docs/knowledge and memory
decisions, and unresolved risks. Do not mark work complete with required checks
outstanding. Missing guidance is a gap: create it only from verified task
information; otherwise continue only where correctness is unaffected.

Memory is provider-neutral and optional: retain only useful, verified pointers,
never secrets, raw logs, speculation, routine history, or maintained-doc copies.
`mdk-memory` owns procedures; `CONTRIBUTING.md#memory-decision` owns completion.
