# Prices reference

> Generated from canonical `prices` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`
- Support: `proposed`
- Review: `accepted`
- Review boundary: `2026-09-03T14:24:36.881Z`
- Public readers: none
- Writers/updaters: none

## Source classes

| Class | Canonical semantics owner |
| --- | --- |
| `protocol-oracle-state` | the consuming protocol module |
| `pushed-feed-observation` | prices |
| `offchain-market-reference` | prices for reusable datum semantics; provider/application for retrieval policy |
| `dex-derived-observation` | protocols/pools |
| `dex-execution-quote` | accepted swap or routing owner |
| `stored-analytics-projection` | application, indexer, or analytics owner |

## Initial sources and feeds

- `source.skip-price-oracle-v1`: Skip Connect; `pushed-feed-observation`; proposed.
- `source.pyth-core-v1`: Pyth Network; `pushed-feed-observation`; proposed.

- `feed.skip-btc-usd`: BTC/USD; proposed.
- `feed.pyth-btc-usd`: BTC/USD; proposed.
- `feed.pyth-musd-usd`: MUSD/USD; proposed.

## Deterministic rules

- Scale: normalizedInteger = rawPrice * 10^(sourceExponent + targetDecimals)
- Exponent bound: ±77
- Freshness: publishTime <= asOf and asOf - publishTime <= maxAgeSeconds
- Boundary: inclusive: equality at maxAgeSeconds is valid
- MUSD: When the deployed MUSD PriceFeed is unavailable or invalid, a market, DEX, analytics, Skip-direct, or Pyth-direct fallback must not be labeled or returned as the MUSD protocol price.

## Fixture coverage

| Fixture | Operation |
| --- | --- |
| `scale-multiply` | `scale` |
| `scale-divide-exact` | `scale` |
| `scale-divide-rounded` | `scale` |
| `scale-exponent-overflow` | `scale` |
| `confidence-normalization` | `confidence` |
| `confidence-unsupported` | `confidence` |
| `freshness-equality-boundary` | `freshness` |
| `freshness-stale` | `freshness` |
| `freshness-future` | `freshness` |
| `negative-price` | `validate` |
| `consumer-prohibited-zero` | `validate` |
| `allowed-zero` | `validate` |
| `missing-feed` | `validate` |
| `provider-disagreement` | `disagreement` |
| `fallback-source-class-change` | `fallback` |
| `musd-fallback-forbidden` | `fallback` |
| `partial-read` | `aggregate` |
| `total-failure` | `aggregate` |

## Current post-upgrade fixed-block observations

| Observation | Network | Result |
| --- | --- | --- |
| Review deadline | mezo-mainnet | 2026-09-13T09:52:32.237Z |
| `observe-skip-mezo-mainnet-2026-09-06` | `mezo-mainnet` | `valid-bounded-observation` |
| `observe-pyth-mezo-mainnet-2026-09-06` | `mezo-mainnet` | `stale-at-3600-seconds` |
| Review deadline | mezo-testnet | 2026-09-03T14:24:36.881Z |
| `observe-skip-mezo-testnet-2026-08-27` | `mezo-testnet` | `valid-bounded-observation` |
| `observe-pyth-mezo-testnet-2026-08-27` | `mezo-testnet` | `stale-at-3600-seconds` |

Older observations remain immutable historical evidence. Current evidence is selected independently by network; the full-module deadline remains expired until the testnet refresh succeeds (current-state oracle verification). Pyth diagnostic payloads are stale evidence, not current prices. See `review/gaps.md` before relying on any proposed identity or rule.
