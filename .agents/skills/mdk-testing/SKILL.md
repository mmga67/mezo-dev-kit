---
name: mdk-testing
description: Design, implement, review, or diagnose meaningful MDK tests using the repository testing standard and Vitest default. Use for test strategy, test-code changes, regression coverage, edge-case analysis, fixtures, mocks, or flaky tests; pair with the owning domain skill for protocol-sensitive behavior.
---

# MDK testing

## Purpose

Turn behavior and risk into deterministic evidence. Avoid tests that only
exercise lines, duplicate implementation details, or satisfy a count.

## Required context

1. Read the root and nearest nested `AGENTS.md`, active task, owning package
   documentation, and [`docs/standards/testing.md`](../../../docs/standards/testing.md).
2. Inspect the changed behavior, public/owned boundary, existing tests, and
   exact package commands before editing.
3. Load the owning domain skill for protocol, transaction, financial,
   deployment, or cross-chain behavior.

## Procedure

1. State the observable contract, invariants, side effects, and failure
   classifications at risk.
2. Build a small coverage matrix from applicable nominal, boundary, malformed,
   missing, repeated, ordering, partial-failure, and compatibility partitions.
   Omit categories that do not change semantics.
3. Choose the narrowest useful layer. Use pure/model tests for deterministic
   rules, typed fakes for owned ports, and integration tests only for real
   boundaries the narrower layer cannot prove.
4. Write the failing regression first for a reproduced defect. For new
   behavior, make every test name describe the scenario and observable result.
5. Use explicit Vitest imports and isolated fresh state. Prefer `test.for` for
   meaningful input tables; inject clocks, transports, registries, signers, and
   randomness instead of relying on globals or sleeps.
6. Assert stable results and error identity/context. Also assert call order,
   exact call identity, call counts, and forbidden side effects when those are
   part of the safety contract.
7. Keep fixtures realistic but synthetic. Do not copy canonical addresses,
   ABIs, or protocol facts into generic fixtures, and do not let runtime source
   depend on test helpers.
8. Run the targeted suite, affected package checks, and any required
   integration/model drift check. Include test source in the package typecheck
   when the approved compiler/toolchain exists; Vitest execution alone does not
   prove test types. Use a reproducibly seeded shuffled run when shared state or
   ordering is a plausible failure mode.
9. Review whether each test would fail for the intended regression. Remove
   redundant tests that add maintenance cost without distinguishing behavior.

## Boundaries

- Vitest is the TypeScript package default; follow a documented owning-tool or
  established-application exception rather than forcing it across ecosystems.
- Coverage is diagnostic. Do not invent or lower a percentage target to make a
  task pass.
- Do not enable a browser/DOM environment, install a coverage provider, or add
  another test dependency without demonstrated need and dependency approval.
- Never perform a live value-bearing write as a test shortcut.

## Stop conditions

Stop for direction when the expected behavior or protocol evidence is
ambiguous, the only test requires unsafe external mutation, a new dependency
or environment is unapproved, or a flaky test cannot be made reproducible
without changing the claimed behavior.

## Common failure modes

- Happy-path-only tests around validation, units, time, or state transitions.
- Asserting an error occurred without checking its stable class and context.
- Mocks that return shapes the real boundary cannot produce.
- Shared state, leaked timers/stubs, unseeded randomness, sleeps, or retries
  that hide nondeterminism.
- Large snapshots or coverage numbers used in place of semantic assertions.
- Unit tests presented as evidence for encoding, RPC, built-artifact, browser,
  or framework integration.
