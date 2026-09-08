# Contributing to Mezo Developer Kit

Thank you for helping build MDK. The project is documentation-first and still
in bootstrap: repository rules, evidence-backed knowledge, and supported
vertical slices are established before broad implementation.

MDK is currently an experimental GitHub source alpha. There is no npm or other
package-registry release. Clone the repository, use its root-pinned pnpm
workflow, and treat private workspace package names and versions as
implementation metadata rather than install or compatibility promises. Source
is licensed under the root [`MIT License`](./LICENSE).

## Start with the Authority Chain

Before non-trivial work, read:

1. [`AGENTS.md`](./AGENTS.md) for repository-wide operating rules;
2. applicable sections of [`ARCHITECTURE.md`](./ARCHITECTURE.md) for affected
   boundaries and dependency direction;
3. the nearest nested `AGENTS.md`, package docs, and relevant skill;
4. only the knowledge, task, ADR, code, and tests relevant to the change.

[`docs/INDEX.md`](./docs/INDEX.md) routes maintained documentation, and
[`knowledge/README.md`](./knowledge/README.md) defines the evidence and
authority contract. For authored-code work, follow the
[`coding standard`](./docs/standards/coding.md) and load the
`mdk-typescript-development` contributor skill. For knowledge maintenance,
follow the accepted
[`knowledge-management standard`](./docs/standards/knowledge-management.md)
and the practical
[`knowledge-authoring guide`](./docs/guides/KNOWLEDGE_AUTHORING.md), then inspect
the current module's README/index and declared checks. For test strategy and test code,
follow the [`testing standard`](./docs/standards/testing.md) and load the
`mdk-testing` contributor skill.

For a clean setup, contributor-skill materialization, package-filter commands,
and a first-change walkthrough, use the
[`SDK development quickstart`](./docs/guides/SDK_DEVELOPMENT.md).
Before agent-assisted work in a fresh clone, follow the
[`contributor agent setup guide`](./docs/guides/CONTRIBUTOR_AGENT_SETUP.md).
The root `.agents/` directory is ignored local output; maintain skill sources
under `agents/skills/` and regenerate your discovery copies after updates.
For the owner decision, private manifest/export boundary, generated inputs,
manual and coding-agent workflows, and clean built-consumer proof, use the
[`workspace-module authoring guide`](./docs/guides/SDK_PACKAGE_DEVELOPMENT.md).

## Choose the Right Owner

- network identity and capability facts belong in `knowledge/networks/`;
- deployments, proxy history, ABIs, and evidence belong in
  `knowledge/contracts/` until an accepted generated package owner exists;
- protocol semantics and formulas belong in `knowledge/protocols/`;
- cross-domain execution observations belong in `knowledge/workflows/`;
- reproducible diagnosis and bounded mitigation belong in
  `knowledge/troubleshooting/`;
- architecture belongs in `ARCHITECTURE.md` or an ADR;
- reusable procedures belong in `agents/skills/`;
- implementation scope and pending decisions belong in the agreed issue or pull request;
- durable retrieval context may belong in memory, but facts still require a
  canonical owner.

Do not create a second address list, ABI store, protocol fact, or generated
artifact owner in docs, examples, templates, skills, or applications.

## Before Starting

1. Confirm the requested outcome and affected domains.
2. Inspect existing files, tests, patterns, and current worktree changes.
3. Classify the risk level.
4. Agree on scope and acceptance criteria in an issue or pull request for
   architectural, multi-step, migration, public-interface, or protocol-sensitive
   changes. Keep individual planning notes outside the public source snapshot.
5. Identify authoritative evidence for every Mezo-specific or
   protocol-sensitive claim.
6. Stop for direction if evidence conflicts, scope materially expands, or a
   public/security boundary must change unexpectedly.

### Keep capability guidance current

When an exported capability, required injected port, supported scope, or
canonical evidence dependency changes, review the affected package docs,
skill wording, examples, and behavioral cases in the same change. Reuse the
owning sources rather than adding a second capability/support registry.
Record the relevant checkout/diff and distinguish API changes from evidence
refreshes and distribution status. Private package versions alone cannot
identify the capability revision.

Rerun the impacted cases from the
[contributor agent evaluation guide](docs/guides/CONTRIBUTOR_AGENT_EVALUATION.md)
for material capability or contributor-skill changes; record actual agent
behavior separately from static validation. A change of agent/runtime also
requires a new scoped behavioral comparison before carrying forward its
previous evaluation claims.

