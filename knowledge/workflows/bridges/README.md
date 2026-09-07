# Bridge knowledge

This module owns evidence-scoped provider, asset representation, route, and
cross-chain reconciliation knowledge for MUSD Wormhole NTT and Mezo Native
Bridge.

For human use, start with `generated/reference.md`, then open only the selected
provider lifecycle and evidence resource. `review/gaps.md` is the production
blocker checklist; `review/candidates.md` records excluded or deferred routes
and assumptions.

For machine use, resolve module `workflows/bridges` through `index.json` and use
resource IDs. `bridge-contract-roles` links the bounded provider graph to
accepted Networks and Contract deployment/ABI records. Addresses
inside dated evidence remain checked observation coordinates rather than a
second identity owner.

## Current boundary

- Both provider models and six directions have reproducible completed-transfer
  evidence.
- bridge evidence review qualified review accepted the bounded provider, representation,
  route, lifecycle, evidence, and current-generation Contract model.
- Every route remains `evidence-verified-not-supported`; module support is
  `none`, so acceptance exposes no route, relayer, quote, operation, or writer.
- registry provenance review accepted the bounded Network and Contract registry identities; this
  does not accept any route, relayer, quote, operation, or writer.
- The v13 boundary is now verified: wrapper-v6 bytecode is unchanged, execution
  generation 6 activates at block 11358000, and its generation-6-only chain-set
  selector returns Ethereum and Bitcoin at activation and latest. bridge evidence review
  accepted the generation-6 deployment for current behavior while retaining
  generation 5 as historical provenance.
- NTT completion joins the same transfer digest across source and destination.
- Native completion joins a direction-specific sequence tuple; inbound ERC-20
  additionally requires recipient post-state or equivalent delivery proof.
- A source receipt, message/attestation, or successful system transaction alone
  is not terminal delivery.
- BSC, Solana, MEZO NTT, Bitcoin delivery, other mappings, and untested
  directions remain outside the module scope.

Maintainers follow `docs/standards/knowledge-management.md` and the bridge
skill. Update evidence, pinned source digests, records, generated reference,
and declared checks together.

Provider-neutral scans and destination-candidate projections follow
`docs/guides/INDEXING_RECONCILIATION.md`. They must preserve the NTT digest and
Native direction-specific tuple/post-state rules owned here; a stored indexer
status is not bridge completion.
