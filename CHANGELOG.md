# Changelog

Notable changes to the Mezo Developer Kit source, newest first. Entries describe
GitHub source updates; private workspace versions are not package releases or
compatibility promises. Earlier history remains available in Git.

## Unreleased

- Added offline `context impact` reports and coordinated observed-change
  maintenance across knowledge, human guidance and skills. Reports distinguish
  declared dependencies, review candidates and unresolved coverage.
- Retained scoped Savings and incentives source-conflict reviews with pinned
  official documentation and a candidate Savings generation comparison.
- Added domain-owned economic relationships with accepted composition reviews
  and explicit evidence limits, a generated inventory, bridge/revenue review
  coverage and an optional consumer `economy`
  set. Bridge and incentive skills now load operation details selectively and
  retrieve parameters and capability state from their owners.

### Changed

- Established a [knowledge README standard](docs/standards/documentation.md#knowledge-readmes)
  and revised knowledge entry points to explain their subjects, guide useful
  next steps, and state practical limits. Shared review terminology lives in the
  knowledge overview; contributor policy defines qualified human review.
- Knowledge validators check structured review/support evidence without fixing
  the wording of authored README sentences.
- Added a contributor economic-system skill for explanations and architecture
  checks spanning custody, credit, products, revenue, voting, and emissions.
  Shared entry points now route whole-system questions to that procedure while
  retaining direct domain routes for narrow operations.
- Rebuilt the [Mezo economic system explanation](docs/architecture/mezo-economic-system-composition.md)
  around BTC custody, borrowing, and the Mezo Earn flywheel. The expanded map
  connects Native and Wormhole bridges, products, voting, and MEZO emissions;
  source links distinguish published architecture, dated asset restrictions,
  and MDK's narrower implementation coverage.
- Clarified the economic composition boundary in manifest v1.4.2, knowledge
  entry points, and contributor/consumer skills. Whole-system explanations now
  route to the sourced map; limited SDK coverage does not define Mezo's features,
  and conceptual questions do not inherit transaction-preparation checks.
- Consolidated project decisions and rationale into the [manifest](docs/manifest)
  and its detailed owners. Removed the separate decision collection and updated
  documentation, knowledge source pointers, and importers to use the baseline.

### Fixed

- Corrected generated knowledge references and review notes that described
  implemented private SDK readers or writers as absent. References now route
  implementation questions to package APIs and preserve separate evidence and
  release-review scopes. Savings entry points expose the recorded product/source
  conflict, and historical pool, vault and feed observations retain their dates.
- Repaired the Pools topology evidence's RPC endpoint reference and its capture
  output. Pool validation now checks endpoint resolution, network, and transport;
  historical observations and review dates are preserved.

## 2026-10-08

### Added

- An offline contributor amount exercise, source-reading guidance, enforced
  foundation/tooling dependency direction, and documentation/quality-inventory
  gates. Core's retained proof is now under `src/internal/proof/`; incentives
  formula validation has explicit stages without changing protocol calculations.
- Optional [application organization](docs/guides/APPLICATION_ARCHITECTURE.md)
  and [frontend recipes](docs/guides/FRONTEND_PATTERNS.md), a separately selectable
  architecture skill, and an [offline browser workbench](examples/browser-workbench/README.md)
  demonstrating exact display, account races and simulated recovery with existing tooling.
- Concise [local artifact rules](docs/guides/BRANCH_WORKFLOW.md#local-artifact-order)
  for placement, ownership, retention and cleanup, with gradual adoption for
  existing folders.

### Changed

- Renewed bounded bridge and swap evidence and recorded the accepted private
  workflow review scope. Historical observations, current-route limitations,
  and public route/writer release boundaries remain explicit.

### Fixed

- Corrected the MUSD NTT manager's `TransferSent` event metadata against its
  pinned Solidity interface and retained logs, preserving the original ABI
  artifact and adding source/digest and decoding regressions.
- Consumer reference bundles preserve literal Markdown links inside code examples
  without treating them as supporting-resource dependencies. Documentation review
  and regression checks now cover preservation of task-critical context.

## 2026-10-07

First changelog entry, covering changes since `fb17070`.

### Added

- A private `@mezo-dev-kit/evidence` candidate API for bounded, read-only network,
  contract runtime, Skip price, and incentive configuration observations, with
  explicit transport, clock, cancellation, and progress inputs.
- CLI `mdk evidence capabilities`, `refresh`, `inspect`, and `recover` commands,
  including durable reports, integrity checks, partial results, and cancellation.
  See the [evidence walkthrough](docs/guides/EVIDENCE_REFRESH.md).
- Staged oracle evidence promotion tooling that prepares reviewable changes and
  validates them before canonical application.
- Optional Docker runners for browser qualification and checksum-pinned Solidity
  source reproduction, with bounded execution and cleanup.
- Historical incentive ABI bindings and generation-aware validation that preserve
  earlier fixtures alongside the current contract registry.

### Changed

- Reworked examples into a cookbook with explicit application connections,
  supplied workflow inputs, focused operations, and borrowing preview and evidence
  collection examples. Start with the [cookbook setup](examples/SETUP.md).
- Renewed accepted, bounded mainnet evidence across Networks, Contracts, Prices,
  Incentives, Bridges, and Troubleshooting, and regenerated dependent SDK data
  and references. Current incentive records reflect the October 6 escrow
  generations while retaining historical observations.
- Made browser execution an optional qualification step beyond `pnpm check`.
  Use `pnpm check:browser` or `pnpm check:browser:container` for the additional suite.
- Updated frontend integration guidance, contributor skills, task completion
  conventions, and evidence maintenance documentation.

### Fixed

- Source-build comparison now selects the requested response from batched RPC
  JSON and rejects provider errors and mismatched runtime results.
- CLI artifact packing includes the runtime dependencies needed by the evidence
  commands in standalone distributions.

### Migration and scope

- Removed the examples console runner, local-fork fixture runtime, checkpoint
  helpers, and recipe/resume scripts. Use the documented cookbook functions with
  application-owned connections and recovery instead of the former
  `pnpm --filter @mezo-dev-kit/examples <recipe>` commands.
- Evidence capture does not accept canonical knowledge or authorize transactions.
  Candidate APIs, routes, and writers retain their existing review and release
  gates; this update does not publish packages to a registry. Recorded captures
  have bounded freshness and do not prove current live state.
