# Documentation

Choose a starting point for building with MDK, understanding Mezo, or contributing.

## Build an application

- [Guided CLI setup](guides/MDK_CLI.md#guided-setup) — create a project, then add
  packages, skills, and matching references from its own console.
- [External application guide](guides/EXTERNAL_APPLICATIONS.md) — application
  ownership, package integration, and optional consumer skills.
- [SDK reference](reference/sdk.md) — package APIs, required inputs, errors,
  compatibility, and verification scope.

## Explore examples

- [Run the offline example](../examples/README.md#run-the-offline-foundation-examples) —
  try package calls without an RPC connection or wallet.
- [Workflow examples](../examples/README.md) — follow complete protocol
  lifecycles, with local-fork setup for transaction demonstrations.
- [Package examples](../examples/PACKAGES.md) — find focused operations by package.

## Understand Mezo

Start with [Mezo knowledge](../knowledge/README.md) to browse networks,
deployments, prices, protocols, and troubleshooting.

| Subject             | Explanation or detailed reference                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Economic system     | [How the separate domains fit together](architecture/mezo-economic-system-composition.md)                                                              |
| MUSD                | [System model](reference/musd-system.md), [borrowing](reference/musd-borrowing.md), [redemptions](reference/musd-redemptions.md)                       |
| Networks            | [Network reference](../knowledge/networks/generated/reference.md)                                                                                      |
| Contracts           | [Deployment and ABI reference](../knowledge/contracts/generated/reference.md)                                                                          |
| Prices              | [Choosing observations and DEX quotes](guides/price-selection-and-dex-quotes.md), [price-source reference](../knowledge/prices/generated/reference.md) |
| Savings             | [MUSD Savings reference](../knowledge/protocols/musd/savings/generated/reference.md)                                                                   |
| Lending             | [BTC/mUSDC market reference](../knowledge/protocols/lending/musdc/generated/reference.md)                                                              |
| Vaults              | [USDC Lending Vault reference](../knowledge/protocols/vaults/usdc-lending/generated/reference.md)                                                      |
| Institutional debt  | [Enclave and position reference](../knowledge/protocols/musd/institutional-debt/generated/reference.md)                                                |
| Pools and liquidity | [Pool reference](../knowledge/protocols/pools/generated/reference.md)                                                                                  |
| Incentives          | [Current evidence](reference/incentives/current-evidence.md)                                                                                           |
| Swaps               | [Routing and quote reference](../knowledge/workflows/swaps/generated/reference.md)                                                                     |
| Bridges             | [MUSD NTT](reference/bridges/musd-ntt.md), [Native Bridge](reference/bridges/native-bridge.md)                                                         |
| Transactions        | [Lifecycle](reference/transaction-lifecycle.md), [detailed model](../knowledge/workflows/transactions/generated/reference.md)                          |
| Troubleshooting     | [Reproduced issues](../knowledge/troubleshooting/generated/reference.md)                                                                               |

References describe their recorded scope and limitations. The cited evidence
and package contracts determine which facts and operations can be relied on.

## Contribute to MDK

- [Contributor guide](../CONTRIBUTING.md) — scope, workflow, review, and dependencies.
- [SDK development quickstart](guides/SDK_DEVELOPMENT.md) — workspace setup
  and a first change.
- [Package authoring](guides/SDK_PACKAGE_DEVELOPMENT.md) — package ownership,
  public contracts, generated inputs, and verification.
- [Knowledge authoring](guides/KNOWLEDGE_AUTHORING.md) — sources, records,
  lifecycle, validation, and a synthetic teaching example.
- [Refresh oracle evidence](guides/oracle-evidence-refresh.md) — capture,
  import, checks, and current-state versus historical diagnostics.
- [Event scanning and reconciliation](guides/INDEXING_RECONCILIATION.md) —
  bounded coverage, checkpoints, reorgs, and outcomes.
- [Repository scripts](../scripts/README.md) — generators, validators,
  evidence tools, and local utilities.
- [Branch workflow](guides/BRANCH_WORKFLOW.md) — daily development and promotion.
- [Task management](guides/TASK_MANAGEMENT.md) — local records and their lifecycle.

## Standards and project decisions

- [Project manifest](manifest) — current baseline and delegated owners.
- [Architecture](../ARCHITECTURE.md) — package boundaries and dependencies.
- [Documentation standard](standards/documentation.md) — landing pages,
  tutorials, guides, references, explanations, and links.
- [Coding standard](standards/coding.md) — TypeScript design and quality.
- [Testing standard](standards/testing.md) — behavior, fixtures, and isolation.
- [Knowledge standard](standards/knowledge-management.md) — structure and maintenance policy.
- [Security policy](../SECURITY.md), [license](../LICENSE), and
  [review ownership](../.github/CODEOWNERS).
- [Manifest changelog](manifest-changelog.md) and
  [historical decisions](decisions/README.md) — changes and their rationale.

## Work with coding agents

- [Contributor agent setup](guides/CONTRIBUTOR_AGENT_SETUP.md) — install and
  refresh contributor discovery.
- [Agent guidance overview](../agents/README.md) — contributor and consumer audiences.
- [Skill authoring](guides/SKILL_AUTHORING.md) — portable source, testing, and distribution.
- [Agent evaluation](guides/CONTRIBUTOR_AGENT_EVALUATION.md) — observed task behavior.
- [Memory management](guides/MEMORY_MANAGEMENT.md) — optional retrieval context
  and promotion to canonical owners.
