# ADR-0023 — Bounded NTT receipt observation

- Status: Accepted for private implementation under the full-SDK task
- Date: 2026-09-11

Bridge delivery requires evidence from separate chains and cannot be inferred
from a source transaction's successful execution. Private
`@mezo-dev-kit/bridges` owns the provider-specific join, initially observing the
four recorded MUSD NTT directions from one source hash and bounded caller-provided
destination candidates.

Bridges depends on EVM, Chains, Contracts and Core. They retain value validation,
network identity, deployment/ABI ownership and transport/log handling. The bridge
profile derives from indexed route, representation, role and evidence records.
Runtime does not read knowledge files or select endpoints. Native Bridge's
tuple/post-state semantics remain a distinct later outcome.

Reuse Core's receipt/chain/block methods through a narrow structural port.
Supplying a fake signer/submission record to its execution client for third-party
historical transfers would violate that client's ownership. Application indexers
may supply candidates; stored labels or negative scans cannot prove delivery.

For NTT, derive the chain-prefixed digest from the transceiver send event using
the pinned source encoding. The retained manager ABI's absent digest-only
TransferSent event remains a review gap. Match successful destination redemption,
apply explicit confirmations and recheck receipt anchors. Preserve all candidate
outcomes; an independent confirmed delivery survives another candidate's failure.

This boundary does not verify current code/configuration, intent, quotes,
fees/capacity, attestations or relay policy. It adds no signer, transfer writer,
automatic retry/recovery transaction, external dependency or release support.
Synthetic failure/reorg tests, built public-entrypoint historical receipt checks,
generated drift and full workspace checks precede implementation completion.
Qualified review remains required before release or route/writer promotion.
