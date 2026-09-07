# Testing standard

## Status and scope

This standard is the normative owner for authored MDK test design and test-code
conventions. It applies to TypeScript packages, package-level tooling,
templates, examples, and generated application defaults. Solidity and an
established external application stack may use their owning ecosystem's test
tool, but must preserve the quality and verification rules below.

[ADR-0010](../decisions/0010-vitest-default-testing.md) selects Vitest as the
default TypeScript test framework. Package documentation owns exact commands
and environment-specific configuration.

## What tests must prove

Tests are evidence for behavior and risk controls, not a deliverable count.
For each changed behavior, identify its observable contract and cover the
applicable partitions:

- a representative nominal outcome;
- boundaries immediately below, at, and above a limit when those values have
  different semantics;
- empty, singleton, repeated, duplicate, or many-item inputs when collection
  shape matters;
- malformed, missing, wrong-type, unsupported, or stale external input;
- deterministic failure classes and their retry/terminal distinctions;
- state transitions, ordering, idempotency, and repeated invocation;
- observable side effects, including proof that forbidden calls or writes did
  not occur;
- compatibility behavior at a public, generated, provider, or package
  boundary.

Only applicable partitions are required. Do not add redundant examples merely
to increase a test or coverage count. When a defect is fixed, first add the
smallest regression case that fails for the demonstrated reason, then retain it
if it protects a durable behavior or boundary.

Protocol-sensitive and financial code also considers zero, one smallest unit,
largest supported or realistically adversarial integers, precision and
rounding boundaries, before/at/after time or block thresholds, partial reads,
chain mismatch, revert versus transport failure, timeout, duplicate
submission, receipt ambiguity, reorg/replacement, and reconciliation. Select
from this list based on the actual operation; it is not a test quota.

## Test layers

Use the narrowest layer that proves the claim, and add a wider layer when the
changed boundary requires it:

1. Pure unit/model tests prove calculations, validation, state machines, and
   invariants without transport or global state.
2. Component/package tests prove collaboration through public or deliberately
   internal package boundaries with deterministic fakes.
3. Integration tests prove encoding, adapter, built-artifact, RPC, database,
   or framework boundaries in an approved local or test environment.
4. End-to-end tests prove only critical supported workflows whose failure
   cannot be exposed reliably at a narrower layer.

Unit tests do not prove an external integration. Integration tests do not
replace exact model and boundary tests. Never use a mainnet write or funded
account as a convenient verification shortcut.

## Vitest conventions

- Use `.test.ts` or `.test.tsx` and import APIs explicitly from `vitest`; do
  not enable test globals by default.
- Once a package has the approved TypeScript compiler/toolchain, include test
  and test-configuration source in its TypeScript check. Vitest transforms
  TypeScript for execution but does not replace static typechecking.
- Default package tests to the environment they actually support. Use `node`
  for framework-independent packages and add a DOM/browser environment only
  when behavior requires it.
- Preserve file isolation. Create fresh mutable fakes/fixtures per test and
  clean up spies, mocks, timers, globals, environment variables, files,
  sockets, and processes.
- Configure mock-history cleanup, spy restoration, and environment/global-stub
  restoration. Concurrent tests must not share mutable mocks whose cleanup can
  race another test.
- Prefer typed injected fakes at owned ports. Mock third-party/module/global
  boundaries only when dependency injection cannot express the behavior.
- Use table-driven tests (`test.for`) when the same rule has multiple meaningful
  input partitions. Keep the case label and expected result readable.
- Use deterministic clocks, block coordinates, hashes, addresses, and seeded
  randomness. A randomized/property test must report a reproducible seed and
  retain a minimized regression case for a discovered defect.
- Assert returned state and relevant side effects. For failures, assert the
  stable error identity and actionable context, not only message prose.
- Use snapshots only for deliberately stable serialized output where a focused
  semantic assertion would be less clear. Review snapshot changes as behavior
  changes; never use a large snapshot to avoid understanding the output.
- Do not commit `.only`, silently skipped tests, unbounded retries, or sleeps.
  A skip must name its external blocker and remain visible in task/review state.

A package config should normally make the isolation policy explicit:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
```

Package needs may refine this config. Record why when disabling isolation or
cleanup, sharing workers/fixtures, enabling concurrency, changing the runtime
environment, or adding setup files.

## Test data and fixtures

Keep synthetic fixtures small, named, and obviously non-production. A fixture
represents a meaningful equivalence class or boundary; unexplained random
constants obscure intent. Builders should require or visibly default fields
that affect behavior.

Canonical knowledge may be read by conformance/model tests, but runtime source
must not import test fixtures or repository knowledge. Pin live observations
by network and block when integration evidence depends on chain state, and do
not copy addresses, ABIs, or protocol facts into generic test utilities.

Prefer real serialization/validation at the boundary under test. Avoid mocks
that duplicate the implementation algorithm or return impossible provider
shapes, because they can make both production code and tests agree on the same
mistake.

## Coverage and review

Coverage reports locate unexercised code; they do not establish correctness.
No repository-wide percentage or automatic threshold increase is defined.
When a package adopts coverage, include all owned source files deliberately,
exclude only justified generated or unreachable material, and set thresholds
from a reviewed baseline without weakening them merely to pass.

Review changed tests for:

- a clear link between requirement/risk and assertion;
- meaningful edge partitions and failure classifications;
- deterministic, isolated setup and complete cleanup;
- assertions against behavior rather than implementation trivia;
- negative side-effect and ordering checks where safety depends on them;
- tests that would fail for the intended regression, not only for unrelated
  exceptions;
- the appropriate wider integration or built-artifact check.

Run the package's normal suite, then use a seeded shuffled run when order
dependence is plausible. Report exact commands and outcomes, including skipped
or unavailable checks.

## Upstream basis

This standard was established against the stable Vitest 4.1 line and its
official [release history](https://github.com/vitest-dev/vitest/releases),
[writing tests](https://vitest.dev/guide/learn/writing-tests),
[mocking](https://vitest.dev/guide/mocking),
[configuration](https://vitest.dev/config/), and
[coverage](https://vitest.dev/guide/coverage). Re-check the migration guide,
Node/Vite requirements, security advisories, and configuration defaults before
a Vitest upgrade.