## Dependencies

Do not add or install a new external dependency without explicit human
approval.

Use pnpm for all dependency installation, workspace filtering, package script
execution, and lockfile updates. The exact pnpm version is declared by
`package.json#packageManager`, and `pnpm-lock.yaml` at the repository root is
the only dependency lockfile. Do not use npm or Yarn or create package-local
lockfiles.

After a dependency is approved, add it to its owning workspace package:

```sh
pnpm --filter <package-name> add <dependency>
pnpm --filter <package-name> add --save-dev <development-dependency>
```

Before proposing one:

- show why existing dependencies or platform capabilities are insufficient;
- review maintenance and release health;
- check relevant known vulnerabilities and security advisories;
- inspect install scripts, transitive impact, license compatibility, and
  supply-chain risk;
- explain expected lockfile and runtime/package-surface changes.

Dependency approval does not waive normal tests or security review.

## Implementation Rules

- Treat [`docs/standards/coding.md`](./docs/standards/coding.md) as the
  normative owner for modular design, TypeScript, public APIs, errors, async
  work, formatting, suppressions, exceptions, and quality gates.
- Make the smallest complete change and preserve unrelated work.
- Build authored package, CLI, framework, test, template, and example code in
  TypeScript by default; use TSX for React source containing JSX.
- Use Vitest as the default TypeScript package test framework. Derive tests
  from behavior, boundaries, failures, ordering, and side effects; do not use
  test counts, snapshots, or coverage percentages as substitutes for those
  assertions.
- Do not introduce plain JavaScript product code. A non-TypeScript
  implementation exception must be required by its owning tool or boundary and
  documented in scope.
- Preserve useful types across public boundaries and pair them with runtime
  validation for untrusted RPC, wallet, user, registry, and protocol data.
- Respect the dependency direction in `ARCHITECTURE.md`.
- Keep core and protocol logic independent of React, applications, and hidden
  global state.
- Pass clients, transports, registries, wallets, and policies explicitly.
- Keep deterministic calculations pure and document units, precision,
  rounding, and invalid states.
- Use intentional domain names and boundaries; avoid vague dumping grounds.
- Keep public interfaces typed, small, and deliberate.
- Do not silently swallow errors or weaken validation to make a check pass.
- Do not manually edit generated outputs when canonical inputs and a generator
  exist.
- Do not introduce a supported contract write without verified source, ABI,
  deployment identity, exact-call simulation, receipt handling, and
  domain-specific reconciliation.

Production applications normally remain outside this monorepo. Examples and
templates consume public MDK interfaces and must not import repository
internals.

## Knowledge and Documentation Changes

`docs/manifest` is versioned design input. Every manifest improvement must bump
the semantic version in its heading, update its release date, add the newest
entry to `docs/manifest-changelog.md`, and pass:

```bash
node scripts/validate-manifest-version.ts
node scripts/test-manifest-version.ts
```

The accepted universal module layout, human and agent responsibilities, common
record envelope, stable-reference rules, and maintenance workflows live in the
[`knowledge-management standard`](./docs/standards/knowledge-management.md).
Do not duplicate that procedure in module READMEs or skills. Resolve modules
through the root catalog and preserve the v0.4 role, envelope, logical-reference,
generation, and review contracts on every change.

Use the
[`knowledge-authoring guide`](./docs/guides/KNOWLEDGE_AUTHORING.md) for the
manual sequence, coding-agent request templates, executable synthetic example,
command selection, and final reviewer matrix. For the mainnet oracle refresh,
use [Refresh oracle evidence](./docs/guides/oracle-evidence-refresh.md): it
includes clean-checkout source setup, pinned commits, capture/import commands,
generation, verification, and troubleshooting. The standard remains normative
if guide wording and policy ever appear to disagree.

Canonical records retain exact scope, pinned evidence, lifecycle state,
limitations, freshness, and required review. Derived docs explain or project
those records and link back to them. If evidence and maintained knowledge
disagree, preserve the evidence, correct or mark the canonical projection, and
update derived artifacts; do not rewrite evidence to preserve a stale
narrative.

Update relevant docs, examples, skills, and consumer guidance in the same
change when supported behavior or workflow changes.

## Memory Decision

Every meaningful task ends with one of:

- no memory update because the durable result already lives in code,
  knowledge, docs, an ADR, or a skill;
- a concise, reviewed shared-memory entry that points to canonical material;
- a local-memory finding retained for further verification;
- a stale memory marked promoted, superseded, or deprecated.

