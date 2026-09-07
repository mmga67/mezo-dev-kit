# ADR-0012 — Coding-standard ownership and TypeScript quality gates

- Status: Accepted
- Date: 2026-08-24

## Context

ADR-0007 established TypeScript as MDK's implementation default but
deliberately did not select a compiler, linter, formatter, supported Node
baseline, or declaration workflow. The private core proof consequently had a
strict-looking local config whose `check` command only asked Node to parse
files. Repository engineering rules were split between root instructions,
architecture prose, package docs, and earlier contributor guidance.

Before additional packages copy those gaps, MDK needs one detailed coding
owner, a compatible exact-pinned toolchain, and deterministic gates that prove
different properties without conflating formatting, linting, typechecking,
testing, or architecture review.

## Decision

### Ownership

[`docs/standards/coding.md`](../standards/coding.md) is the canonical global
owner for authored-code quality and design rules. Root agent instructions and
`CONTRIBUTING.md` keep hard invariants and route contributors to it. The
`mdk-typescript-development` skill applies it as a procedure without copying
the standard. Package documentation may add real environment-specific rules.

Testing behavior remains owned by the testing standard, security policy by
`SECURITY.md`, dependency direction by `ARCHITECTURE.md`, and domain
correctness by canonical knowledge and package owners.

### Runtime and modules

- Node.js 24 is the minimum supported development runtime for this toolchain;
  the repository accepts later stable majors when all declared engines and
  tools remain compatible.
- Authored packages use ESM and Node-compatible module semantics. Explicit
  source extensions are retained in TypeScript imports and rewritten for
  emitted JavaScript by the compiler.
- Package export maps define supported entrypoints. Cross-package relative
  imports and undeclared deep imports are rejected.

### Toolchain

The root workspace exact-pins the mutually compatible stable set reviewed on
2026-08-24:

| Tool              | Version   | Purpose                                       |
| ----------------- | --------- | --------------------------------------------- |
| TypeScript        | `6.0.3`   | strict typecheck and declaration build        |
| ESLint            | `10.8.1`  | flat-config lint engine                       |
| `@eslint/js`      | `10.0.1`  | maintained JavaScript baseline                |
| typescript-eslint | `8.67.0`  | TypeScript parser and typed correctness rules |
| Prettier          | `3.9.6`   | mechanical formatting                         |
| `@types/node`     | `24.13.3` | types matching the minimum Node major         |
| Vitest            | `4.1.11`  | existing approved test default and gate tests |

TypeScript 7 is not selected because the current stable typescript-eslint line
declares support below TypeScript 6.1. ESLint 10.8.1, rather than the newer
10.9.0 release, satisfies the repository's minimum-release-age supply-chain
policy. Faster experimental alternatives may be evaluated later but do not
replace the stable compiler plus type-aware lint correctness gates here.

### Configuration and gates

- `tsconfig.base.json` owns the strict shared baseline. Projects extend it and
  include every applicable production, generated, test, and config source.
- ESLint uses flat configuration and type information for conforming TypeScript
  source. Unsafe types, floating promises, and invalid suppressions fail.
- Prettier remains separate from semantic linting.
- A repository-owned boundary validator checks declared public entrypoints,
  workspace dependency declarations, cross-package relative imports, and
  dependency cycles without adding another third-party dependency.
- Root commands expose `typecheck`, `lint`, `format:check`, `boundaries`,
  `build`, `test`, and their composed `check` workflow.
- `packages/core` is the first full pilot. automation migration review applies the same strict
  TypeScript gates to maintained repository automation while preserving
  protocol-sensitive generation and validation behavior.

Shared configuration is the default. A package-local override requires a real
environment difference and an exception record; copied configs are not a
customization mechanism.

## Consequences

- Runtime execution can no longer be reported as TypeScript typechecking.
- New packages begin with a deliberate public boundary and the complete gate
  set rather than inventing local tools.
- Strictness changes and tool upgrades are reviewed compatibility changes, not
  automatic version bumps.
- automation migration review must close with semantic and generated-drift evidence before the
  repository claims full TypeScript conformance for maintained automation.
- The toolchain and passing checks do not publish core or create a production
  support promise.

## Rejected alternatives

- Making `AGENTS.md` or a generic coding skill the detailed standards owner.
- Mandating classes, inheritance, identical folder trees, function-length
  quotas, or speculative abstractions as proxies for modularity.
- Choosing every tool's individually newest version despite an incompatible
  compiler/linter matrix.
- Using experimental type-aware lint/typecheck tooling as the only correctness
  gate.
- Silently excluding all existing automation or rewriting it inside this task.
- Adding CI/CD changes before the deterministic local gates are accepted.

## Acceptance and release gate

The maintainer accepted this ADR and coding standard review's review packet on 2026-08-24.
Public package release separately requires
the repository's release-security, artifact, compatibility, and qualified
review gates.
