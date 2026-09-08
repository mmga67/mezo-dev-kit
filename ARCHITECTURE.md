# Mezo Developer Kit Architecture

[ADR-0015](docs/decisions/0015-direct-borrowing-execution.md) adds the private
direct MUSD borrowing implementation: curated operation ABIs in Contracts,
scalar ABI codecs in EVM, explicit execution and RPC adapters in Core, and
borrower semantics in musd-borrowing. Qualified protocol review and publication
remain separate from implementation acceptance.

## Status and Authority

This document defines the current repository architecture for Mezo Developer
Kit (MDK). It owns package boundaries, dependency direction, public design
constraints, and the relationship between code, knowledge, and agent process.

MDK remains documentation- and evidence-first. Directory names describe
intended ownership; they do not imply that a package, API, workflow, or
deployment is implemented or supported. Each decision under
[`docs/decisions/`](./docs/decisions/) carries its own current status and
acceptance/release gates.

`packages/chains/`, `packages/contracts/`, and `packages/core/` now contain the
private foundational read implementation for the GitHub source alpha.
Chains and Contracts consume deterministic projections of accepted canonical
knowledge; Core exposes a provider-neutral, block-consistent read client through
a built workspace entrypoint. The ADR-0002/0003 transaction execution
proof remains tested inside Core but is neither exported nor emitted. The
maintainer accepted foundational SDK review on 2026-09-06 for the source alpha. These private
packages provide the foundation for protocol readers. ADR-0015 extends them
with execution and direct borrowing; registry distribution remains separate.

ADR-0016 extends the existing Savings, lending and vault owners with private
writers. `packages/tokens/` owns reusable exact approval workflows; the new
`packages/protocols/incentives/` owns gauge staking and streamed rewards used
by both Savings and Vault. Both depend only on the public foundational
packages (Incentives also uses Tokens); neither depends on a consumer protocol.
Vault continues to compose Lending. Discovered target roles are verified by
their domain and resolved through an explicit Core execution port.

`packages/evm/` provides the shared typed value and exact-conversion layer
beneath these packages. Its public workspace API and pinned Ox implementation
follow ADR-0014; callers retain network, protocol, and domain error ownership.

`packages/protocols/musd-savings/` contains the Savings reader
above that foundation. It owns Savings accounting and staged same-block role
reconciliation, consumes public Chains/Contracts/Core entrypoints, and accepts
application-owned transport and codec ports. Generated role interfaces derive
from proposed, exact-runtime Contracts templates without adding static
registry identities. The maintainer accepted the bounded reader/interface review for Savings reader review on
2026-09-07. Wider deployment support remains proposed.

`packages/protocols/musdc-lending/` adds the mainnet market reader and
exact debt/share/interest/health calculations above the same public foundation.
Its generated market, asset, and runtime inputs retain Lending, Bridges,
Contracts, and Prices ownership. A timestamped, normalized oracle observation
is required for nonzero-debt health; transport and codec ports remain explicit.

`packages/protocols/usdc-lending-vault/` adds the depositor reader. It
consumes the public lending reader for the adapter position and owns VaultV2
fee-aware previews, wrapper high-water yield, receipt ownership, and gauge
reconciliation. VaultV2/VaultGauge are discovered exact-runtime roles, while
the adapter/wrapper resolve through Contracts. The maintainer accepted both
private reader packages on 2026-09-07. Shared primitive validation now uses
EVM. ADR-0016 adds private protocol writers, while new static identities for discovered roles and package-registry release remain separate.

The versioned strategic design input is [`docs/manifest`](./docs/manifest), and
its dated improvements are recorded in
[`docs/manifest-changelog.md`](./docs/manifest-changelog.md). It does not
override accepted architecture, canonical knowledge, current code, or the
review gates owned by this repository.

## Goals

MDK provides a trustworthy, composable, agent-friendly environment for
building on Mezo. Early releases focus on EVM development and a small number of
evidence-backed, high-value workflows.

