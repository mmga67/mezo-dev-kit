# MDK SDK development quickstart

This guide takes an MDK contributor from an existing or clean source checkout
to the repository's verified development workflow. MDK is currently an
experimental GitHub source alpha. Workspace packages are private;
there is no npm or other package-registry installation path.

For available methods, input/output contracts, errors, and usage examples,
see the [SDK package reference](../reference/sdk.md).

The [MUSD borrowing implementation](../../packages/protocols/musd-borrowing/REFERENCE.md)
adds direct borrower writers and uses Core's explicit execution ports. It is
awaiting qualified protocol review; source implementation and local fork tests do
not establish production release support. Existing read APIs remain available.

## Prerequisites

Use the versions declared by the root [`package.json`](../../package.json):

- Node.js 24 or later;
- pnpm 11.x, with `pnpm@11.0.8` recorded as the repository package manager;
- Git.

Confirm the environment before installing dependencies:

```sh
node --version
pnpm --version
git --version
```

Do not use npm or Yarn for repository dependency or script workflows, and do
not create another lockfile. If the required Node or pnpm command is missing,
install it through your trusted environment manager before continuing. MDK
does not provide a bootstrap installer.

## Checkout and branch policy

Fresh public clones use `main` and can remain there while trying the source
alpha, installing local skills, and running examples. In an existing checkout,
inspect the current branch and worktree:

```sh
git branch --show-current
git status --short --branch
```

For contribution work, use the branch selected by the maintainer for the task.
The normal integration policy targets `dev`, with manual maintainer promotion
to `main`, as recorded in [ADR-0013](../decisions/0013-github-source-alpha-governance.md).
An explicit maintainer task on another branch supplies that direction. If the
target is unclear, resolve it before branch/push operations; trying packages
and setting up skills do not require a branch change.

Clone the published source with:

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
```

Do not assume that a remote `dev` branch exists or create one just to run this
guide. Keep the maintainer's public-source promotion boundary intact.

## Set up the contributor agent

Fresh clones do not include `.agents/`. Before agent-assisted work, follow
[contributor agent setup](./CONTRIBUTOR_AGENT_SETUP.md) to validate canonical
skills and materialize an ignored local discovery tree:

```sh
node scripts/validate-agent-skills.ts
node scripts/materialize-agent-skills.ts --audience contributor --output .agents/skills
```

This step needs only the supported Node version. Use the setup guide for
non-empty targets, refresh after checkout changes, and runtime discovery checks.

## Install and verify the workspace

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:shuffle
```

`pnpm install --frozen-lockfile` installs only from the root lockfile and fails
instead of rewriting it. The two verification commands prove different
properties:

| Command             | What it proves                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `pnpm check`        | Formatting, typechecking, typed lint, package boundaries, builds, and tests |
| `pnpm test:shuffle` | Seeded order-independent root and package tests with repository-owned seeds |

The exact gate definitions live in the root `package.json`, the
[`coding standard`](../standards/coding.md), and the
[`testing standard`](../standards/testing.md). Do not report a narrower command
as equivalent to `pnpm check`.

For the mainnet Savings, mUSDC lending, and vault reader dependency checks, run
`pnpm check:readers:mainnet` (code and evidence) or
`pnpm check:evidence:mainnet` (evidence only). `pnpm check` does not capture live
evidence or renew its review dates. Follow the
[oracle evidence refresh instructions](oracle-evidence-refresh.md) when those
observations need re-verification; the full-registry/testnet gate remains
separate.

## Work on one workspace package

Use the
[`workspace-module authoring guide`](./SDK_PACKAGE_DEVELOPMENT.md) when deciding
whether to create a package, extending an existing owner, defining exports and
generated inputs, or proving declarations and runnable built entrypoints. The
commands below apply to the private foundational modules; they are not a
generic package scaffold or publication contract.

Discover the package's own scripts before running them:

```sh
pnpm --filter @mezo-dev-kit/chains run
pnpm --filter @mezo-dev-kit/evm run
pnpm --filter @mezo-dev-kit/contracts run
pnpm --filter @mezo-dev-kit/core run
```

Each foundational module supports focused `format:check`, `typecheck`, `lint`,
`build`, `test`, seeded `test:shuffle`, and composed `check` commands. For
example:

```sh
pnpm --filter @mezo-dev-kit/core format:check
pnpm --filter @mezo-dev-kit/core typecheck
pnpm --filter @mezo-dev-kit/core lint
pnpm --filter @mezo-dev-kit/core build
pnpm --filter @mezo-dev-kit/core test
pnpm --filter @mezo-dev-kit/core test:shuffle
pnpm --filter @mezo-dev-kit/core check
```

The root build emits JavaScript and declarations for all implemented
packages and their focused examples in dependency order. Verify the declared runtime
entrypoints, unavailable deep paths, missing-artifact behavior, and the absence
of the internal Core transaction proof with:

```sh
pnpm build
pnpm test:built
pnpm test:clean
```

