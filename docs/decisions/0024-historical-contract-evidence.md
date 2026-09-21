# ADR-0024 — Historical contract evidence and Native delivery observation

> Historical decision, consolidated on 2026-09-15 into
> [Contract identity and provenance](../manifest#contract-identity-and-provenance).
> See also [Events and bridge outcomes](../manifest#events-and-bridge-outcomes).
> The original text and acceptance scope below are retained for context;
> the manifest and its delegated owners define current policy.

- Status: Accepted for private implementation
- Date: 2026-09-12

Current contract resolution deliberately rejects older implementations when only
the current ABI is qualified. Native Bridge's retained transfers require older
Ethereum and Mezo generations. Applying today's ABI to those transactions would
misrepresent their executable behavior.

Contracts therefore owns a separate indexed historical evidence catalog, full
generation artifacts and a deterministic package projection.
`resolveHistoricalContractEvidence` accepts the existing contract/network/block
coordinate and returns `HistoricalContractEvidence`. Its evidence shape is not
assignable to `ResolvedContract`; historical calldata decoding does not qualify
an operation or writer target. Existing contract, operation and runtime resolution
keep their current restrictions. Logical Contract IDs are preserved.

The initial catalog covers only the observed coordinates needed by the two
retained Native transfers. Each closed, one-block interval describes observation
coverage, not a newly inferred activation height. Gaps, overlaps, changed lifecycle,
source/build digests, runtime, proxy slots and execution-version evidence fail
validation. The exact block hash governs replay. Runtime reads no knowledge files.

Bridges composes this evidence with Core's existing read, storage, transaction,
receipt and block ports. Its separate Native observer joins the direction-specific
tuple, validates the included direct source calldata and observes bounded
destination candidates. Inbound ERC-20 delivery additionally requires stable
mapping, exact sequence transition, recipient post-state and one consensus
transaction containing one injected bridge entry. A caller supplies the raw
CometBFT block; an EVM-only transaction list omits other Cosmos transactions.
Pseudo tracing is synthetic and is not mint evidence. Outbound delivery requires
matching attestation/confirmation and attributable recipient/fee transfers whose
sum equals gross input. Recheck both chains and all contributing state anchors.

This implementation decision does not accept new protocol evidence for release.
Historical profiles and the additional Native qualification remain
verified/proposed/pending-qualified-review. No current preflight, writer, relay,
recovery, additional asset, dependency or package release is authorized here.
The capture tooling lives inside Contracts, using its existing EVM dependency.
Consumer applications do not receive unpublished contributor capabilities.

Verification includes provenance negatives, current-resolver compatibility,
source and destination failures, skipped mint, attribution ambiguity, reorgs,
confirmations, cancellation, both retained transfers through built public
entrypoints, and the complete workspace checks.
