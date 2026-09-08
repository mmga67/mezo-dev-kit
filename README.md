# Mezo Developer Kit

**Mezo Developer Kit (MDK)** is a modular development environment being built
for Mezo.

> **Alpha status:** MDK is currently an experimental, read-only source alpha
> for a small developer community. Clone this GitHub repository to use or
> contribute to it. No npm package, stable version, production support promise,
> or protocol writer is provided at this stage.

MDK is **TypeScript-first**: SDK packages, protocol modules, tooling, framework
adapters, tests, templates, examples, and generated application code are built
in TypeScript by default. Solidity and machine-readable knowledge retain their
domain-specific formats. See
[`ADR-0007`](./docs/decisions/0007-typescript-first.md) for the exact boundary.

Vitest is the default TypeScript package test framework. The maintained
[`testing standard`](./docs/standards/testing.md) requires behavior- and
risk-driven tests with meaningful boundary and failure data rather than test
counts for their own sake.

MDK is designed to combine reusable SDK packages, verified Mezo knowledge,
development tooling, examples, and agent guidance so developers can move from
an idea to a working application with less repeated setup and protocol
research.

The source alpha includes private Chains, Contracts, and Core workspace
packages plus [MUSD Savings](packages/protocols/musd-savings/README.md),
[mUSDC lending](packages/protocols/musdc-lending/README.md), and
[USDC Lending Vault](packages/protocols/usdc-lending-vault/README.md) readers.
Their package guides define the supported mainnet read scope, injected ports,
and explicit unavailable/error results.

Run `pnpm check:readers:mainnet` to verify the source and its mainnet evidence.
Follow the [evidence refresh guide](docs/guides/oracle-evidence-refresh.md)
when updating observations. Current-state capture pins the latest available
block; unavailable historical testnet storage remains a separate limitation.

## Repository Structure

```text
mezo-dev-kit/
├── packages/        # Planned SDK packages and framework/tool integrations
├── extensions/      # Integrations built on top of MDK, e.g. Scaffold-ETH
├── templates/       # Ready-to-use project templates
├── examples/        # Focused examples of supported MDK workflows
├── docs/            # Architecture, guides, reference, ADRs, troubleshooting
├── knowledge/       # Canonical, evidence-backed Mezo knowledge
├── agents/          # Agent skills, consumer guidance, memory adapters, evals
├── scripts/         # Repository automation and maintenance scripts
└── .github/         # CI, issue templates, and repository automation
```

### `packages/`

Main implementation area.

The directories establish ownership boundaries. Workspace packages remain
private during the GitHub source alpha. Chains and Contracts contain generated
runtime projections of accepted canonical inputs, while Core exposes a narrow
injected read boundary. The prior transaction execution proof remains internal
to Core and is not part of its built entrypoint.

```text
chains/       Accepted network identity/capability registry; no default RPC
contracts/    Stable deployment resolution and read-safe ABI projections
core/         Provider-neutral, block-consistent read coordination
protocols/    Mezo protocol-specific modules and workflows
react/        React integrations
cli/          Command-line tooling
foundry/      Foundry integration
hardhat/      Hardhat integration
test-utils/   Shared testing utilities
```

### `docs/`

Human- and agent-readable documentation.

```text
architecture/      System and domain architecture
guides/            Development and usage guides
reference/         Technical reference material
decisions/         Architecture Decision Records (ADRs)
standards/         Normative contributor and maintenance policy
troubleshooting/   Known problems and debugging guidance
```

### `knowledge/`

Canonical Mezo facts used across the SDK, documentation, tooling, and agents.

```text
networks/
contracts/
protocols/
prices/
workflows/
troubleshooting/
security/
```

Protocol facts should have one canonical owner here rather than being copied across the repository.

“Canonical” means the maintained retrieval owner, not self-authenticating truth.
For current deployed behavior, block-pinned state/bytecode and version-matched
verified source outrank descriptive documentation and any knowledge narrative.
When they conflict, preserve the documentation as discrepancy evidence, scope
the deployed fact to its evidence coordinate, and correct the maintained
projection.

### `agents/`

Agent-oriented development infrastructure.

```text
skills/      Task-specific development procedures
consumer/    Guidance for agents building applications with MDK
memory/      Provider-neutral memory infrastructure and adapters
evals/       Agent behavior and knowledge evaluations
```

Root [`AGENTS.md`](./AGENTS.md) is the primary operating guide for agents developing MDK itself.

## Building Applications with MDK

Production applications are not the target of this source alpha. When package
distribution is separately designed and accepted in a later stage,
applications should normally live **outside this monorepo** and consume only
documented MDK entrypoints. `examples/` and `templates/` are the local
exceptions used to test and bootstrap that future external developer
experience.

External applications will use an application-owned `AGENTS.md` plus
version-compatible MDK consumer skills materialized under `.agents/skills/`
(or a documented compatibility discovery root). MDK upgrades may refresh the
consumer skills, but must not overwrite application-specific agent
instructions.

See [`docs/guides/EXTERNAL_APPLICATIONS.md`](./docs/guides/EXTERNAL_APPLICATIONS.md).

## Start Here

Clone the source alpha, then use pnpm for dependency management and all package
scripts. The exact supported pnpm version and minimum Node.js version are
declared in the root `package.json`.

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
pnpm install
pnpm check
pnpm test:shuffle
```

For an existing checkout, bootstrap and verify from the repository root:

```sh
pnpm install
pnpm check
pnpm test:shuffle
```

Active alpha development is integrated on the `dev` branch. Pull requests
should target `dev`; after the complete alpha is polished and accepted,
`@mmga67` manually promotes the reviewed source to `main`. There is no
automatic branch-promotion or release workflow.

The repository has one root `pnpm-lock.yaml`. Do not create package-local
lockfiles or use npm or Yarn for repository workflows.

The detailed contributor path—including package-filter commands, agent-skill
selection/materialization, the first-change workflow, and troubleshooting—is in
the [SDK development quickstart](./docs/guides/SDK_DEVELOPMENT.md).

Contributors trying these packages use the
[capability assessment procedure](./agents/skills/mdk-capability-assessment/SKILL.md)
to connect a task to current exports, required integrations, relevant skills,
and canonical evidence. Reassess those owners as the alpha evolves; unchanged
private package versions do not mean unchanged capabilities.

The private foundational API and its built-entrypoint fixture are documented in
[`packages/chains/README.md`](./packages/chains/README.md),
[`packages/contracts/README.md`](./packages/contracts/README.md),
[`packages/core/README.md`](./packages/core/README.md), and
[`examples/foundational-readonly/`](./examples/foundational-readonly/).

For repository development:

1. Read [`AGENTS.md`](./AGENTS.md).
2. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md).
3. For implementation work, load
   [`agents/skills/mdk-typescript-development/SKILL.md`](./agents/skills/mdk-typescript-development/SKILL.md)
   and the relevant domain skill.
4. Load only the documentation, knowledge, and code relevant to the task.

Contributors should also follow [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
report security issues through the private process in
[`SECURITY.md`](./SECURITY.md).

Pull requests and material repository decisions are reviewed manually by
`@mmga67` during the alpha. The repository is licensed under the
[`MIT License`](./LICENSE). Package publication, release tags/versions, and
release automation are intentionally deferred to a later stage.

See [`docs/INDEX.md`](./docs/INDEX.md) for documentation routing and
[`knowledge/README.md`](./knowledge/README.md) for the evidence/authority
contract.
