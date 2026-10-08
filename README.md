# Mezo Developer Kit

**Build on Mezo. Understand its protocols. Investigate on-chain activity.**

Mezo Developer Kit (MDK) connects **evidence-based Mezo knowledge, tailored agent
skills, a project memory system, practical guides, and TypeScript packages**.
Developers can turn protocol knowledge into applications, researchers can trace
behavior back to its sources, and explorers can learn how Mezo works. Skills
guide work in each domain, while memory preserves selected findings for reuse
across sessions.

MDK is especially useful alongside an AI coding agent: ask questions such as
“How does MUSD borrowing work?” or “Which contracts and sources explain this
behavior?” The agent can search the knowledge base, follow the evidence, and
help turn an explanation into working code. This makes it easier to understand
Mezo and move from questions to implementation. An agent is optional; you can
also use the knowledge, guides, and packages directly.

## What you can do

- **Build applications and scripts:** read balances and positions, calculate
  debt or yield, and compose borrowing, savings, swap, and liquidity workflows.
- **Explore Mezo:** look up networks, deployments, contract interfaces, and
  protocol rules alongside the sources behind them.
- **Investigate on-chain behavior:** inspect contract source and interfaces,
  read state at a chosen block, and scan event ranges to build reports with
  traceable evidence.
- **Set up a project with matching tools:** create a TypeScript app or add SDK
  packages, documentation, and optional AI skills to an existing one.

MDK is a **source alpha**: packages are not yet published to npm. Available APIs,
required integrations, and verification limits are described in the
[package support reference](docs/reference/sdk.md).

## Start here

| I am a…                | I want to…                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Developer              | [Build an application or script](#i-want-to-build-on-mezo)                         |
| Researcher or explorer | [Understand Mezo or investigate its behavior](#i-want-to-explore-or-research-mezo) |
| Contributor            | [Improve MDK's code, knowledge, or documentation](#contributing)                   |

### I want to build on Mezo

For a new project, use Git, Node.js 24+, and pnpm 11.0.8:

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
pnpm install --frozen-lockfile
pnpm cli
```

Choose **Create a project**, enter `../my-mezo-app`, and review the setup plan.
MDK builds the packages, installs your application, and checks its setup. This
can take a few minutes. Choose **Run the local demo** to try the starter with
sample data; it needs no RPC connection or wallet.

Once setup passes, exit the console and continue from your new application:

```sh
cd ../my-mezo-app
pnpm mdk
```

Choose **Add capabilities or skills** to add a domain such as MUSD borrowing,
with its packages and matching guidance. Return to `pnpm mdk` to add more,
browse documentation, or check your setup. Coding-agent support is optional.

| I want to…                        | Next step                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Use MDK in an existing app        | [Application guide](docs/guides/EXTERNAL_APPLICATIONS.md) — setup and integration                                                                |
| Learn from code examples          | [TypeScript cookbook](examples/README.md) — focused reads, calculations, and workflows                                                           |
| Use the console or a portable kit | [CLI guide](docs/guides/MDK_CLI.md#guided-setup) — setup, menus, and recovery                                                                    |
| Work with an AI coding agent      | [Application skills and references](docs/guides/MDK_CLI.md#how-the-agent-gets-knowledge) — give the agent context for your selected capabilities |
| Reuse findings across sessions    | [Project memory](docs/guides/APPLICATION_MEMORY.md) — save and retrieve useful context for later work                                            |

### I want to explore or research Mezo

Start with [Mezo knowledge](knowledge/README.md) and choose a subject. You can
read explanations, look up deployments, and follow their sources without
installing anything or creating an application.

For an investigation, use those records to identify the relevant contracts,
interfaces, and rules, then compare them with on-chain observations. Keep the
network, block, sources, and gaps with your findings so someone else can check
the report. Recorded evidence describes its stated scope and date; it is not
automatically current state.

| I want to…                                               | Next step                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Understand how the protocols fit together                | [Mezo's economic system](docs/architecture/mezo-economic-system-composition.md) — borrowing, savings, liquidity, and incentives     |
| Search records or inspect contract source and interfaces | [Local retrieval guide](scripts/agents/CONTEXT.md) — search the checkout and inspect selected evidence                              |
| Read state or trace events in a script                   | [Core SDK guide](packages/core/README.md) — reads at one block and bounded event scans                                              |
| Capture current observations for a report                | [Evidence capture guide](docs/guides/EVIDENCE_REFRESH.md) — CLI reports for selected network, contract, price, and incentive checks |

## Contributing

Contributors improve MDK itself: its SDK, tools, knowledge, and documentation.
Start with the [contributor guide](CONTRIBUTING.md) for scope, verification, and
review, then choose the kind of change you want to make.

| I want to…                             | Next step                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fix a bug or improve the SDK and tools | [Development quickstart](docs/guides/SDK_DEVELOPMENT.md) — workspace setup and a first verified change |
| Improve a README, guide, or reference  | [Documentation standard](docs/standards/documentation.md) — purpose, structure, examples, and review   |
| Add or correct Mezo knowledge          | [Knowledge authoring guide](docs/guides/KNOWLEDGE_AUTHORING.md) — sources, records, and validation     |
| Improve AI skills                      | [Skill authoring guide](docs/guides/SKILL_AUTHORING.md) — contributor and application procedures       |

The [architecture](ARCHITECTURE.md) explains package ownership and dependencies.
For agent-assisted contributions, follow [contributor agent setup](docs/guides/CONTRIBUTOR_AGENT_SETUP.md).

Report security issues through the private process in [Security](SECURITY.md).

## Project information

Browse the [documentation index](docs/INDEX.md) for the full collection and the
[changelog](CHANGELOG.md) for notable source updates.

MDK is maintained by `@mmga67` during the alpha and licensed under the
[MIT License](LICENSE).
