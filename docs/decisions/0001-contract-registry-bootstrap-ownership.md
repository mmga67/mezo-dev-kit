# ADR-0001 — Contract Registry Bootstrap Ownership

- Status: Accepted
- Date: 2026-08-18

## Context

`docs/manifest` calls for one evidence-backed chain and contract registry that
generates runtime data, types, documentation, and SDK inputs.
`ARCHITECTURE.md` now accepts the repository ownership and dependency model,
but it deliberately does not accept a runtime registry interface. Creating an
empty package or inferring a public API would violate the bootstrap rules.
Unverified address lists, partial ABIs, product-specific data, and historical
observations cannot be registry authority.

## Decision

Until a `packages/contracts` public interface is accepted:

- the `contracts` module index is the canonical bootstrap entry point;
- resources `contract-deployments`, `contract-abis`, and `contract-sources` are
  the only owners of promoted addresses, ABI provenance, and evidence
  relationships;
- full ABI artifacts are canonical inputs resolved through stable
  `abi.<contract-id>` resources and the ABI catalog, not hand-importable
  alternatives;
- protocol knowledge references stable contract IDs, never copied addresses;
- generated runtime data and bindings will later move under
  `packages/contracts/generated/` and carry canonical input digests;
- dynamic pool/gauge instances are discovered through supported roots and
  validated at runtime unless a named instance receives an explicit support
  decision;
- current implementation ABIs are supported independently of historical
  implementation evidence.

The future package registry should resolve by stable contract ID, network ID,
and validity coordinate and fail explicitly for missing, expired, ambiguous, or
unreviewed deployments.

## Consequences

- Docs, examples, skills, and future protocol modules cannot become secondary
  address or ABI authorities.
- Proxy upgrades require a new evidence run and registry review, not an in-place
  address-only edit.
- Candidates can remain visible without weakening the supported registry.
- The knowledge schema can mature before MDK commits to a package API.

## Acceptance

Accepted by the human maintainer on 2026-08-21 with the combined
contract registry review/contract schema migration production-readiness review. Acceptance covers the bootstrap
knowledge owner and current supported registry behavior only. A public
`packages/contracts` API remains a separate architecture and implementation
decision.
