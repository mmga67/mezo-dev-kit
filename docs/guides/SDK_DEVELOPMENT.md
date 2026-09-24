# MDK SDK development quickstart

Use this guide to set up an MDK source checkout, run an offline example, and
make a first verified change. For an independent application, follow the
[standalone project guide](MDK_CLI.md) instead.

MDK is a GitHub source alpha with private workspace packages. The
[SDK reference](../reference/sdk.md) helps you choose a package and find its
current APIs, required inputs, and verification scope.

## Prerequisites

Use the versions declared by the root [package configuration](../../package.json):

- Node.js 24 or later;
- pnpm 11.0.8, the repository-pinned package manager;
- Git.

Check the environment before installing dependencies:

```sh
node --version
pnpm --version
git --version
```

Use your environment manager to install a missing tool. Repository workflows
use pnpm and the root lockfile; do not create package-local lockfiles.

## Checkout and branch policy

Clone the source:

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
```

A fresh clone can stay on `main` while you try examples. Daily contribution
uses `feat/next`. For a new contributor checkout:

```sh
git switch -c feat/next main
pnpm setup:git
```

In an existing checkout, inspect and preserve unfinished changes before
switching to the existing `feat/next` branch:

```sh
git branch --show-current
git status --short --branch
```

The [branch workflow](BRANCH_WORKFLOW.md) covers existing custom Git hooks,
synchronization, ignored local records, and promotion of reviewed commits.

## Install and verify the workspace

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter '@mezo-dev-kit/examples...' build
pnpm --filter @mezo-dev-kit/examples foundations
```

The build emits JavaScript and declarations for the examples and their
dependencies. The final command prints deterministic results for amounts,
registry metadata, price policy, repayment allocation, and project
configuration. It needs no RPC or wallet. Read
[the foundation example](../../examples/foundations.ts) to follow the calls.

