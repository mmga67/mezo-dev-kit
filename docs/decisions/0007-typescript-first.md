# ADR-0007 — TypeScript-first implementation

- Status: Accepted
- Date: 2026-08-21

## Context

MDK is intended to provide typed EVM SDK packages, protocol modules, framework
adapters, tooling, templates, examples, and agent guidance. The architecture
required typed public APIs but did not name a primary implementation language.
That omission allowed the private core proof to be authored as plain
JavaScript and left coding agents without a decisive language default.

Language ambiguity is especially costly in an agent-oriented developer kit:
it weakens API contracts, encourages incompatible examples and templates, and
makes generated bindings and framework adapters harder to compose.

## Decision

MDK is TypeScript-first.

- Authored product code under `packages/`, including SDK/runtime modules, CLI
  code, framework adapters, and tests, is TypeScript by default.
- Templates, examples, and application bootstrap guidance use TypeScript;
  React source uses TSX where JSX is required.
- Public package boundaries expose deliberate TypeScript types. Agents must
  not introduce plain JavaScript product code merely because it is faster to
  scaffold.
- Generated runtime source is TypeScript when it is consumed by TypeScript
  packages. Canonical JSON, schemas, Markdown, and evidence remain in their
  appropriate data/document formats.
- Solidity remains the language for EVM contracts. Tool-required configuration
  or scripts may use another language only when the owning tool or execution
  boundary requires it, and the exception must stay narrow and documented.

At acceptance, dependency-free `.mjs` repository-maintenance scripts were
bounded bootstrap infrastructure, not the implementation pattern for MDK
packages or external applications. automation migration review later migrated that maintained
automation to TypeScript without changing the language boundary for
tool-constrained configuration.

This decision selects the source-language default. It does not by itself
approve an external compiler, linter, formatter, bundler, client library,
supported Node version, package manager, public API, or release.

## Consequences

- Root and consumer agent instructions route implementation work through a
  focused TypeScript skill.
- Package documentation and verification must include typechecking once an
  approved compiler/toolchain exists; runtime tests alone are insufficient for
  a released package.
- The private core proof moves to `.ts` source and tests while retaining its
  runtime-dependency-free, unpublished status. ADR-0010 later selects its
  package-local test framework.
- Repository maintenance tooling migrates through bounded tasks; historical
  JavaScript tooling does not authorize new JavaScript package source.
- Exceptions must explain the owning tool or interoperability constraint and
  must not spread across package boundaries.

## Rejected Alternatives

- Leaving the language implicit behind the phrase “typed public APIs.”
- Allowing TypeScript and JavaScript package source as equal defaults.
- Converting protocol evidence, JSON registries, Markdown, or Solidity to
  TypeScript solely for repository uniformity.
- Selecting a dependency/toolchain by implication as part of the language
  decision.

## Acceptance and Release Gate

The maintainer explicitly established TypeScript-first development on
2026-08-21. TypeScript implementation review aligns the current repository and private core proof.

Before a public package release, maintainers must separately approve supported
runtime and package-manager versions plus the compiler, build, lint, test, and
declaration-emission toolchain. Public artifacts must pass typechecking and be
tested from their built package boundary.
