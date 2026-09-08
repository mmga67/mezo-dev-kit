# ADR-0015 — Direct MUSD borrowing execution

- Status: Accepted for implementation
- Date: 2026-09-08

The maintainer approved moving MDK toward full SDK workflows, starting with
classic MUSD borrowing. This decision extends ADR-0002/0003 and ADR-0014 for
private source implementation; publication and qualified protocol review remain
separate decisions.

Contracts exposes a curated operation ABI resolver alongside the unchanged
read ABI. ABI availability identifies an entrypoint, not authorization or
protocol support. Generated projections retain the canonical Contracts owner.

EVM adds a bounded scalar ABI codec using the already installed Ox 1.7.4
AbiFunction and AbiEvent subpaths. It accepts explicit ABI entries and rejects unsupported
types rather than inventing encodings. This adds no dependency or lockfile
version. Ox types stay inside EVM.

Core owns execution and adapters over an injected JSON-RPC request function.
Applications choose RPC URLs, wallet connections, storage and consent. Readers
remain signer-free. Submission requires explicit signer identity and durable
intent storage; uncertain submission must be investigated, never automatically
retried. Receipt inclusion and confirmations precede domain reconciliation.

The new musd-borrowing package owns direct borrower state, integer forecasts,
sorted hints, operation preparation and reconciliation. Initial deployment
identity is Mezo mainnet; executable verification uses a pinned local fork.
Native collateral and MUSD burns do not create an allowance step. Client fee
and freshness checks cannot manufacture missing on-chain slippage protections.

The existing internal Core proof remains private. New additive public APIs use
current Chains, Contracts and EVM types. Tests must exercise their built public
entrypoints and actual encoding/RPC boundaries, including concurrency,
uncertainty, replacements, reorgs and protocol outcomes.