You now have a built workspace and a first working example. Choose a focused
operation from the [package examples](../../examples/PACKAGES.md), or continue
below to make a change. Transaction demonstrations have their own
[local-fork prerequisites](../../examples/README.md#build-and-run).

`--frozen-lockfile` fails if installation would require a lockfile update.
For contributor verification, use the checks in
[Make a first change](#make-a-first-change).

## Work on one workspace package

Read the package's README and reference before changing it. Use the
[package authoring guide](SDK_PACKAGE_DEVELOPMENT.md) for ownership decisions,
public exports, generated inputs, or a new module.

Discover the selected package's commands first. For Core:

```sh
pnpm --filter @mezo-dev-kit/core run
pnpm --filter @mezo-dev-kit/core check
```

Core's check composes formatting, typechecking, lint, build, and tests.
Individual scripts are available when a narrower check suits the change.
The [repository scripts manual](../../scripts/README.md) explains the wider
command families.

To verify built entrypoints and clean-checkout behavior:

```sh
pnpm build
pnpm test:browser
pnpm test:built
pnpm test:clean
```

Install the [browser test prerequisites](BROWSER_APPLICATIONS.md#verify-an-integration)
before `test:browser` or the full `check`. Built checks exercise package exports
without source fallbacks. The clean
check creates a disposable source copy, installs the frozen lockfile offline,
and checks source types plus built imports/runtime. The separate
[private tooling pilot](MDK_CLI.md) owns packed-artifact and standalone-project
verification. These checks establish different boundaries from a registry release.

## Make a first change

### 1. Confirm scope and task state

Agree on the outcome and acceptance criteria for significant work in a task,
issue, or pull request. Humans own goals, priority, and material scope changes.
Follow [task management](TASK_MANAGEMENT.md) for ignored local records.

Inspect the current checkout:

```sh
git branch --show-current
git status --short
```

Read the relevant contributor standard and owning code, docs, or knowledge.
Use [Architecture](../../ARCHITECTURE.md#repository-areas) to locate a package
responsibility and the [documentation index](../INDEX.md) to locate guidance.

### 2. Edit the canonical owner

- Runtime behavior belongs in the owning workspace package.
- Protocol facts, deployments, addresses, and ABIs belong in indexed knowledge.
- Project decisions belong in the manifest and its detailed owners.
- Human procedures belong in guides; coding-agent procedures belong in skills.
- Task files record progress; memory supplies retrieval pointers.

Generated files identify their input or generator. Change that owner,
regenerate, and run its drift check. The
[documentation standard](../standards/documentation.md) applies to prose;
the [coding standard](../standards/coding.md) applies to authored code.

### 3. Verify from narrow to broad

Choose checks for the boundary you changed. For documentation, explicitly
format the edited files and check links; for example:

```sh
pnpm exec prettier --check README.md docs/guides/SDK_DEVELOPMENT.md
node scripts/checks/validate-markdown-links.ts
git diff --check
```

Review changed heading anchors and follow the reader's path as well.
Root `format:check` does not include root Markdown or `docs/`.

For package behavior, start with its documented check and relevant tests.
Run `pnpm boundaries` when imports, exports, dependencies, or workspace
structure change. Shared configuration or multi-package changes require
the root checks:

```sh
pnpm check
pnpm test:shuffle
```

`pnpm check` combines formatting, generation drift, typechecking, lint,
boundaries, builds, packed SDK browser checks, and tests. `test:shuffle` separately checks seeded test
order. Neither command captures live evidence or renews review dates.

[Contributor verification](../../CONTRIBUTING.md#verification) owns the
risk levels. Protocol-sensitive work additionally needs authoritative evidence,
failure/compatibility review, and qualified acceptance. For mainnet reader
evidence, use `pnpm check:evidence:mainnet`, or `pnpm check:readers:mainnet`
for code and evidence together. The
[oracle refresh guide](oracle-evidence-refresh.md) covers capture and
historical-data limitations.

### 4. Review and hand off

Inspect the exact changed scope:

```sh
git status --short
git diff --check
git diff --stat
```

Report actual commands/results, unavailable checks, API or compatibility
impact, and the documentation/knowledge/memory decision. Keep the local task
status consistent with [task lifecycle](TASK_MANAGEMENT.md#lifecycle-and-evidence).
Required maintainer review remains part of contribution.

## Optional coding-agent assistance

The manual workflow above is complete without agent setup. Before asking an
agent to work on MDK, use the contributor setup below.

### Set up the contributor agent

Fresh clones do not include the generated `.agents/` directory. Follow
[contributor agent setup](CONTRIBUTOR_AGENT_SETUP.md) for installation,
discovery checks, non-empty targets, and refresh after checkout updates.
The supported Node version is sufficient for skill installation.

### Select contributor agent skills

The root and nearest applicable AGENTS instructions route agent work.
[Capability assessment](../../agents/skills/mdk-capability-assessment/SKILL.md)
helps an agent connect a task to current package APIs and required inputs.
[The agent overview](../../agents/README.md) explains contributor versus
application guidance.

Use the relevant domain procedure for protocol-sensitive work, TypeScript
development guidance for authored code, and testing guidance for test changes.
Load only the task's relevant sources. Reassess changed docs, exports, and
evidence after checkout updates; private versions alone do not identify a
capability revision.

### Validate and materialize skills

The [setup guide](CONTRIBUTOR_AGENT_SETUP.md#verify-files-and-runtime-discovery)
owns discovery verification. Maintainers changing canonical skill sources
follow [skill authoring](SKILL_AUTHORING.md#8-review-distribution-and-documentation).
Consumer skills are a separate audience; the setup guide and
[external application guide](EXTERNAL_APPLICATIONS.md#agent-guidance) describe
the appropriate installation path.

## Dependency and safety stops

Follow [dependency review](../../CONTRIBUTING.md#dependencies) before adding a
dependency. A new writer, release process, or CI/security change needs its
own authorized scope. Preserve application-owned instructions and unrelated
work. [Security](../../SECURITY.md) owns private reporting.

## Troubleshooting

### Node or pnpm version mismatch

Compare `node --version` and `pnpm --version` with root package configuration.
Use the required toolchain before installing or running repository scripts.

### Wrong package manager or lockfile drift

Use the root pnpm lockfile. If frozen installation fails, inspect the diff and
the task's intended dependency change; do not regenerate it merely to silence
the failure.

### Stale generated output

Follow the input/generator named in the affected file or package reference.
Regenerate that output and run its declared drift check.

### Skill discovery is missing or stale

Use [agent setup troubleshooting](CONTRIBUTOR_AGENT_SETUP.md#troubleshooting).
Edit canonical sources and refresh discovery through the documented workflow.

### Workspace or deep-import leak

Build dependencies and import the package's declared public entrypoint.
`pnpm boundaries` checks package ownership; built/clean checks detect source
fallbacks and missing output.

### A test passes but typechecking fails

Runtime tests do not prove public types. Run the package's typecheck and build,
then inspect the reported input, declaration, or dependency mismatch.

## Related guidance

- [Contributor guide](../../CONTRIBUTING.md) — scope, dependencies, review, and completion.
- [Package authoring](SDK_PACKAGE_DEVELOPMENT.md) — a bounded implementation workflow.
- [External applications](EXTERNAL_APPLICATIONS.md) — integrating from another repository.
- [Testing standard](../standards/testing.md) — behavior, fixtures, and verification.
- [Memory management](MEMORY_MANAGEMENT.md) — optional retrieval context and promotion.

## Price usability and DEX rates

Use [price selection](price-selection-and-dex-quotes.md) when choosing a
protocol price input, direct reference, or amount-specific DEX quote.
The guide explains freshness and meaning; package references own exact calls.
