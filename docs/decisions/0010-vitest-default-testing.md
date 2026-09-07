# ADR-0010 — Vitest as the default TypeScript test framework

- Status: Accepted
- Date: 2026-08-23

## Context

ADR-0007 made MDK TypeScript-first but deliberately left the test framework
unselected. The private core proof therefore used Node's built-in test runner
to avoid choosing a dependency by implication. As the first package-level
implementation, core is the smallest place to establish the intended test
developer experience before more packages, templates, and examples copy the
bootstrap pattern.

The repository also lacked one owner for test quality. Risk-level guidance
required targeted or deterministic tests, but did not define how contributors
should select behavioral partitions, boundaries, failure modes, state
invariants, or negative side effects. A runner migration without those rules
would improve syntax while leaving test quality ambiguous.

## Decision

Vitest is the default framework for authored TypeScript tests in MDK packages.
New TypeScript packages, package-level tooling, templates, examples, and
MDK-generated applications use Vitest unless an established ecosystem or
tooling boundary requires a documented exception.

The detailed normative policy is owned by
[`docs/standards/testing.md`](../standards/testing.md). It requires tests to be
selected from behavior and risk rather than quotas. Relevant nominal,
boundary, invalid, failure, ordering, and side-effect cases must be covered;
irrelevant categories do not require padding tests.

Vitest remains a development dependency. Production packages do not import it
or depend on test-only utilities. Package configuration keeps globals disabled
and tests isolated, with explicit cleanup for mocks and environment/global
stubs. Coverage is diagnostic evidence, not a substitute for behavioral
assertions, and no repository-wide percentage is accepted by this decision.

Standalone bootstrap/maintenance scripts may retain Node's built-in runner
until they move into an approved package/workspace toolchain. Such existing
exceptions do not establish an equal default for new package tests.

## Consequences

- `packages/core` is the first adoption and retains no Vitest runtime
  dependency or live integration.
- Contributors load the focused testing skill when test behavior, strategy, or
  review is in scope.
- Test configuration and exact commands remain package-owned so environments
  can differ deliberately without a hidden global setup.
- A future root workspace, supported package manager/runtime matrix, browser
  test environment, coverage provider, or public release still requires its
  own scoped approval and verification.
- Vitest upgrades review the current migration guide, runtime requirements,
  advisories, and lockfile impact rather than following an unbounded range.

## Rejected Alternatives

- Keeping the runner unspecified and allowing each new package to choose.
- Treating test count or line coverage as the primary quality target.
- Migrating every standalone repository script as part of the first package
  adoption.
- Adopting a prerelease Vitest major or enabling browser/UI surfaces without a
  demonstrated test need.

## Acceptance and Release Gate

The maintainer selected Vitest as MDK's default on 2026-08-23. testing standard review records
the standard, contributor skill, dependency review, core migration, edge-case
suite, and verification.

This decision does not approve a public package release. Before release,
maintainers still approve and verify the supported Node/package-manager
versions and the complete compile, typecheck, lint, build, declaration,
artifact, and integration toolchain.