The architecture optimizes for:

- TypeScript-first SDK, tooling, framework, template, and application
  development with intentional types at package boundaries;
- one maintained owner for every durable fact and public behavior;
- small packages with explicit responsibilities and dependency direction;
- framework-independent execution and protocol logic;
- deterministic calculations separated from RPC, wallets, UI, and storage;
- evidence-backed network, deployment, ABI, and protocol records;
- replaceable tooling, transports, framework adapters, and memory providers;
- reproducible verification for humans and coding agents.

## Non-Goals

MDK is not currently:

- a node or consensus-client SDK;
- a hosted RPC, indexer, database, or application backend;
- a general UI component system;
- a replacement for contract audits or protocol due diligence;
- a promise to support every Mezo or cross-chain workflow;
- an application monorepo for production products;
- a released set of SDK packages merely because package directories exist.

Production applications normally live in separate repositories and consume
published MDK interfaces. Local `examples/` and `templates/` exist to prove and
bootstrap that external developer experience.

### Residual candidate scope

The knowledge migration knowledge-migration program did not turn every discovered product
theme into an MDK domain. The current disposition is:

| Candidate theme                      | Current disposition                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External-lending integrations        | Defer to a separately approved protocol/integration task; do not merge external venue accounting into the Mezo-native mUSDC market or USDC Lending Vault owners.                      |
| ve-asset marketplace or OTC behavior | Defer to separately approved scope with authoritative deployed evidence; incentives owns voting/locking behavior, not a marketplace.                                                  |
| Arbitrage or price-impact analytics  | Exclude product strategy and forecasts from protocol knowledge. Prices may classify a datum and swaps may own an amount-specific quote, but neither owns an arbitrage recommendation. |
| Portfolio strategy                   | Exclude as application/analytics policy; protocol modules expose bounded facts and deterministic rules, not allocation advice.                                                        |
| Wallet analytics                     | Exclude as application/analytics behavior; future public readers may supply typed inputs without making wallet profiling canonical knowledge.                                         |
| Hosted application infrastructure    | Exclude from MDK architecture; storage, indexing vendors, schedulers, and backends remain replaceable application choices.                                                            |
| UI behavior                          | Exclude application-specific UI and state policy; framework adapters consume public protocol APIs without redefining them.                                                            |
| Deployment operations                | Defer to separately approved CLI/Hardhat/Foundry and release-security work; no deployment writer or operational runbook is implied by planned package directories.                    |

These are current scope decisions, not permanent rejection of future work. A
human-approved task must establish the owner, evidence, security boundary, and
support goal before any deferred theme enters the roadmap.

## TypeScript-First Implementation

TypeScript is the default implementation language for MDK product code and the
applications MDK generates or documents. This applies to SDK/runtime packages,
protocol modules, CLI code, framework adapters, tests, examples, templates,
and generated runtime source. React source uses TSX when it contains JSX.

Package boundaries must preserve useful TypeScript types instead of exposing
untyped objects and provider-specific values. Runtime validation remains
required at external boundaries; static types do not replace chain checks,
schema validation, unit validation, or protocol reconciliation.

The language boundary is intentional:

- EVM contracts remain Solidity;
- canonical knowledge, schemas, evidence, and documentation remain JSON,
  Markdown, or their owning data format;
- tool-constrained configuration or scripts may use another language only
  when required by that tool or execution boundary, with a narrow documented
  exception;
- maintained repository automation is TypeScript; tool-constrained
  configuration may remain in another language only through the narrow
  exception above.

[ADR-0007](./docs/decisions/0007-typescript-first.md) owns the language
decision. [ADR-0010](./docs/decisions/0010-vitest-default-testing.md)
separately selects Vitest as the default TypeScript package test framework.
The accepted [ADR-0012](./docs/decisions/0012-coding-standard-and-quality-gates.md)
selects Node 24 as the development baseline plus the exact compiler, typed
linter, formatter, declaration, and local quality-gate model. The normative
authored-code rules live in
[`docs/standards/coding.md`](./docs/standards/coding.md).

