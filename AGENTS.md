# MDK contributor instructions

These instructions govern Mezo Developer Kit itself. External applications use
application-owned instructions from `agents/consumer/APP_AGENTS.template.md`
and selected consumer skills.

## Authority and ownership

The current human task owns outcome and scope. The [manifest](docs/manifest)
owns the project baseline; `ARCHITECTURE.md` owns its detailed package boundaries
and dependency direction. Root/nested `AGENTS.md` govern scoped agent work.
Registry and indexed `knowledge/` own Mezo facts; package docs and
exports own supported APIs; code/tests show implementation reality. Memory is
supporting context, never proof or authority. Resolve conflicts explicitly.

Keep one canonical owner for each fact/rule, including addresses, ABIs,
deployments, formulas, and generated data. Inspect existing code, preserve
unrelated human changes, and make the smallest complete change.

## Branches and local records

Work on `feat/next`; `main` is the canonical GitHub-synchronized source. Follow
[the branch workflow](docs/guides/BRANCH_WORKFLOW.md). Both branches
share publishable history and ignore rules. Keep legacy references, individual
task/plan/review records, diagnostics and recovery archives in the documented
ignored roots. Never merge archived private history or force-add those paths.
Promote complete reviewed commits, preserving ancestry; do not reconstruct
filtered public snapshots. Inspect/preserve existing changes before switching
branches, and refresh generated local skills after canonical updates.

Ignored paths retain the same instruction and lifecycle requirements. Before
using local records, read applicable instructions by explicit filesystem path;
repository-wide searches may omit them. Follow
[task management](docs/guides/TASK_MANAGEMENT.md): use status folders,
`TASK-NNN-short-name.md`, the tracked template and current evidence. Use
`pnpm tasks:list` or a targeted `rg --hidden --no-ignore` search for local tasks;
run `pnpm check:tasks` after updating them. Never invent a parallel note format
because a directory is ignored or absent from search results.

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
   `docs/standards/knowledge-management.md` owns knowledge policy.
6. Use relevant shared/local memory as retrieval context; follow its pointers
   to current owners. Use `mdk-memory` for capture or lifecycle changes.

Follow the [documentation standard](docs/standards/documentation.md) for READMEs,
guides, and links. Keep human entry points independent of agent setup; current
policy links use descriptive baseline/standard sections. Historical ADRs retain
rationale and evidence identities, not competing current instructions.

Resolve before retrieving or calling. Discover paths with indexes or `rg --files`,
records with their declared IDs/collection pointers, and methods/parameters with
the matching ABI or package reference. Do not guess paths, JSON collections,
getters, overloads, commands, or endpoints. `pnpm context --help` exposes offline
catalog/search, record/field reads, retained-source inspection, ABI inspection,
and selected memory retrieval; [the retrieval manual](scripts/agents/CONTEXT.md)
owns commands and coverage. Filter before returning large output; narrow any
truncated result. Reuse unchanged context and stop once the requested claims
are supported within their scope.

Follow [knowledge retrieval](docs/standards/knowledge-management.md#read-or-use-knowledge).
Before an online request, identify the missing fact, why local evidence cannot
establish it, and the authoritative source/endpoint that can. Retrieve only that
gap, subject to the current task and higher-priority requirements. Ordinary
lookup does not run maintenance checks or refresh unrelated evidence. Current
transaction preparation still requires applicable live identity, mappings,
liveness, balances, allowances and exact-call simulation; conceptual explanations
and offline examples do not inherit those execution checks.

Skills: `agents/skills/` owns contributor procedures; `agents/consumer/skills/`
owns consumer procedures; `agents/catalog.json` inventories both. Names match
directory basenames. Never edit discovery copies such as `.agents/skills/`
independently or ship contributor skills to apps. Use
`docs/guides/SKILL_AUTHORING.md` for materialization and maintenance.

Fresh checkouts contain canonical skills only. The repository-root `.agents/`
directory is ignored local setup output. Follow
[`docs/guides/CONTRIBUTOR_AGENT_SETUP.md`](docs/guides/CONTRIBUTOR_AGENT_SETUP.md)
to install or refresh contributor discovery before using an agent. If discovery
is unavailable during bootstrap, read the relevant canonical `SKILL.md` paths
directly; their absence from the runtime's skill list does not mean MDK lacks
the procedure. Author changes under `agents/skills/`, then regenerate local
copies. Do not commit `.agents/`.

## Implementation invariants

- Use TypeScript for packages, automation, tests, examples, templates, and
  generated applications; TSX for JSX. Solidity, JSON, schemas, Markdown, and
  evidence retain their formats. Tool-required language exceptions must be
  narrow and documented under the coding standard.
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
- Every `docs/manifest` change bumps its semantic version, adds a dated entry
  to `docs/manifest-changelog.md`, and passes `node scripts/checks/validate-manifest-version.ts`.

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
