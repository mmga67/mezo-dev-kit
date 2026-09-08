# ADR-0014 — Shared EVM value foundation

- Status: Accepted for implementation
- Date: 2026-09-08

## Context

Core, the Contracts runtime, three protocol readers, and a public-entrypoint
HTTP example independently validate addresses, hashes, bytes, or integers.
Core's earlier unit-conversion proof is internal and unavailable to examples.
These are demonstrated consumers of shared EVM representation contracts.
Putting reusable validation inside Core would make lower layers depend upward.

## Decision

Add the private workspace package `@mezo-dev-kit/evm` beneath the existing
package graph. Its [README](../../packages/evm/README.md) owns the primitive
input, normalization, exact-conversion, type, and error contracts. Existing
packages consume that public boundary and retain their own domain errors,
zero-address policy, protocol bounds, and arithmetic. There is no general
`utils` package, provider client, wallet, signer, or presentation framework.

Use Ox 1.7.4 through the Address, Hex, and Value subpaths. Review of the
2026-08-31 registry release verified the archive's registry SHA-512 integrity,
MIT license, ESM entrypoints, and absence of package install scripts. The
repository lockfile owns the exact transitive graph; dependency review and
advisory observations belong in the maintainer's review packet. This selection
preserves the existing release-age policy and Node 24 baseline. Subpath imports
limit the consumed API; they do not eliminate installation of Ox's transitive
dependencies. Reassess that graph and the primitive tests on upgrades.

MDK's wrapper is intentional: generic hex validation is not canonical RPC
quantity validation, user checksum verification must precede normalization,
and exact amounts must reject excess precision before invoking a parser that
can round. Do not copy upstream crypto or casually expose upstream defaults.
Keep library-specific types and errors behind MDK's boundary.

## Compatibility and verification

- Existing domain error codes and public template-literal aliases remain.
- Generic address representation allows zero; existing consumers still reject
  it where required. User-input checksum policy is a separate new API.
- Financial calculations and generated canonical data remain under their
  previous owners. Unit parsing and formatting use integer base units only.
- Bootstrap generators retain validation where depending on a built package
  would create a generation/build cycle. They must not become runtime helpers.
- Primitive boundary tests, caller regressions, type/lint/format checks,
  dependency boundaries, generated drift, and built/clean consumers are required.

The maintainer accepted the package and context-efficiency proposal before
implementation. This ADR records that architecture decision; qualified review
of the resulting source and any later publication remain separate gates.

## Alternatives

Viem or Ethers utilities can serve adapters when those integrations are
selected, but no provider stack is needed for this value layer. A wholly local
implementation would keep dependency count lower while retaining checksum and
conversion maintenance. A generic project utility package would mix EVM
representation with unrelated responsibilities. Neither alternative is chosen.