The root `package.json` and `pnpm-workspace.yaml` select and version the
approved development toolchain. This does not satisfy the separate public
release-security, packed-artifact, compatibility, or support gates.

## System Model

MDK has three coordinated systems:

```text
CODE                         KNOWLEDGE                    PROCESS
packages                     knowledge                   tasks
tooling                      docs                        reviews
templates and examples       skills                      agent instructions
                             memory
```

They evolve together, but their authority is different:

```text
authoritative external source / deployed evidence
                         ↓
validated canonical knowledge and registry inputs
                         ↓
generated data, package behavior, reference docs, and skills
                         ↓
adapters, templates, examples, and external applications
```

Memory helps agents retrieve context. It is not part of the runtime package
graph and never outranks current evidence, canonical knowledge, architecture,
or code.

## Repository Areas

| Area                                     | Owns                                                                                                                                                                          | Must not own                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/evm/`                          | Shared EVM value validation, checksum policy, exact conversions, and scalar ABI codecs; see ADR-0014 and ADR-0015                                                             | Network/deployment facts, protocol policy, provider clients, signers, and localized presentation                 |
| `packages/chains/`                       | Typed accepted network identity and capability profiles generated from canonical inputs                                                                                       | RPC endpoints, provider selection, protocol behavior, or application policy                                      |
| `packages/contracts/`                    | Stable contract IDs, deployment resolution, read-safe and curated operation ABI projections, runtime identity, digests, provenance, and freshness; depends on Chains identity | Protocol workflows, provider behavior, copied application addresses, or transaction execution                    |
| `packages/core/`                         | Framework-independent block-consistent reads, explicit RPC/signer adapters, simulation, submission intent, receipt observation, and reconciliation coordination; see ADR-0015 | Protocol-specific rules, RPC endpoint selection, wallet UI, React, storage implementations, or application state |
| `packages/protocols/`                    | Protocol modules, workflow preconditions, quotes, reconciliation rules, and pure domain calculations                                                                          | Framework state, UI, or hidden transport configuration                                                           |
| `packages/react/`                        | React adapters over public core and protocol APIs                                                                                                                             | Independent protocol implementations                                                                             |
| `packages/hardhat/`, `packages/foundry/` | Tool-specific adapters and development workflows                                                                                                                              | Canonical network, address, ABI, or protocol facts                                                               |
| `packages/cli/`                          | Discovery, creation, inspection, validation, and maintenance commands over public MDK capabilities                                                                            | A competing runtime implementation                                                                               |
| `packages/test-utils/`                   | Reusable deterministic fixtures and test clients                                                                                                                              | Production behavior or canonical facts                                                                           |
| `extensions/`                            | Ecosystem integrations composed from public packages                                                                                                                          | Forked or duplicated MDK internals                                                                               |
| `templates/`, `examples/`                | Tested starting points and focused usage demonstrations                                                                                                                       | Canonical facts or private package imports                                                                       |
| `knowledge/`                             | Validated, evidence-linked Mezo facts and bootstrap registry inputs                                                                                                           | Procedures, task history, or unsupported narrative                                                               |
| `docs/`                                  | Architecture, ADRs, guides, derived reference, and troubleshooting explanations                                                                                               | Independent copies of volatile facts                                                                             |
| `agents/`                                | Contributor and consumer skills, memory policy/adapters, and evals                                                                                                            | Runtime package requirements or canonical protocol facts                                                         |

Create a package only when a real vertical slice gives it a clear
responsibility, consumer, and verification path. Empty planned directories are
not public architecture commitments.

## Dependency Direction

Runtime dependencies flow toward consumers:

```text
evm value primitives (available to all higher layers)
  ↓
chains
  ↓
contracts
  ↓
core
  ↓
protocol packages
  ↓
framework and tool adapters
  ↓
