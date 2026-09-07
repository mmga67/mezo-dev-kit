# ADR-0002 — Core Client Model

- Status: Accepted
- Date: 2026-08-18

## Context

MDK needs one framework-independent execution boundary for chain assertion,
registry resolution, block-coherent reads, simulation, transport behavior,
units, errors, and debug evidence. Application-specific clients, services,
hooks, and package boundaries are not MDK authority.

`ARCHITECTURE.md` accepts the responsibility and dependency boundaries for
chains, contracts, core, protocols, and adapters. It deliberately leaves the
core client's public types and API to this ADR and a proven vertical slice.

## Proposed Decision

The future core client will be constructed with explicit chain, transport,
registry, and confirmation policy. Protocol modules receive that client;
framework adapters consume public core/protocol APIs. Pure calculations receive
plain typed values and never access RPC, wallets, React, or hidden global state.

The client contract will implement the candidate requirements at logical
knowledge resource
`workflows/transactions:transaction-client-requirements`, including:

- chain assertion before deployment resolution or signing;
- stable-ID deployment resolution at a validity coordinate;
- block-coherent logical reads with typed required/optional failures;
- provider-aware batching and safe read/write failover;
- typed integer unit/address boundaries;
- exact-call simulation and structured error/debug evidence.

No external client dependency is selected by this decision.

## Consequences

- Protocol packages own protocol preconditions, quotes, and reconciliation;
  core owns shared execution mechanics.
- A provider endpoint or wallet is an explicit dependency and can be replaced in
  tests.
- Reads can expose a weaker consistency mode only when typed and explicit.
- Write failover can rebroadcast exact signed bytes, but cannot silently create
  a new nonce-bearing intent.
- Network and deployment knowledge remain referenced from their canonical
  owners rather than copied into the client.

## Rejected Alternatives

- A global singleton client or framework-owned wallet as the core dependency.
- Treating multicall failure as zero/false/empty data.
- Importing an application-specific service/hook topology.
- Selecting a library before dependency approval and a vertical-slice test.

## Decision Acceptance Gate

Architecture review must accept or revise the responsibility and dependency
boundary. Acceptance does not select a client dependency, freeze a public API,
or claim that a core package has been implemented.

## Implementation and Release Gate

The first supported vertical slice must prove chain assertion, coherent reads,
simulation, receipt tracking, and reconciliation without hidden dependencies.
Its public types and dependency choice require their own task, tests, and
risk-appropriate review before release.

## Acceptance

Accepted by the human maintainer on 2026-08-21 after the decision-acceptance
and implementation/release gates were separated. Acceptance establishes the
responsibility and dependency boundary only; it does not select a dependency,
freeze a public API, or claim an implemented core package.

## Implementation status

core execution proof adds a private, runtime-dependency-free proof under `packages/core/`. TypeScript implementation review
aligns that proof with ADR-0007 by implementing its explicit ports and tests in
TypeScript. It covers chain assertion, stable deployment resolution,
block-coherent reads, exact-call simulation, one-time submission,
receipt/confirmation/reorg observation, and injected reconciliation. This is
implementation evidence for the accepted boundary, not selection of a
third-party dependency or acceptance of a stable public API, protocol writer,
or released package.