`test:clean` creates a disposable source copy, excludes the local dependency
tree and prior build output, installs from the frozen lockfile in offline mode,
and proves source typechecking plus built imports/runtime. The packages remain
private repository boundaries. Do not claim a packed or registry-installed
runtime boundary; future package distribution requires separate approval.

## Select contributor agent skills

Trying the workspace packages is contributor work. Start with
[`mdk-capability-assessment`](../../agents/skills/mdk-capability-assessment/SKILL.md)
when the task uses, explains, tests, or extends MDK capabilities. It connects
the requested operations to public package entrypoints, required injected
ports, domain skills, and canonical evidence before implementation decisions.
The source-alpha label describes distribution and scope; inspect current
owners before deciding whether a particular operation is available.

The nearest `AGENTS.md` routes the work category. The root instructions require
`mdk-typescript-development` for authored product code, the relevant domain
skill for protocol-sensitive work, and `mdk-testing` when test behavior,
fixtures, regressions, or strategy are in scope.

Use [`agents/catalog.json`](../../agents/catalog.json) to find a skill by its
`audience` and `domains`. Load only the smallest relevant set.

```text
task and affected domain
→ root and nearest AGENTS.md
→ contributor skill(s) from catalog domains
→ owning docs, code, tests, and canonical knowledge
```

The skill locations have different roles:

| Location                     | Role                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| `agents/skills/`             | Canonical contributor skill sources                                        |
| `agents/consumer/skills/`    | Canonical external-application skill sources                               |
| `.agents/skills/`            | Ignored local contributor discovery view, created explicitly after cloning |
| Application `.agents/skills` | Materialized consumer view; never the canonical source                     |
| Application `AGENTS.md`      | Application-owned instructions; MDK synchronization must not overwrite it  |

Contributor skills must not be copied into consumer applications. Consumer
skills describe supported application-facing behavior and must not expose MDK
repository-maintenance procedures.

### Try packages and reassess improvements

For example, a request involving a Mezo contract read, account history, and
signing crosses different boundaries. Resolve identity through Networks and
Chains; use Contracts and Core or an owning protocol reader for applicable
reads. Define the history source and coverage independently, and inspect
current transaction exports and signer requirements. A gap in one operation
does not invalidate other supported components. The
[foundational walkthrough](../../examples/foundational-readonly/README.md)
shows deterministic composition and an explicit bounded HTTP read.

Package READMEs own usage scope and injected inputs; manifests/exports and
built-entrypoint checks establish the available boundary. Canonical knowledge
owns evidence-backed Mezo facts. Skill bodies own the procedures for applying
them. Memory may point to these owners but cannot preserve an obsolete
capability claim against current sources.

After a checkout update, inspect the relevant revision/diff, docs, exports, and
build state. Reuse newly supported APIs within the task; distinguish internal
implementation changes, removed APIs, narrower support, and evidence-only
updates. Private versions may remain unchanged throughout. A failed import
before building is a build-state problem until proven otherwise. An unresolved
code/docs/evidence conflict needs resolution at its owner.

