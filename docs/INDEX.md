# Documentation Index

- `guides/price-selection-and-dex-quotes.md` — usable observations, Pyth diagnostics, DEX rates, and current versus historical state.

- `../packages/protocols/musdc-lending/README.md` — lending reader port contract,
  exact accounting, price freshness, and limitations.
- `../packages/protocols/usdc-lending-vault/README.md` — vault reader composition,
  fee-aware previews, role provenance, and ownership.
- `../examples/musdc-lending-readonly/README.md` — built lending example.
- `../examples/usdc-lending-vault-readonly/README.md` — built vault example.

Use this page to route to the maintained owner without loading unrelated
domains.

## SDK API reference

- [Package reference](reference/sdk.md) — all eleven implemented SDK packages,
  public functions and client methods, types, required ports, errors, and
  TypeScript examples.

## Project and process

- `../packages/protocols/musd-savings/README.md` — source-alpha Savings read API,
  transport/codec ports, exact-runtime role checks, and consumer guidance.
- `../examples/musd-savings-readonly/README.md` — built Savings example.

- `manifest` — versioned community architecture discussion describing what MDK
  is being built to become; design input, not evidence for external Mezo facts.
- `manifest-changelog.md` — dated manifest version and improvement log.
- `../AGENTS.md` — repository-wide development rules and authority model.
- `../ARCHITECTURE.md` — accepted repository boundaries, dependency direction,
  and architectural change process.
- `../CONTRIBUTING.md` — contributor workflow, verification, and review gates.
- `../SECURITY.md` — private reporting and repository security boundaries.
- `../LICENSE` — MIT license for repository source.
- `../knowledge/README.md` — knowledge evidence and authority boundary.
- `standards/knowledge-management.md` — accepted v0.4 human/shared knowledge
  maintenance contract, layouts, lifecycle, and workflows.
- `standards/coding.md` — normative modular design, SOLID, TypeScript, public
  API, error, async, security-integration, formatting, exception, and
  enforcement rules for authored code.
- `standards/testing.md` — normative test design, edge-case, isolation,
  fixture, Vitest, coverage, and review conventions.
- `guides/SDK_DEVELOPMENT.md` — GitHub source checkout, workspace setup,
  package-filter checks, contributor-skill materialization, first-change
  workflow, and troubleshooting.
- `guides/CONTRIBUTOR_AGENT_SETUP.md` — explicit local skill installation in a
  fresh clone, runtime discovery checks, refresh, and troubleshooting.
- `guides/oracle-evidence-refresh.md` — source checkout/pinning, evidence
  capture/import, generation, mainnet checks, and troubleshooting.
- `guides/SDK_PACKAGE_DEVELOPMENT.md` — module-or-existing-owner decisions,
  private manifests and exports, generated runtime inputs, read-only API/test
  boundaries, manual and coding-agent workflows, and disposable built-consumer
  verification.
- `../packages/chains/README.md` — private accepted network identity/capability
  API, canonical generation, provider exclusions, and limitations.
- `../packages/evm/README.md` — typed address/hash/data/quantity validation,
  checksum policy, exact unit conversions, and domain error boundaries.
- `../packages/contracts/README.md` — stable deployment resolution, read-safe
  ABI projection, lifecycle/provenance/freshness, and generation boundary.
- `../packages/core/README.md` — injected block-consistent read API, typed
  partial failures, built export, and retained internal transaction proof.
- `../examples/foundational-readonly/README.md` — deterministic consumer of all
  four declared built entrypoints without a default RPC.
- `guides/MEMORY_MANAGEMENT.md` — provider-neutral retrieval, local/shared
  capture, lifecycle, promotion/deprecation, manual schema validation, privacy,
  and optional-provider boundaries.
- `guides/KNOWLEDGE_AUTHORING.md` — manual and coding-agent v0.4 owner
  discovery, source/evidence/record maintenance, module creation, lifecycle,
  generation, validation, and qualified-review workflow with a synthetic
  executable example.
- `guides/SKILL_AUTHORING.md` — manual and coding-agent portable skill
  creation, update, audience selection, validation, testing, deprecation,
  review, and unchanged consumer materialization with disposable examples.
- `../agents/skills/mdk-capability-assessment/SKILL.md` — contributor task routing,
  current package capabilities, knowledge retrieval, and integration gaps.
- `guides/CONTRIBUTOR_AGENT_EVALUATION.md` — behavioral evaluation of package
  usage, evidence handling, selective routing, and capability changes.
- `guides/INDEXING_RECONCILIATION.md` — provider-neutral bounded scans,
  checkpoints, completeness, reorg, negative-evidence, candidate-precedence,
  and protocol-reconciliation guidance without a hosted-indexer dependency.

## Accepted architecture decisions

