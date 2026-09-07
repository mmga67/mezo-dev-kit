# Network Candidate And Conflict Report

This review records current authoritative-source conflicts, bounded capability
decisions, and deferred support questions. Canonical network records and their
evidence—not this file—own promoted facts.

## Current Source Conflicts And Gaps

### Historical `rpc.mezo.org` example

The pinned official mezod guide contains `https://rpc.mezo.org` in a Web3
example, while the newer mainnet provider table does not list it. A read-only
`eth_chainId` request failed with an unexpected TLS EOF on 2026-08-17 at
22:18 UTC. The URL is therefore excluded from the canonical endpoint catalog.
This does not assert permanent unavailability; it records why MDK does not
select the stale example.

### Imperator endpoints

The current official provider table lists Imperator HTTPS and WSS endpoints.
During verification, JSON-RPC POST returned HTTP 405 and the WebSocket handshake
failed. Both endpoints remain in resource `rpc-endpoints` with publication status
`official-recommended`, operational status `failed-verification`, and MDK
support status `docs-only`. They must be rechecked before release or use.

### Compatibility scope

Official sources describe Mezo as fully EVM-compatible. network registry review promotes the
narrow fact that Mezo is EVM-compatible and exposes Ethereum JSON-RPC. It does
not infer support for every optional method, archive query, EIP, provider
feature, subscription, batching behavior, or rate limit. Those capabilities
must be tested and recorded separately when an MDK workflow requires them.

### Cosmos RPC scope

The official mezod guide documents a node-local Cosmos SDK RPC on port 26657,
but network registry review found no current official public Cosmos RPC URL suitable for MDK.
The network records expose the node capability and explicitly do not select a
public Cosmos endpoint.

## Derived Documentation Decision

network registry review deferred a second hand-maintained reference. network schema migration superseded that
deferral with `generated/reference.md`, a deterministic projection of indexed
canonical values and endpoint state. It remains separate from future
`packages/chains` runtime generation and is never an independent fact owner.
