# Changelog

Notable changes to the Mezo Developer Kit source, newest first. Entries describe
GitHub source updates; private workspace versions are not package releases or
compatibility promises. Earlier history remains available in Git.

## Unreleased

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
