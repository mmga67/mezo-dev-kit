# MDK coding standard

## Status and scope

This document is the normative repository-wide standard for authored MDK
code. It applies to packages, maintained tooling, tests, templates, examples,
and generated TypeScript source. It also defines the default expectations for
code generated into consumer applications.

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are
used as described by RFC 2119. A rule marked MUST or MUST NOT requires either
conformance or an approved exception under [Exceptions](#exceptions).

This document does not replace:

- [`ARCHITECTURE.md`](../../ARCHITECTURE.md), which owns package boundaries and
  dependency direction;
- [`testing.md`](./testing.md), which owns test design and Vitest conventions;
- [`SECURITY.md`](../../SECURITY.md), which owns vulnerability handling,
  protocol safety, secrets, and release security;
- domain knowledge and package documentation, which own domain correctness and
  local commands; or
- ADRs, which own durable decisions and their rationale.

When rules conflict, the more safety-preserving rule applies until the owning
documents are reconciled. A package-local rule may refine this standard for a
real environment constraint, but may not silently weaken a repository-wide
invariant.

## Engineering outcomes

MDK code MUST optimize for correctness, legible ownership, safe change, and
composability. A good design lets a contributor answer:

1. Who owns this behavior or fact?
2. What may depend on it?
3. What is public and what may change internally?
4. Where does untrusted data become trusted?
5. Which failures and side effects are observable?
6. Which check proves the intended property?

Prefer the smallest complete design that answers those questions. Search for
an existing owner and pattern before adding an abstraction. Avoid unrelated
refactors and do not preserve duplication merely to avoid making an existing
owner explicit.

## Modular design and SOLID

### Information hiding and cohesion

- A module or package MUST own a cohesive set of decisions that change for the
  same reason. Group by hidden design decision or domain responsibility, not
  merely by file kind.
- Internal representation, provider-specific shapes, caches, and construction
  details MUST remain behind the owning module's public boundary.
- Dependencies MUST follow `ARCHITECTURE.md`; package dependency cycles are
  forbidden.
- Broad `utils`, `helpers`, `common`, `manager`, or `service` owners SHOULD NOT
  be introduced. Name the domain decision instead.
- A small package MAY remain flat. Introduce layers only when they express real
  dependency direction or isolate a volatile boundary. Empty ceremonial
  folders are not architecture.

A flat package may use:

```text
src/
  client.ts       # orchestration over owned ports
  errors.ts       # public failure vocabulary
  validation.ts   # trust-boundary normalization
  index.ts        # deliberate public surface
```

A package with demonstrated layers may use:

```text
src/
  domain/         # pure values, invariants, calculations
  application/    # use cases and consumer-owned ports
  adapters/       # RPC, wallet, storage, framework implementations
  index.ts        # supported entrypoint, not a source-tree mirror
```

Dependencies in a layered package point inward. Domain code MUST NOT import an
adapter. Application policy depends on small owned ports; edge adapters depend
on and implement those ports.

### SOLID as behavioral guidance

SOLID applies to functions, modules, values, ports, and classes. It does not
require classes, inheritance, repositories, services, dependency-injection
containers, or one interface per implementation.

- **Single responsibility:** one owner has one cohesive reason to change.
  Split mixed policy, transport, persistence, formatting, and presentation.
- **Open/closed:** extend through an already-demonstrated stable seam. Do not
  create speculative plugin systems, generic factories, or abstraction layers
  for hypothetical consumers.
- **Liskov substitution:** every implementation of a port preserves accepted
  inputs, returned values, failure semantics, side effects, ordering, and
  lifecycle guarantees. A mock that accepts states rejected in production is
  not substitutable.
- **Interface segregation:** define the smallest port required by its
  consumer. Do not expose a provider SDK or a broad client because one method
  is needed.
- **Dependency inversion:** domain and application policy depend on
  MDK-owned abstractions; RPC, wallets, frameworks, storage, time, randomness,
  and process state remain at the edges and are passed explicitly.

Composition is the default. Inheritance MAY be used when the subtype contract
is genuinely stable and substitutable, not merely to share implementation.

## TypeScript baseline

### Language and compiler

- Authored product code and tests MUST be TypeScript. Use TSX only for source
  containing JSX. Narrow tool-required exceptions follow ADR-0007.
- Every maintained TypeScript project MUST extend the repository base
  configuration or document an approved incompatible environment.
- Strict typechecking, unchecked indexed-access protection, exact optional
  properties, unknown catch values, casing consistency, side-effect import
  checks, and isolated-module compatibility MUST remain enabled.
- A package MUST include production, generated, test, and configuration source
  in an applicable typecheck. Separate build and test configs MAY be used when
  their runtime environments differ.
- Runtime execution, syntax checking, linting, formatting, and tests do not
  substitute for static typechecking.

### Values and types

- Public functions, exported values whose meaning is not obvious, and owned
  ports MUST have deliberate types. Inference SHOULD be used for local details
  when it remains clear and precise.
- Use `unknown` for untrusted or not-yet-modeled values. Narrow through a
  runtime check before use.
- `any` is forbidden outside generated or interoperability boundaries covered
  by an approved exception. `as any`, double assertions, and diagnostic
  suppressions are not fixes.
- Type assertions MUST follow a runtime proof, preserve a value known by
  construction, or bridge an explicitly documented upstream typing defect.
  Prefer `satisfies`, discriminated unions, predicates, and parsers.
- Optional and nullable states MUST be intentional. Do not use absence,
  `false`, zero, or an empty collection to conceal a failure or unknown state.
- Variants that drive behavior SHOULD use discriminated unions and exhaustive
  handling. Adding a variant must expose every incomplete consumer.
- Inputs SHOULD accept readonly views and outputs SHOULD avoid exposing mutable
  internal state. Mutation MAY be used locally when ownership is unambiguous
  and no alias can observe an invalid intermediate state.
- Domain identities that are easy to mix up SHOULD use distinct nominal or
  template-literal types after runtime validation.
- Financial and chain quantities MUST use integer/base-unit representations.
  Units, precision, rounding, overflow bounds, and invalid states MUST be
  explicit. Binary floating point MUST NOT represent token base units.
- Type-only dependencies MUST use `import type` or equivalent type-only
  exports so runtime dependency edges remain visible.

### Runtime validation

TypeScript proves the use of values inside a checked program; it does not prove
RPC, wallet, user, file, environment, registry, generated, or JSON data.

- External values MUST enter as `unknown` or an equivalently untrusted shape.
- Validation MUST occur at the trust boundary and return an owned type or a
  typed failure.
- Validation MUST reject ambiguous units, unsupported variants, malformed
  addresses/hex, unsafe numbers, and missing required data. It MUST NOT coerce
  a transport or schema failure into plausible domain state.
- A schema or generated declaration MAY be the validation owner only when its
  provenance and generation inputs are maintained and drift-checked.

## Public APIs and packages

- A package's supported surface is its `package.json` export map plus its
  documented public types and behavior. The physical `src/` tree is not an API.
- Cross-package imports MUST use declared public entrypoints. Relative imports
  across package roots and undeclared deep imports are forbidden.
- Workspace dependencies MUST be declared by the consumer. Production source
  MUST NOT rely only on a development dependency.
- Public exports SHOULD be curated through a small package entrypoint. Avoid
  wildcard barrels that accidentally publish internal modules or cause cycles.
- Public signatures MUST not leak provider-specific objects unless the
  provider type is intentionally part of the contract.
- Package dependency graphs MUST remain acyclic. Lower layers MUST NOT import
  consumers, tests, examples, templates, tasks, docs, skills, or memory.
- Generated declarations and runtime exports MUST be derived from the same
  reviewed source. Public release artifacts MUST be tested through their built
  and packed entrypoints.
- A public API change requires compatibility and semantic-versioning review.
  Removal or semantic narrowing requires a migration path; deprecation MUST
  name the replacement and intended removal boundary.

Private bootstrap packages still follow these rules so accidental internal
structure does not become tomorrow's public contract. Passing the checks does
not itself declare a package released or supported.

## Functions, state, and side effects

- Keep deterministic domain calculations pure. Separate them from RPC,
  wallets, clocks, randomness, files, storage, UI, process state, and logging.
- Pass dependencies and configuration explicitly. Hidden mutable singletons,
  ambient clients, implicit chain selection, and import-time business side
  effects are forbidden.
- Functions SHOULD expose one abstraction level and make invalid states hard to
  represent. A long function or file is a design-review signal, not an
  automatic violation; arbitrary line quotas are not used.
- Repetition MAY remain while ownership or reuse is uncertain. Extract shared
  behavior when its semantics and consumers are demonstrated and can migrate
  together.
- Cleanup MUST be paired with acquisition and remain correct on success,
  failure, cancellation, and timeout. Prefer language constructs such as
  `finally` or explicit disposers that make the pairing visible.

## Errors and diagnostics

- Expected public failures MUST use an owned, typed vocabulary with stable
  codes or discriminants and actionable context.
- Preserve causal errors with `cause` or equivalent structured data. Do not
  replace a useful upstream failure with a context-free message.
- Never silently swallow a failure. An intentionally ignored failure MUST be
  locally justified and proven safe.
- Do not throw strings, expose raw provider text as the only contract, or make
  callers parse prose to recover state.
- Error serialization and debug diagnostics MUST be deterministic enough to
  investigate and MUST redact secrets, credentials, private endpoints,
  signatures where sensitive, and personal or partner data.
- Library code MUST NOT log by default. Diagnostics are opt-in and injected at
  the edge.

## Asynchronous work

- Every promise MUST be awaited, returned, deliberately collected, or handled
  by a named detached-work owner. Prefixing with `void` does not by itself make
  unobserved failure acceptable.
- Public operations that may block on I/O SHOULD accept cancellation when the
  underlying boundary supports it. Cancellation must propagate rather than be
  converted into a generic failure.
- Timeouts belong to an explicit policy and MUST release resources. A timeout
  does not prove that an external side effect did not occur.
- Retry only failures classified as transient. Retry policy MUST be bounded,
  observable, cancellation-aware, and use backoff/jitter where coordination or
  provider load matters.
- Non-idempotent work, especially transaction submission, MUST NOT be retried
  blindly. Idempotency keys, nonces, replacement, and reconciliation are
  domain decisions.
- Concurrency MUST have an explicit bound where input size or external load is
  unbounded. Preserve required ordering and define partial-failure behavior.

## Security and supply chain

Follow [`SECURITY.md`](../../SECURITY.md). At the code level:

- Validate at every trust boundary and fail closed for unsupported security,
  identity, deployment, permission, or value states.
- Never commit, log, fixture, or serialize secrets or private data. Use reduced
  redacted fixtures and placeholder configuration.
- Avoid dynamic code execution, unsafe shell construction, and unverified
  executable/generated artifacts. Treat paths, URLs, environment variables,
  and subprocess inputs as untrusted.
- Do not weaken validation, types, tests, or static checks to make a workflow
  pass.
- A dependency requires necessity, compatibility, maintenance, advisory,
  license, install-script, transitive, provenance, and lockfile review plus
  explicit human approval. Reviewed tool versions are exact-pinned.
- Suppressions and exceptions are security-relevant review surfaces. Keep them
  narrow, owned, time-bounded, and searchable.

## Style and documentation

- Prettier owns mechanical formatting. Contributors MUST NOT create competing
  whitespace rules or use ESLint as a formatter.
- Use clear domain language. Names communicate units, lifecycle state, and
  ownership; comments explain non-obvious intent, invariants, evidence, and
  tradeoffs rather than restating syntax.
- Exported behavior SHOULD include documentation when its contract, units,
  failure modes, side effects, or compatibility are not obvious from types.
- TODO/FIXME comments MUST include a task or owner and a concrete removal or
  decision condition.
- Generated files MUST identify their generator/canonical input where
  practical and MUST NOT be hand-edited.

## Suppressions and generated code

- TypeScript diagnostic suppressions are forbidden by default. `@ts-ignore`
  MUST NOT be used; a rare version-sensitive expectation MAY use
  `@ts-expect-error` with a local reason and negative type test.
- ESLint suppressions MUST name the rule, cover the smallest expression or
  line, explain why the rule is inapplicable, and link an owner/removal task if
  not permanent. Unused suppressions fail lint.
- A generated file MAY use a dedicated rule override only when the generator
  owns it, the override is no broader than the generated surface, and generated
  drift is verified. Generator source remains subject to the normal standard.
- Formatter ignores MUST identify a format whose syntax Prettier cannot safely
  preserve; they are not a way to grandfather authored source.

## Exceptions

An exception requires all of:

1. exact files, rule, and owner;
2. the concrete incompatibility or safety reason;
3. containment so the exception cannot spread by precedent;
4. compensating verification;
5. a removal condition and task, or a durable tool-boundary rationale; and
6. approval appropriate to the affected risk level.

Exceptions MUST be visible in the owning configuration and review packet. A
broad ignore, disabled strict flag, unchecked cast, or alternate command that
merely makes a gate green is not an exception record.

Existing debt may use a ratchet: unchanged files remain assigned to a bounded
migration task, while new and materially changed code conforms now. Ratchets
MUST enumerate their source set and owner; globbing away an entire maintained
area is forbidden.

## Enforcement

No single tool proves this standard.

| Property                                                    | Primary enforcement                           | Review still required                    |
| ----------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| Type soundness and strict options                           | shared TypeScript config and `pnpm typecheck` | domain modeling and justified assertions |
| Promise, unsafe-type, import, suppression rules             | typed ESLint and `pnpm lint`                  | side-effect and failure semantics        |
| Mechanical style                                            | Prettier and `pnpm format:check`              | naming and explanatory documentation     |
| Public entrypoints, declared dependencies, acyclic packages | `pnpm boundaries`                             | correct ownership and compatibility      |
| Runtime validation, errors, async policy, behavior          | focused tests via `pnpm test`                 | completeness against risk                |
| Build/declaration integrity                                 | package build and artifact checks             | public release and semver decision       |
| Architecture, SOLID, security, exceptions                   | human/agent review against this standard      | qualified review at the task risk level  |

The root `pnpm check` command composes the approved deterministic gates. A
package MAY add stricter checks. It MUST NOT redefine a root command to omit an
applicable gate or present a narrower check as repository conformance.

## References

This standard refines the durable engineering discipline from the earlier contributor guidance for MDK's current authority and package model. Its external
design basis includes TypeScript's TSConfig and project-reference guidance,
Node package export encapsulation, typescript-eslint typed linting, D. L.
Parnas's information-hiding criterion, Robert C. Martin's SOLID formulation,
OWASP secure-coding practices, NIST SP 800-218, and Semantic Versioning 2.0.0.
The task review packet records the source-by-source disposition and toolchain
review.