templates, examples, external applications
```

The following rules apply:

- product packages and their tests use TypeScript unless an accepted
  architecture decision defines a narrower interoperability exception;
- Contracts consumes the public Chains identity boundary so it cannot invent
  or duplicate network IDs; neither package selects an RPC provider;
- lower layers never import framework, template, example, or application code;
- EVM primitive consumers use the public `@mezo-dev-kit/evm` entrypoint and
  declare that dependency; the foundation imports no other MDK package.
  [ADR-0014](./docs/decisions/0014-evm-value-foundation.md) owns this addition.
- core and protocol logic remain framework-independent;
- adapters consume public lower-layer APIs instead of reimplementing behavior;
- the CLI may orchestrate public package APIs but does not become their owner;
- test utilities may support packages but production packages must not depend
  on test-only behavior;
- runtime packages must not depend on agent skills, memory providers, tasks, or
  documentation tooling;
- package cycles are not allowed;
- applications and persistence remain outside the core dependency graph.

## Domain and Public API Rules

### Explicit boundaries

Dependencies and configuration are passed explicitly. Hidden global clients,
wallets, registries, mutable singletons, and implicit network selection are not
allowed in core or protocol APIs.

Place behavior with the domain that defines its semantics. Avoid generic
`utils`, `helpers`, `common`, or vague service layers that combine unrelated
responsibilities. Shared abstractions should follow demonstrated reuse rather
than anticipated reuse.

### Pure domain logic

Financial and deterministic protocol calculations accept typed values and do
not perform RPC calls, read wallet state, access React, use storage, or depend
on global configuration. Units, precision, rounding, caps, and invalid states
must be explicit and tested at boundaries.

### Reads

A logical read that combines multiple values must expose or establish its
consistency coordinate, normally a block number. Required and optional failures
must remain distinguishable; partial transport failure must not silently become
zero, `false`, or empty protocol state.

### Writes

No write surface may treat a transaction hash as successful protocol state.
Write workflows must validate inputs and chain/account context, resolve the
intended deployment, simulate the exact call, submit safely, inspect receipt
outcome, and reconcile protocol state as the domain requires.

The core-client responsibility boundary and transaction semantics are accepted in
[ADR-0002](./docs/decisions/0002-core-client-model.md) and
[ADR-0003](./docs/decisions/0003-transaction-lifecycle.md). No dependency,
public package API, or writer implementation is accepted by those decisions
alone. [ADR-0015](./docs/decisions/0015-direct-borrowing-execution.md) accepts
the private direct borrowing implementation and its explicit Core execution
surface; qualified protocol review remains required before release.

### Errors and observability

Public boundaries use typed, actionable errors rather than raw provider
strings as the only contract. Libraries must not silently swallow errors.
Debug output is opt-in, structured, useful for reproducing encoded calls, and
redacts secrets and private data.

## Networks, Contracts, and Protocol Knowledge

`knowledge/` is the current canonical retrieval owner for evidence-backed Mezo
facts. Canonical means maintained owner, not self-authenticating truth.

For deployed behavior, block-pinned state and bytecode plus version-matched
verified source outrank descriptive prose. Records must retain exact scope,
source identity, verification coordinates, limitations, and review status.
Conflicts are preserved as evidence gaps or discrepancies rather than averaged
away.

Network identity is separate from RPC-provider availability. Contract records
use stable identifiers and own addresses, proxy/implementation history, ABIs,
digests, activation ranges, and provenance. Protocol and workflow domains
reference those identifiers rather than copying volatile data.

Bootstrap contract-registry knowledge ownership is accepted in
[ADR-0001](./docs/decisions/0001-contract-registry-bootstrap-ownership.md).
Additional provenance classes are accepted in
[ADR-0005](./docs/decisions/0005-contract-evidence-provenance-classes.md).
External EVM network profiles for the bounded Ethereum/Base scope are accepted in
[ADR-0004](./docs/decisions/0004-external-evm-network-records.md).

[ADR-0009](./docs/decisions/0009-oracle-price-source-ownership.md) establishes
`prices` as the provider-neutral owner for source/feed identity and typed
datum, scaling, confidence, freshness, disagreement, and fallback-result
semantics. Prices depends on Networks and Contracts. Protocol consumers may
reference Prices while retaining protocol-specific consumption semantics;
Pools retains DEX math, routing retains execution quotes, and analytics retains
stored projections. A source-class change is always explicit.

[ADR-0006](./docs/decisions/0006-knowledge-module-architecture.md) establishes
the universal v0.4 module contract: human README, machine index, role-based content
directories, a common lifecycle envelope, stable logical references, and
separate structural/semantic validation. The detailed workflow is in
[`docs/standards/knowledge-management.md`](./docs/standards/knowledge-management.md).
The root catalog at [`knowledge/index.json`](./knowledge/index.json) discovers
all maintained modules. The repository-wide cutover was accepted under
knowledge architecture acceptance's architecture and qualified Level 3 review on 2026-08-21: all modules
use v0.4, every maintained resource is indexed by role, and cross-domain
identity uses logical references. Child-module lifecycle fields remain
authoritative; catalog membership does not promote support or review.

[ADR-0011](./docs/decisions/0011-economic-system-composition-ownership.md)
establishes composition ownership for the current Mezo economic system. It
keeps classic MUSD, MUSD Savings, mUSDC lending, the USDC Lending Vault, pools,
and incentives as distinct accounting owners connected by stable logical
references. The human map is
[`docs/architecture/mezo-economic-system-composition.md`](./docs/architecture/mezo-economic-system-composition.md).

## Generated Outputs

Generated data, bindings, and reference material derive from canonical inputs.
They are not manually maintained when a generator exists.

Generators should be deterministic and record their input identity or digest
where practical. Verification must reject invalid canonical inputs and drift
between inputs and generated outputs. Templates, examples, docs, and agent
guidance must not become independent address or ABI stores.

## Agent Guidance and Memory

Root and nested `AGENTS.md` files route work and define operating constraints.
Skills define reusable procedures. Neither owns protocol data.

Keep persistent instructions compact and retrieve task-specific detail through
existing canonical owners. Reuse current context and revisit only changed
inputs; skill cross-references do not restart assessment or load every domain.
Measure source footprint separately from runtime token/cache usage and retain
the behavioral quality gates in the contributor evaluation guide.

Maintained agent guidance is authored under [`agents/`](./agents/). Contributor
and consumer skills are separate audiences, while agent discovery directories
are materialized installation views rather than canonical sources. The
repository-root `.agents/` tree is ignored local output and is absent from
fresh source checkouts; contributors install it explicitly using the
[agent setup guide](./docs/guides/CONTRIBUTOR_AGENT_SETUP.md). The
portable skill profile and optional MCP boundary are defined under
[ADR-0008](./docs/decisions/0008-portable-agent-skill-distribution.md); the ADR
is accepted as the repository's distribution model but does not by itself
establish a released integration.

Knowledge maintenance is routed by `knowledge/AGENTS.md` to the shared
knowledge-maintenance skill and the relevant domain skill. Human maintenance
policy remains outside automatically scoped instructions in the accepted
knowledge-management standard.

Memory follows the provider-neutral contract in
[`agents/memory/README.md`](./agents/memory/README.md):

```text
session discovery
→ local memory
→ optional curated shared memory
→ verification
→ knowledge / docs / ADR / code
→ memory retained as a pointer, promoted, or deprecated
```

The repository must work when an external memory provider is absent. Provider
state, embeddings, indexes, credentials, and local investigation memory stay
outside Git. Shared seed memory must be small, reviewed, source-linked, and
free of secrets or personal data.

## Testing and Release Boundaries

[`docs/standards/testing.md`](./docs/standards/testing.md) owns repository test
design and test-code conventions. Vitest is the default for TypeScript package
tests, with explicit imports, environment-appropriate configuration, isolated
state, and cleanup. Tests are selected from observable behavior, invariants,
boundaries, failure classes, ordering, and side effects rather than a test-count
or coverage quota. Standalone bootstrap automation can retain Node's built-in
runner until its owning toolchain migration; that is a bounded exception, not
an equal package default.

Verification is proportional to risk:

- Level 1: changed documentation/examples plus applicable formatting, link, or
  generated-reference checks;
- Level 2: targeted tests, type/lint/build checks, and integration verification
  at changed boundaries;
- Level 3: authoritative evidence, deterministic tests, integration evidence,
  failure/compatibility review, and qualified human review.

Public packages must eventually pass typechecking and declaration/build checks,
then be tested as built artifacts outside workspace aliases. A supported
vertical slice includes implementation, tests, integration verification,
docs, an example, agent guidance, and a knowledge/memory decision.
Protocol-sensitive releases also require evidence, registry verification, and
the review defined by
[`SECURITY.md`](./SECURITY.md).

At the current bootstrap stage, validated knowledge marked proposed is review
material, not a released support promise.

## Architecture Changes

Use a task for architectural, multi-package, migration, public-interface, or
protocol-sensitive work. A change to dependency direction, domain ownership,
public API policy, registry ownership, transaction semantics, or security
boundary requires an ADR or an explicit revision to an existing accepted
decision.

An ADR must state context, decision, alternatives, consequences, status, and
acceptance gate. Proposed ADRs inform implementation planning but do not
establish released interfaces. Update this file in the same change when an
accepted decision changes the repository-wide model.

ADR-0017 implements `packages/prices/` for explicit normalization, confidence,
freshness and a direct mainnet Skip observation. Borrowing and Lending reuse
its pure helpers while retaining protocol oracle paths. Prices depends on
EVM, Chains, Contracts and Core; Core has no Prices dependency. Core also owns
bounded raw event scans, coverage and checkpoint candidates. Applications own
atomic persistence and protocols own required joins and outcome semantics.

The private basic-pool slice adds `@mezo-dev-kit/pools` (depends on EVM, Chains,
Contracts, Core and Tokens) and `@mezo-dev-kit/swaps` (those shared boundaries plus
Pools). Pools owns verified dynamic discovery, wallet liquidity and LP fee
accounting. Swaps owns bounded basic quotes and exact-input route outcomes. The
initial writer assets are MUSD/mUSDC; broader basic routes remain observations
until token behavior qualifies. [ADR-0018](docs/decisions/0018-basic-pools-and-swaps.md)
records the operation, simulation and reconciliation boundaries. Canonical
support and publication remain subject to qualified review.

`@mezo-dev-kit/musd-institutional-debt` owns private Enclave/position readers and
institutional fee, repayment and health calculations. It depends on EVM, Chains,
Contracts and Core. Requested position/authority subsets carry explicit coverage;
independent aggregate accounting stays separate from classic borrowing. See
[ADR-0019](docs/decisions/0019-institutional-debt-reads.md). No partner writer or
custody/product backing metric is introduced.

`@mezo-dev-kit/musd-redemptions` composes Borrowing's verified state with bounded
queue/hint discovery, redemption math, an explicit output simulator and direct
execution/reconciliation. [ADR-0020](./docs/decisions/0020-redemption-output-simulation.md)
owns the required exact-call trace boundary and preflight-only output policy.
Core supplies pinned native balance reads and validated EVM receipt execution fees;
the domain owns their effect on protocol and wallet accounting.

[ADR-0021](./docs/decisions/0021-incentives-locks-and-voting.md) extends Incentives
with ordinary veBTC/veMEZO lock workflows and deterministic boost, epoch and vote
allocation inputs. Bounded escrow reads distinguish direct custody, locked supply,
stored boost and current voting power. The existing dependency direction is
unchanged. Pool, boost and validator voting remain independently qualified paths.