Never store secrets, private keys, credentials, wallet data, personal data, raw
logs, copied source files, routine completion notes, or speculation in memory.
See [`agents/memory/README.md`](./agents/memory/README.md).

## Verification

Use the narrowest checks that meaningfully prove the change, then widen when a
boundary or risk requires it.

The deterministic repository-wide code gates are:

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm boundaries
pnpm build
pnpm test
pnpm test:shuffle
pnpm check
```

`pnpm check` checks code and generated-file consistency; it does not capture
live evidence or renew knowledge review deadlines. For the mainnet reader
slices, use `pnpm check:readers:mainnet` to include the declared evidence checks,
or `pnpm check:evidence:mainnet` when only that portion needs checking. See the
[refresh instructions](./docs/guides/oracle-evidence-refresh.md) when evidence
needs re-verification. Full-registry/testnet checks keep their separate scope.

These commands prove different properties. Do not report runtime execution,
syntax checking, tests, lint, or formatting as a substitute for typechecking.

| Risk    | Examples                                                                                     | Minimum expectation                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Level 1 | Docs, examples, minor DX, non-behavioral cleanup                                             | Review changed scope; run applicable formatting, link, schema, or docs checks                                                            |
| Level 2 | SDK behavior, CLI/tooling, adapters, templates                                               | Targeted tests plus applicable type, lint, build, and boundary integration checks                                                        |
| Level 3 | Addresses, ABIs, formulas, transaction construction, write paths, registry/security guidance | Authoritative evidence, deterministic tests, integration verification, explicit failure/compatibility review, and qualified human review |

Current dependency-free knowledge validators can be run with:

```bash
for validator in scripts/validate-*.ts; do
  node "$validator"
done
```

The common mixed-mode v0.4 conformance check is included in that loop. A module
migration additionally runs:

```bash
node scripts/validate-knowledge-structure.ts --module <module-id>
node scripts/validate-knowledge-structure.ts --require-all-v0.4
node scripts/validate-knowledge-catalog.ts
node scripts/validate-knowledge-workflows.ts
```

Also run:

```bash
git diff --check
```

When changing a validator, run `node --check` on that script. Package
documentation owns exact test, typecheck, lint, build, declaration,
packed-artifact, and integration commands. A package cannot substitute runtime
tests for source TypeScript typechecking or built declaration/entrypoint
verification.

Do not report a check as passed if it hung, was skipped, used unavailable
credentials, or exercised a materially different path. Record the exact gap.

## Pull Request Expectations

`@mmga67` manually reviews pull requests and material repository decisions
during the source-alpha stage. CODEOWNERS records that default; passing checks
does not replace maintainer approval.

Target alpha-development pull requests to `dev`. The maintainer promotes the
reviewed `dev` source to `main` only after the complete alpha is polished and
accepted. Do not bypass that manual gate or infer an automated branch/release
workflow.

A reviewable change should include:

- a clear outcome and bounded scope;
- the affected domains/packages and architecture impact;
- a linked task for significant work;
- evidence and provenance for protocol-sensitive claims;
- tests/checks run with outcomes;
- public compatibility and migration impact;
- documentation, knowledge, skill, example, and memory decisions;
- known risks, blockers, and follow-ups;
- explicit approval and review evidence for new dependencies;
- qualified review for Level 3 material.

Keep unrelated refactors in separate changes. Generated and derived changes
should identify their canonical inputs.

## Review Outcomes

- A Level 1 change may merge after its scoped checks and normal review pass.
- A Level 2 change requires functional review and tests appropriate to the
  changed boundaries.
- A Level 3 change remains proposed or unsupported until its evidence,
  verification, compatibility review, and qualified approval are recorded.

No document, directory, passing schema check, or successful transaction alone
creates a support promise.

## Security

Follow [`SECURITY.md`](./SECURITY.md). Do not place vulnerability details in a
public issue or pull request. Do not commit secrets, weaken validation, perform
unapproved mainnet writes, or change CI/CD, publishing, signing, or disclosure
boundaries outside explicitly approved scope.

## Deferred Distribution Governance

Package publication is outside the source-alpha scope. Before any later public
package release, maintainers must separately approve and document the registry
and publishing authority, package names, supported runtime/tool/package
versions, version/tag and deprecation policy, private security ownership and
response targets, credentials, provenance, rollback, and automation. Do not
infer those decisions from private workspace metadata or this repository's
GitHub availability.
