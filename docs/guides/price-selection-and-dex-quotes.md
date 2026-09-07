# Price selection, Pyth availability, and DEX quotes

Use validated observations for the requested purpose. A known feed ID or deployed
contract is a candidate identity, not a continuously usable price. Keep stale and
failed candidates in the evidence catalog for diagnosis; exclude them from the
result presented as a usable price. A comment alone does not enforce freshness.

The canonical owners are `prices:price-freshness-fallback-rules`,
`prices:price-sources-feeds`, the consuming protocol module, `protocols/pools`,
and `workflows/swaps`. This guide explains their application to the private SDK.

## Current observed choices

The September 7, 2026 current-state captures are indexed separately under Prices
`extensions.currentStateEvidenceByNetwork`. These are bounded observations,
not a permanent allowlist. Both networks were queried at a pinned recent block
and rechecked for chain/hash consistency.

| Source and purpose                           | Observed disposition                                       | Use in the SDK                                                                                               |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Direct Skip BTC/USD reference                | Passed the explicit one-hour policy on mainnet and testnet | Candidate for a BTC/USD reference after repeating value/time validation at the requested coordinate          |
| Documented Pyth BTC/USD and MUSD/USD on Mezo | Both stale under that policy on both networks              | Preserve IDs, raw datums, ages, confidence, and failures; exclude these observations from usable prices      |
| Configured protocol oracle                   | Governed by the consuming protocol                         | Read and validate the actual configured adapter; do not replace it with an unrelated reference               |
| Pool price or swap quote                     | Separate DEX observation/quote class                       | Use for market display or a specified swap under its own policy, never as an implicit protocol-health oracle |

Follow the indexed artifacts for exact block hashes and raw values. The capture
command reports each feed's `status`; only `usable` passes its observation-level
freshness/value predicate. A consumer must still check units, identity, purpose,
confidence where available, consistency, and its own maximum age. Passing a
one-hour observation policy is not a recommendation that every consumer use an
hour. Current reader packages keep their existing caller-owned age policy.

## What the stale Pyth results establish

The contract and recognized feed data exist, and the current proxy/implementation
runtime hashes match the accepted generation. The permissive diagnostic call
returns old data while the one-hour call does not produce a usable price.
That establishes stale on-chain state, not a permanent failure of the provider
or proof that no alternative feed exists.

Pyth's accepted contract interface includes price-update operations. Reading the
stored price does not itself submit fresh update data. Before concluding that a
replacement feed is required, determine whether authentic current update data
exists for the same IDs, whether it is compatible with the deployed generation,
and whether there is an authorized updater. An update transaction is a separately
scoped writer and is not enabled by this documentation or the current readers.

A September 7 query to the public Hermes latest-update endpoint for the same IDs
returned HTTP 401 in this environment. No upstream liveness or replacement-feed
claim is made from that failure, and no update payload was submitted. Thus the
next diagnostic is upstream update availability and update delivery, rather than
immediately abandoning the feed or assuming that changing its ID solves it.

Never use a relaxed-age diagnostic value as a fresh price. Never turn an absent
or stale MUSD/USD observation into an assumed one-dollar peg. Preserve separate
`stale`, `future`, `invalid`, `unavailable`, and disagreement outcomes.

## Tigris and the swap-routing module

An amount-specific Tigris quote is the appropriate domain for “what rate can I
get for this swap?” Its owner is `workflows/swaps`, with pool discovery/math owned
by `protocols/pools`; it is not a Pyth fallback implementation.

The accepted bounded Mezo model distinguishes basic and concentrated-liquidity
routers. It has not established a current official Quoter or Universal Router,
or atomic mixed-family paths. Do not assume familiar Uniswap deployment addresses
or interfaces just because a pool resembles that design. Reverify current
Contracts/Pools/Swaps evidence before implementing a provider integration.

The next read-only quote slice should:

1. Accept network, token pair, exact input amount, block coordinate, and bounded
   routing constraints, including permitted pools, fees, hops, and route families.
2. Verify the current factory/router/pool generations and asset decimals. Use
   source-matched math and complete required reserve/tick/liquidity state.
3. Return expected output, pool fees, price impact, route/pool identities,
   coordinate, and coverage. Rank by an explicit objective within the evaluated
   set; describe the result as the best evaluated candidate, not a global optimum.
4. Keep output-token amounts separate from gas cost. Gas-adjusted ranking needs
   an explicit, validated currency-conversion source and cost policy.
5. Preserve insufficient liquidity, incomplete tick coverage, unsupported route
   families, missing quotes, and disagreement. Requote when the coordinate or
   trade input changes; do not guarantee an execution result from an old quote.

A reserve ratio is a spot reference. An executable-size quote includes trade
size, pool fees, and price impact. A TWAP additionally requires adequate retained
observations and a specified window. None automatically becomes a robust USD
oracle: its quote token must have an independently justified USD conversion, and
thin or transient liquidity can distort a market observation. Keep the source
class and derivation explicit. Protocol health continues to use the protocol's
configured oracle, even when a DEX market disagrees.

A read-only DEX quote module is a future extension of the Swaps workflow.
No DEX quote reader or swap writer is exported by the changes in this guide.

## Recent state and missing historical state

Use the most recent block only for a request whose purpose is current state.
Pin its number, hash, and timestamp; perform all related calls there and recheck
it. The current capture tool also rejects an endpoint head more than five minutes
from its capture clock. This is a maintenance-capture bound, not a finality claim.

An old-block request cannot fall back silently to that head. Current storage
cannot prove the implementation at an old activation, historical balances,
backfill completeness, or a past event's effects. Archive-dependent work must
retain `historical state unavailable` or its existing typed failure. Existing
historical evidence remains dated and is not relabeled as newly verified.

This does not change the mainnet SDK readers' formulas or block-consistency
contract: they already verify at the requested coordinate. It removes the
requirement to recapture old testnet storage before accepting a current-state
maintenance snapshot. Testnet reader support and full-history registry acceptance
are not automatically promoted. Full-history validators remain strict.
