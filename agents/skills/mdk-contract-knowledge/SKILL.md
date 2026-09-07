---
name: mdk-contract-knowledge
description: Resolve, verify, or maintain Mezo contract IDs, deployment ranges, proxy histories, full ABIs, source provenance, and bounded evidence through the v0.4 Contracts module. Use for address, ABI, implementation, or registry work.
---

# Contract knowledge

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. For maintenance, read
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` and
   `docs/standards/knowledge-management.md`.
3. Read `knowledge/contracts/README.md` and `index.json`.
4. Load only the deployment, ABI, artifact, source, evidence, and candidate
   resources needed for the selected contract and network.

## Procedure

1. Normalize the requested role to a stable contract ID.
2. Resolve the network through the Networks module.
3. Resolve `contract-deployments` and select the record whose network and
   validity coordinate cover the requested block or transaction; fail on
   absence, overlap, expiry, conflict, or unsupported state.
4. Resolve its ABI catalog reference, then the catalog's `abi.<contract-id>`
   artifact reference. Never retain an artifact path as identity.
5. For present operations without an older requested coordinate, select the
   latest verified open implementation generation and apply only that
   generation's ABI through the proxy. For replay, audit, or historical reads,
   resolve the closed generation covering the exact coordinate and never apply
   the latest ABI outside its recorded range.
6. For a fact change, update pinned evidence, sources, catalog records, ABI
   digests, and limitations together. Preserve candidate and release gates.
7. Declare exactly one ADR-0005 provenance class on every deployment and ABI;
   validate that class's evidence without fallback. ABI artifact lists must
   exactly cover their declared intended network scope.
8. Regenerate the human reference and any declared consumers.
9. Run the module's structural, semantic, negative-provenance, and drift checks plus affected
   protocol/workflow validators.
10. Require qualified Level 3 review before releasing address, ABI,
   implementation, validity, or support changes.

## Invariants

- The Contracts module owns bootstrap address, deployment, ABI, and provenance
  facts until an accepted public registry decision transfers ownership.
- Contract ID, deployment ID, proxy address, implementation address, and admin
  address are distinct identities.
- Proxy history is append-only evidence: enumerate every observed upgrade,
  close each generation at the next activation, and verify the implementation
  slot immediately before and at each boundary. Never collapse history merely
  because current consumers use the latest generation.
- An open validity range means no observed supersession, not immutability.
- Full ABI artifacts are canonical raw inputs; fragments and copied paths are
  not substitutes.
- Dynamic instances resolve through reviewed roots unless separately approved.
- ADR-0001 is accepted for bootstrap knowledge ownership; it does not define a
  public package API. ADR-0005 accepts additional provenance classes, but every
  deployment still requires class-specific evidence and qualified review.

## Verification

Run:

```sh
node scripts/validate-knowledge-structure.ts --module contracts
node scripts/test-contract-provenance.ts
node scripts/validate-contract-knowledge.ts
node scripts/generate-contract-reference.ts --check
```

For new evidence, use fixed-block read-only RPC/explorer checks and record
chain identity, block/hash, activation, code digests, ERC-1967 slots, upgrade
ranges, generation-specific source labels, and full current-generation ABI
equality. Preserve provider failures and fallback provenance explicitly.

## Stop conditions

Stop when source/build provenance is missing or conflicts, proxy history or
validity is incomplete, current code disagrees with official intent, evidence
is expired for the requested risk, a candidate would need silent promotion, a
new dependency is required, or a public registry/support decision is missing.
