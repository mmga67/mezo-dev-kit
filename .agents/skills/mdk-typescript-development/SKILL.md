---
name: mdk-typescript-development
description: Implement or review MDK TypeScript packages, tooling, examples, templates and generated code. Use for authored contributor code; external apps use consumer guidance.
---

# TypeScript development

## Purpose

Keep MDK implementation and application guidance TypeScript-first while
preserving domain boundaries, runtime safety, and the repository's explicit
dependency-approval rules.

## Required context

1. Reuse the active task and current root/nearest instructions already loaded.
   Inspect the owning package's documentation and affected source.
2. Consult the applicable `ARCHITECTURE.md` boundary when imports, exports,
   ownership, or package structure are involved. Read ADR-0007 only for a
   language-boundary decision, and ADR-0012 for toolchain changes.
3. Read the applicable sections of `docs/standards/coding.md`; it owns modular
   design, TypeScript, public APIs, errors, async work, formatting,
   suppressions, exceptions, and quality gates. The standard applies to all
   authored code; retrieval is scoped to the change, not a waiver of its rules.
4. Load the applicable domain skill and only the canonical knowledge needed by
   that domain.
   For package usage or capability changes, apply the root-routed
   `mdk-capability-assessment` first if it has not already been completed.
   Reuse current public workspace APIs and identify required injected ports
   before implementing an alternative.
5. When test behavior, fixtures, regressions, or review is in scope, load
   `agents/skills/mdk-testing/SKILL.md` and follow the testing standard.

Read each procedure/source once per relevant revision. A cross-reference does
not restart capability assessment or require rereading unchanged instructions.

## Procedure

1. Place behavior in the owning package and follow accepted dependency
   direction. Keep small packages flat; introduce layers only for real hidden
   decisions or one-way dependencies.
2. Author package/runtime, CLI, framework, test, template, and example source
   in `.ts`; use `.tsx` only where JSX is present.
3. Model domain identities, lifecycle variants, units, errors, and small
   consumer-owned ports explicitly. Curate package export maps; do not expose
   source-tree internals or provider-shaped types by accident.
4. Apply SOLID as behavioral change-isolation and substitutability guidance.
   Do not introduce classes, interfaces, layers, or plugin seams without a
   demonstrated responsibility or consumer.
5. Validate all untrusted runtime inputs. TypeScript types do not prove RPC,
   wallet, registry, generated, user, or protocol data.
   Reuse `@mezo-dev-kit/evm` for supported EVM values and exact conversions;
   read its package contract for checksum/precision policy and domain errors.
6. Keep deterministic calculations pure and use integer base units. Separate
   them from transport, wallet, framework, storage, and global state.
7. Generate TypeScript when generated source is consumed by TypeScript
   packages. Continue to resolve addresses, ABIs, networks, and protocol facts
   from their canonical owners rather than embedding copies in types.
8. Model errors, promise ownership, cancellation, timeout, retry,
   idempotency, cleanup, and diagnostics at the boundary where their semantics
   are known. Never hide a failure or detach a promise implicitly.
9. Reuse the approved local toolchain. Do not add a compiler, linter,
   formatter, bundler, client, or type utility dependency without explicit
   approval and dependency review.
10. Keep exceptions narrow and visible in the owning configuration with an
    owner, containment, compensating check, and removal condition.

## Verification

1. Run the owning package's typecheck, typed lint, format check, build or
   declaration check, and targeted tests as applicable.
2. Run `pnpm boundaries` when imports, exports, dependencies, or package
   structure change.
3. Run the root `pnpm check` when the change affects shared configuration,
   more than one package, templates/examples, or repository-wide behavior.
4. Verify generated drift and built/packed public entrypoints when those
   surfaces are in scope. Runtime execution is not typechecking.

## Boundaries

- Solidity owns EVM contract implementation.
- JSON, JSON Schema, Markdown, and evidence files retain their data/document
  formats.
- A tool-required configuration or script may use another language only for a
  concrete interoperability or execution constraint. Keep the exception local
  and document it.
- Tool-required non-TypeScript configuration must stay within its documented
  interoperability boundary and is not a model for package or application
  source.

## Stop conditions

Stop for direction when the work requires a new external dependency, a public
API or package-boundary decision outside the active task, a cross-package type
that violates ownership, a strictness/suppression exception without an
approved record, or a change to the supported runtime/toolchain matrix.

## Common failure modes

- Writing JavaScript first and promising a later TypeScript conversion.
- Treating inferred implementation types as a deliberate public API.
- Using `any` or casts to suppress a missing domain model or runtime check.
- Letting generated bindings become a second address, ABI, or deployment
  authority.
- Assuming passing runtime tests proves type correctness.