- `decisions/0001-contract-registry-bootstrap-ownership.md`
- `decisions/0002-core-client-model.md`
- `decisions/0003-transaction-lifecycle.md`
- `decisions/0004-external-evm-network-records.md`
- `decisions/0005-contract-evidence-provenance-classes.md`
- `decisions/0006-knowledge-module-architecture.md`
- `decisions/0007-typescript-first.md`
- `decisions/0008-portable-agent-skill-distribution.md` — portable skill
  sources, audience separation, discovery projections, and optional MCP
  boundary.
- `decisions/0010-vitest-default-testing.md` — Vitest package-test default and
  testing-standard ownership boundary.
- `decisions/0011-economic-system-composition-ownership.md` — accepted modular
  ownership and dependency direction for the Mezo economic flywheel.
- `decisions/0012-coding-standard-and-quality-gates.md` — accepted global
  coding-standard ownership, Node baseline, exact TypeScript toolchain, and
  deterministic quality-gate composition.
- `decisions/0013-github-source-alpha-governance.md` — accepted MIT-licensed,
  manually reviewed GitHub source-alpha boundary, `dev`-to-`main` promotion,
  and explicit package/release deferrals.
- `decisions/0014-evm-value-foundation.md` — shared EVM value ownership,
  pinned Ox implementation, and compatibility-preserving consumer migration.
- `decisions/0009-oracle-price-source-ownership.md` — accepted
  provider-neutral price-source taxonomy, typed datum/failure contract,
  ownership, dependency, freshness, scale, and fallback boundaries.

Accepted architecture does not imply that a public package, dependency,
protocol writer, or support promise has been released.

## Architecture maps

- `architecture/mezo-economic-system-composition.md` — stable-owner and
  reconciliation map across MUSD, Savings, mUSDC lending, vaults, incentives,
  pools, bridges, prices, contracts, networks, and transactions.

## Derived reference

- `../knowledge/networks/generated/reference.md` — deterministic Networks v0.4
  human reference generated from indexed canonical resources.
- `../knowledge/contracts/generated/reference.md` — deterministic Contracts
  v0.4 human registry generated from indexed deployments, ABIs, sources, and
  evidence.
- `../knowledge/protocols/pools/generated/reference.md` — deterministic basic
  and CL pool discovery, math, liquidity, ownership, and operation-boundary
  reference.
- `../knowledge/prices/generated/reference.md` — deterministic price-source
  taxonomy, feed identity, datum, freshness/fallback, fixture, and bounded
  observation reference.
- `../knowledge/protocols/musd/institutional-debt/generated/reference.md` —
  deterministic Enclave custody, institutional position/accounting, formula,
  aggregate-separation, and future-operation reference.
- `../knowledge/protocols/musd/savings/generated/reference.md` — deterministic
  sMUSD principal, indexed-yield, PCV/converter/gauge, and classic-MUSD
  separation reference.
- `../knowledge/protocols/lending/musdc/generated/reference.md` — deterministic
  BTC/mUSDC market, Morpho share/interest/health/liquidation, and aggregate
  boundary reference.
- `../knowledge/protocols/vaults/usdc-lending/generated/reference.md` —
  deterministic VaultV2, adapter, wrapper, high-water yield, gauge, liquidity,
  and reconciliation reference.
- `../knowledge/workflows/swaps/generated/reference.md` — deterministic basic
  and CL routing, quote/simulation boundaries, approval requirements, and
  reconciliation reference.
- `../knowledge/workflows/transactions/generated/reference.md` — deterministic
  transaction/RPC inventory and fact/proposal boundary.
- `../knowledge/troubleshooting/generated/reference.md` — deterministic issue
  inventory and bounded diagnostic/mitigation reference.
- `reference/musd-system.md`
- `reference/musd-borrowing.md`
- `reference/musd-redemptions.md`
- `reference/transaction-lifecycle.md`
- `reference/bridges/musd-ntt.md` — verified route evidence and completion
  semantics; no route support promise yet.
- `reference/bridges/native-bridge.md` — deployed v12 Native Bridge lifecycle,
  asymmetric delivery proof, and current release gates.
- `reference/incentives/current-evidence.md` — deployed incentives topology,
  executable-source reproduction boundary, and scoped lock/vote/boost model.

Reference pages derive from canonical knowledge. If a reference conflicts with
its cited source/deployment evidence, correct the canonical projection and
regenerate/update the derived page; do not treat the page as independent proof.

## Troubleshooting

- `troubleshooting/testnet-rpc-history.md`
- `troubleshooting/musd-borrowing-capacity.md`
- `troubleshooting/musd-fee-documentation-drift.md`
- `troubleshooting/deployment-documentation-drift.md`

Troubleshooting pages explain diagnosis and mitigation. Underlying network,
deployment, protocol, and transaction facts remain owned under `../knowledge/`.

## Application integration

- `guides/EXTERNAL_APPLICATIONS.md`
- `decisions/0020-redemption-output-simulation.md` — explicit redemption output simulation.
- `decisions/0021-incentives-locks-and-voting.md` — ordinary escrow locks and separate voting domains.