Record separate verification for source/types, built composition, adapter
behavior, and live observations. Follow the
[behavioral evaluation guide](./CONTRIBUTOR_AGENT_EVALUATION.md) to test agent
decisions, and the [contributor maintenance rule](../../CONTRIBUTING.md#keep-capability-guidance-current)
when those boundaries change.

### Validate and materialize skills

Validate every canonical skill and the catalog:

```sh
node scripts/validate-agent-skills.ts
```

The materializer accepts only a new or empty target. For normal installation,
use the [contributor setup guide](./CONTRIBUTOR_AGENT_SETUP.md). For a disposable
materialization check that leaves an existing local installation untouched:

```sh
mdk_contributor_skills="$(mktemp -d)"
node scripts/materialize-agent-skills.ts \
  --audience contributor \
  --output "$mdk_contributor_skills"
find "$mdk_contributor_skills" -mindepth 1 -maxdepth 1 -type d | sort
```

Consumer materialization is a separate explicit operation:

```sh
mdk_consumer_skills="$(mktemp -d)"
node scripts/materialize-agent-skills.ts \
  --audience consumer \
  --output "$mdk_consumer_skills"
find "$mdk_consumer_skills" -mindepth 1 -maxdepth 1 -type d | sort
```

Do not point either command at a non-empty discovery directory. The tool fails
closed instead of merging or replacing existing instructions. See
[`agents/README.md`](../../agents/README.md) and
[`ADR-0008`](../decisions/0008-portable-agent-skill-distribution.md) for the
canonical-source and audience-separation contract.

## Make a first change

### 1. Confirm scope and task state

Agree on scope and acceptance criteria in the maintainer-approved issue or
pull request. Humans control goals, priority, and material scope changes.
Keep individual planning notes outside the public source snapshot.

Before editing, inspect current state:

```sh
git branch --show-current
git status --short
rg --files -g 'AGENTS.md'
```

Read the root and nearest applicable `AGENTS.md`, the active task, and only the
owning code/docs/knowledge needed for the change.

### 2. Edit the canonical owner

- Runtime behavior belongs in its owning workspace package.
- Network, address, ABI, deployment, and protocol facts belong in canonical
  `knowledge/` owners, not copied source or examples.
- Architecture and durable repository decisions belong in architecture docs or
  ADRs.
- Procedures belong in skills or guides; task files own execution state only.
- Memory is supporting retrieval context, never protocol authority.

Generated files identify their generator or canonical input. Change the input
and generator, regenerate, and run the declared drift check; do not patch the
output by hand.

### 3. Verify from narrow to broad

Start with the owner-specific command documented by the package, generator, or
knowledge module. For current Core work, for example:

```sh
pnpm --filter @mezo-dev-kit/core check
```

Run package boundaries whenever imports, exports, package dependencies, or
workspace structure change:

```sh
pnpm boundaries
```

Before review, widen to the risk-appropriate root checks:

```sh
pnpm check
pnpm test:shuffle
node scripts/validate-markdown-links.ts
git diff --check
```

Level 1 documentation work needs scoped formatting/link checks. Level 2 runtime
behavior needs targeted tests and applicable type/lint/build/integration
checks. Level 3 protocol, transaction, registry, financial, and security work
also needs authoritative evidence, failure/compatibility review, and qualified
human acceptance. The root `AGENTS.md` and standards own the complete rules.

### 4. Review and hand off

Inspect the exact changed scope:

```sh
git status --short
git diff --check
git diff --stat
```

Report the commands actually run, their outcomes, any unavailable checks, API
or compatibility impact, and the documentation/knowledge/memory decision.
Move a significant task to `review/` only when its deliverables and technical
verification are complete; move it to `done/` only after required acceptance.

## Dependency and safety stops

Do not add or install a new external dependency without explicit maintainer
approval and the dependency review required by `CONTRIBUTING.md`. Stop for an
unexpected architecture/API change, missing or conflicting authoritative
evidence, an unsafe write, a security-boundary change, or a need to bypass a
repository invariant.

The source alpha does not authorize protocol writers, live value-bearing calls,
publishing credentials, CI/CD changes, package publication, or automatic
promotion to `main`.

## Troubleshooting

### Node or pnpm version mismatch

Compare `node --version` and `pnpm --version` with root `package.json#engines`
and `packageManager`. Switch the external environment to a compatible version;
do not edit the repository constraints merely to fit the current machine.

### Wrong package manager or lockfile drift

Stop if npm/Yarn created a lockfile or `pnpm install --frozen-lockfile` reports
that `pnpm-lock.yaml` is stale. Do not regenerate or delete lockfiles unless the
dependency change is approved and in scope.

### Stale generated output

Find the generator and declared `--check` or module validation command in the
owning README/index. Update canonical inputs first, regenerate deterministically,
and review both input and output. Never make the generated file pass by editing
it directly.

### Skill discovery is missing or stale

Run `node scripts/validate-agent-skills.ts`. Confirm the catalog entry,
audience, canonical directory name, and frontmatter `name` agree. Materialize
into a new empty temporary target to distinguish a source/catalog defect from
a runtime discovery-path issue. Follow the
[setup and refresh guide](./CONTRIBUTOR_AGENT_SETUP.md) to install the local
view; Git does not synchronize ignored discovery copies.

### Workspace or deep-import leak

Run `pnpm boundaries`. Cross-package imports must use a declared workspace
dependency and an exported package entrypoint. Do not import another package's
`src/` tree or use a relative path across package roots.

### A test passes but typechecking fails

Fix the type error. Vitest executes transformed TypeScript and does not replace
the package or root TypeScript check.

## Do not

- use npm or Yarn for repository workflows or create another lockfile;
- treat private workspace names/versions as registry or compatibility promises;
- deep-import package source or rely on undeclared workspace dependencies;
- copy addresses, ABIs, deployments, or protocol rules out of canonical owners;
- edit generated outputs by hand;
- add a dependency, writer, release workflow, or CI/CD change without approval;
- treat memory, tasks, generated references, or discovery copies as canonical
  protocol authority;
- overwrite application-owned `AGENTS.md` or mix contributor and consumer
  skills; or
- push or merge ordinary alpha work directly to `main`.

## Related guidance

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`docs/standards/coding.md`](../standards/coding.md)
- [`docs/standards/testing.md`](../standards/testing.md)
- [`docs/guides/SDK_PACKAGE_DEVELOPMENT.md`](./SDK_PACKAGE_DEVELOPMENT.md)
- [`docs/guides/EXTERNAL_APPLICATIONS.md`](./EXTERNAL_APPLICATIONS.md)
- [`agents/README.md`](../../agents/README.md)
- [`agents/memory/README.md`](../../agents/memory/README.md)
- [`docs/guides/MEMORY_MANAGEMENT.md`](./MEMORY_MANAGEMENT.md)

## Price usability and DEX rates

Use the [price-selection guide](price-selection-and-dex-quotes.md) when choosing
between a protocol adapter, a direct price reference, and an amount-specific DEX
quote. Keep unavailable/stale observations explicit; do not convert DEX prices
into protocol health inputs. The [refresh guide](oracle-evidence-refresh.md)
distinguishes current-state captures from archive-dependent historical checks.
