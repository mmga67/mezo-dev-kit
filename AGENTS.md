# AGENTS.md

# v.1

## 1. Purpose

This repository is **Mezo Developer Kit (MDK)**: a trustworthy, composable, agent-friendly development environment for building on Mezo.

MDK combines reusable code, verified Mezo knowledge, tooling, examples, and agent guidance. Early versions should prioritize **EVM development and a small number of high-value Mezo workflows**.

MDK is **TypeScript-first**. Build SDK/runtime packages, protocol modules,
framework adapters, CLI code, tests, templates, examples, and bootstrapped
applications in TypeScript by default. Use TSX for React source that contains
JSX. Solidity remains appropriate for EVM contracts; JSON, schemas, Markdown,
and evidence remain in their native formats. A tool-constrained exception must
be narrow and documented; plain JavaScript is not an alternative product-code
default. ADR-0007 and `ARCHITECTURE.md` own the detailed boundary.
`docs/standards/coding.md` owns the repository-wide authored-code standard.

This root `AGENTS.md` governs **development of MDK itself**. External applications use a separate consumer instruction layer defined under `agents/consumer/`: an application-owned `AGENTS.md` bootstrapped from `APP_AGENTS.template.md`, plus MDK-owned consumer skills that are copied/synchronized into the application.

## 2. Core Rules

- Correctness over convenience.
- Evidence over assumption for Mezo-specific behavior.
- Load only context relevant to the current task.
- Give every durable fact or rule one canonical owner.
- Respect domain ownership and dependency direction.
- Prefer small, explicit, composable interfaces.
- Inspect current code before changing it.
- Do not duplicate protocol facts, ABIs, addresses, or generated data.
- Keep agent and memory-provider integrations replaceable where practical.

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
- Every `docs/manifest` change bumps its semantic version, adds a dated entry
  to `docs/manifest-changelog.md`, and passes
  `node scripts/validate-manifest-version.ts`.
- Search for an existing pattern before adding an abstraction.
- Avoid unrelated refactors.
- Never silently swallow errors or bypass validation to make a task pass.

Detailed rules belong in architecture docs, domain docs, nested `AGENTS.md`, or skills.

## 9. Dependencies and Security

Before adding an external dependency:

1. Check whether existing dependencies/platform capabilities are sufficient.
2. Review maintenance status and relevant known security issues.
3. Obtain explicit human approval before adoption.

Never commit secrets, trust unverified executable/generated artifacts, weaken validation/security merely to unblock work, or change CI/CD/publishing/signing security outside explicit scope.

Detailed security policy belongs in `SECURITY.md`.

## 10. Task Lifecycle and Verification

Use:

```text
understand
→ classify
→ retrieve relevant context
→ inspect
→ task/plan when required
→ implement
→ verify
→ review
→ update knowledge
```

Record significant work in the maintainer-approved issue or pull request. Keep individual planning notes outside the public source snapshot.

Create/use a task for architectural changes, migrations, large or multi-package features, protocol-sensitive workflows, or other significant multi-step work. Routine isolated changes do not require one.

Rules:

- humans control task goals, priority, and material scope changes;
- agents may decompose work into child tasks only within approved scope;
- discovered out-of-scope work becomes a backlog task rather than a silent expansion;
- issues and pull requests track execution and progress, not canonical project knowledge;
- keep the agreed scope and verification results current in the review;
- do not mark work done until acceptance criteria and required verification are satisfied.

Keep unrelated human changes intact.

### Risk levels

**Level 1 — Low Risk:** docs, examples, minor DX, non-behavioral cleanup.
Verify changed scope plus relevant formatting/lint/docs checks.

**Level 2 — Functional:** SDK behavior, CLI/tooling, framework adapters, templates, runtime behavior.
Require targeted tests, applicable type/lint/build checks, and integration-style verification where boundaries are crossed.

**Level 3 — Protocol-Sensitive:** addresses, deployments, ABIs, financial calculations, transaction construction, write paths, approvals, registry changes, security guidance.
Require authoritative evidence, targeted tests, integration verification where practical, explicit failure/compatibility review, and qualified human review before release.

Use the narrowest verification that meaningfully proves the change. Exact commands belong in package docs or the relevant skill.

## 11. Knowledge Maintenance

After meaningful work, decide whether to update:

```text
canonical knowledge
ARCHITECTURE.md / ADRs
package docs
skills
examples/templates
memory
consumer agent guidance
```

Rules:

- one durable fact → one canonical owner;
- reference canonical data instead of copying it when practical;
- skills describe procedures, not protocol databases;
- memory does not replace maintained documentation;
- important architectural knowledge must not exist only in chat history.

## 12. Stop / Approval Conditions

Stop and request human direction when:

- required authoritative evidence is missing or conflicting;
- a protocol-sensitive assumption cannot be verified;
- scope materially expands;
- an unexpected public API or architecture change is required;
- a new external dependency is required;
- a destructive or irreversible operation is required;
- CI/CD or a security boundary must change;
- the only path forward bypasses an invariant;
- authoritative sources disagree and no safe resolution is clear.

When blocked:

```text
Found:
Options:
Recommended:
Reason:
```

## 13. Bootstrap Rule

Some referenced sources may not exist yet.

When required guidance is missing:

- do not invent project policy or Mezo facts;
- create the missing doc/skill when the task provides enough verified information;
- otherwise record the gap and continue only where correctness is unaffected;
- stop if the missing source is required for a protocol-sensitive, security-sensitive, architectural, or public-interface decision.

Expected companion sources:

```text
README.md
ARCHITECTURE.md
CONTRIBUTING.md
SECURITY.md
docs/INDEX.md
docs/decisions/
knowledge/
agents/skills/
agents/consumer/
docs/guides/external-applications.md
```

Missing guidance is a bootstrap task, not permission to guess.

## 14. Definition of Done

A task is complete when the relevant subset is true:

- requested behavior is implemented;
- domain/package boundaries remain valid;
- meaningful verification passes;
- protocol-sensitive claims have evidence;
- public behavior and canonical knowledge are synchronized;
- relevant docs/examples/skills/consumer guidance remain accurate;
- a memory update decision has been made;
- unresolved risks are reported.

Implementation alone is not sufficient when supported behavior, protocol knowledge, architecture, or developer workflow changes.

## 15. Completion Report

For non-trivial completed work:

```text
Changed:
- ...

Verified:
- ...

Knowledge / docs:
- ...

Memory:
- ...

Risks / follow-ups:
- ...
```

Do not report work that was not actually performed.
