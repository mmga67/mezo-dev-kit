# ADR-0017 — Shared price and event inputs

- Status: Accepted for implementation under the full-SDK task
- Date: 2026-09-08

The continuing full-SDK implementation needs reusable price validation and
bounded history for borrowing, lending and later swap/bridge consumers.
ADR-0009 remains the owner of price taxonomy and dependency direction; the
accepted indexing guide owns coverage, checkpoint and reorg semantics.

`packages/prices` owns deterministic typed price datums, decimal normalization,
source-defined confidence, explicit freshness and provenance-preserving
observations. A direct mainnet Skip reader is the first RPC source; source
selection/fallback remains a later extension. It consumes canonical Prices rules and EVM validation. Borrowing
and Lending retain their deployed oracle paths and domain errors while reusing
shared arithmetic/freshness. A generic feed or fallback never becomes protocol
oracle state by relabelling it. No updater, provider subscription or implicit live value
is supplied by the deterministic helpers. The optional reader uses Core
transport/runtime verification and caller-owned time/freshness inputs.

Core owns a bounded, provider-neutral event scanner above registered EVM
sources. It validates query/range/log identities, returns explicit coverage and
checkpoint candidates, and detects changed anchors. Applications retain RPC
credentials, provider capability policy, storage, atomic checkpoint commits,
workers and schedules. Protocols own event meaning and required reconciliation;
complete log-query coverage does not establish protocol outcome or destination
delivery.

Existing readers remain compatible and signer-free. New external dependencies,
provider accounts, live transactions and package release are outside this
implementation decision. These private additions receive the same required
checks and source/domain review boundaries as the earlier writer stages.
