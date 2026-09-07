# ADR-0009 — Oracle and price-source ownership

- Status: Accepted
- Date: 2026-08-23
- Accepted by: human architecture review on 2026-08-23

## Context

MDK already records several price-adjacent facts, but it has no accepted owner
for a reusable price datum, source taxonomy, transport/feed state, freshness
decision, scale conversion, or explicit fallback result.

The accepted MUSD module owns how the protocol `PriceFeed` consumes BTC/USD,
checks its configured freshness bound, and normalizes the result. Contracts
owns the `musd.price-feed` proxy, implementation history, and ABI. Pools owns
basic reserve and concentrated-liquidity tick/Q64.96 math. Networks owns chain
and RPC identity. Applications and analytics may also retrieve market prices,
execution quotes, and persisted projections.

Those values are not interchangeable. In particular:

- an external pushed feed update is not yet a protocol price;
- the MUSD protocol price is not a generic market/reference price;
- a DEX spot, TWAP, or execution quote is not a pushed oracle observation;
- a cached/indexed projection is not evidence that its source remains current;
- converting units or selecting a fallback must not erase source, coordinate,
  age, confidence, errors, or the selection decision.

Without a single ownership and dependency model, a consumer can accidentally
turn an application fallback into protocol truth, silently accept a stale or
differently scaled value, or maintain a second copy of feed identity.

## Decision

### Canonical ownership

Create a v0.4 `prices` knowledge module as the one
canonical owner for provider-neutral price-source taxonomy, reusable feed
semantics, typed price-datum envelopes, freshness/scale rules, explicit
fallback-result semantics, and bounded source observations.

Existing owners remain authoritative within their domains:

| Fact | Canonical owner |
| --- | --- |
| Network identity and read/provider capability | `networks` |
| Contract address, proxy/implementation range, ABI, and source provenance | `contracts` |
| External feed/source identity, units, exponent/decimals, confidence semantics, publication time, observation, and reusable normalization/freshness rules | `prices` |
| How a protocol consumes a price and which protocol state/threshold governs it | that protocol module, referencing `prices` and Contracts |
| Pool reserve/tick/oracle mechanics and DEX-derived spot/TWAP meaning | `protocols/pools` |
| Swap execution quote construction and route-specific slippage | future accepted swap/routing owner |
| Stored market/history/portfolio projection | application/indexer/analytics owner; not canonical protocol knowledge |
| Transaction update/submission lifecycle | `workflows/transactions` |

The proposed `prices` module must reference Contracts and Networks by stable
logical ID. Protocol modules may depend on `prices`; `prices` must not depend
on a protocol consumer. Pools remains the owner of DEX math so no prices/pools
cycle is created. A higher-level consumer may combine separately resolved
price and pool outputs while preserving their distinct source classes.

### Source classes

Every price-like value declares exactly one source class:

1. `protocol-oracle-state` — a value returned by a named deployed protocol
   adapter under that protocol's configured validation and normalization;
2. `pushed-feed-observation` — a publisher/transport feed observation with
   feed identity, raw signed price, exponent/decimals, publication time, and
   confidence when defined;
3. `offchain-market-reference` — a provider response observed at retrieval
   time, with provider/instrument identity and explicit limitations;
4. `dex-derived-observation` — a pool state, spot, or TWAP derived through the
   owning pool mechanism at explicit blocks/timestamps and liquidity/window;
5. `dex-execution-quote` — an amount-specific route result with block,
   direction, size, fees, price impact, and executable limitations;
6. `stored-analytics-projection` — a cached, indexed, aggregated, or derived
   row that retains its complete upstream provenance and is never promoted by
   persistence alone.

Changing source class is a visible selection/derivation event, not an
implementation detail.

### Typed price datum

Every reusable datum or failure carries:

- stable source/feed/instrument identity and source class;
- base and quote assets plus network/deployment scope where applicable;
- raw signed integer plus exponent/decimals, or an exact rational; never an
  unqualified floating-point number;
- source publication timestamp and/or block coordinate, plus retrieval or
  observation timestamp;
- confidence value and semantics when the source defines one, otherwise an
  explicit `null`/unsupported state;
- caller/consumer `asOf` coordinate and the exact max-age rule used;
- normalized value, target scale, and rounding only when conversion succeeds;
- lifecycle result such as `valid`, `stale`, `future-dated`, `negative`,
  `zero-invalid`, `missing`, `unsupported`, `partial`, `disagreement`, or
  `failed`, with typed cause and retained raw evidence;
- limitations and the logical references that prove identity and semantics.

No unavailable or invalid input is converted to zero, the last known value,
or another source without an explicit typed result.

### Scaling and confidence

Scaling uses integer or exact-rational arithmetic. Converting raw price `p`
with decimal exponent `e` to target decimal scale `t` is an explicit checked
power-of-ten operation. The record declares whether multiplication or division
is required and the rounding direction. Negative values, exponent overflow,
unsupported precision loss, and a consumer-prohibited zero are failures.

Confidence is never fabricated. A feed-defined confidence interval remains
paired with its raw price/exponent and is normalized with the same scale. A
source without confidence returns `null` plus its limitation rather than zero
or an inferred percentage.

### Freshness and fallback

Freshness is evaluated against an explicit consumer `asOf` coordinate and
named max-age rule. Equality at the boundary is defined by the owning rule and
covered by fixtures. Future-dated, missing-time, and stale values are distinct
failures.

Fallback is a typed selection over a caller- or policy-owned ordered candidate
list. The result includes every attempted source, its validation result, the
selected source (if any), and the source-class change. It must not:

- silently change base/quote, scale, network, block/time coordinate, or source
  class;
- silently return stale, future, negative, missing, failed, or incompatible
  data;
- average, interpolate, persist, or synthesize a price unless a separately
  named and reviewed derivation owns that operation;
- use a market, DEX, or analytics fallback as the MUSD protocol price when the
  deployed MUSD `PriceFeed` is unavailable.

Provider disagreement is preserved as multiple observations plus a typed
disagreement/selection decision. It is not automatically resolved by source
order or arithmetic.

### Support and security boundary

Knowledge records and fixtures do not enable a feed pusher, updater, trading
path, hosted provider, credentials, subscription, public runtime package, or
transaction writer. Secrets and provider-specific account state never enter
knowledge or memory. A future update writer must separately satisfy Contracts,
Networks, transaction lifecycle, simulation, authorization, and qualified
security review.

## Alternatives

- Let each protocol/application own complete price-source models: rejected
  because feed identity, units, freshness, and fallback semantics would drift.
- Make Contracts own price meaning: rejected because Contracts owns executable
  identity/provenance, not domain interpretation or observed values.
- Put MUSD, pushed feeds, market data, DEX quotes, and analytics in one
  normalized price table: rejected because it erases source class and consumer
  semantics.
- Let `prices` own pool math and route quotes: rejected because it creates
  duplicate ownership and a dependency cycle with pools/swaps.
- Adopt one universal fallback order: rejected because selection is
  consumer/policy state and can change the meaning of the returned value.

## Consequences

- The `prices` module has a narrow reusable contract without becoming a
  protocol, DEX, analytics, or execution owner.
- MUSD retains protocol semantics and references a price/feed identity without
  copying its current value or deployment address.
- Every successful value and failure is provenance-preserving and typed.
- Applications can define policy while MDK prevents policy results from being
  mislabeled as protocol authority.
- New feed roots require Contracts/Networks evidence and Level 3 review; new
  provider credentials or hosted operations require separate scope.

## Acceptance gate

A human architecture reviewer must accept or amend:

- the `prices` module ID and ownership boundary;
- the dependency direction among prices, protocols, pools/swaps, Contracts,
  Networks, transactions, and analytics;
- the six source classes and typed datum/failure contract;
- the no-synthetic-fallback and MUSD non-substitution rules.

Acceptance was recorded on 2026-08-23. oracle evidence review may now create the bounded
`prices` module and promote oracle/feed facts that satisfy the evidence and
Level 3 gates above. The acceptance does not authorize writers, credentials,
trading paths, public runtime support, or unbounded feed/provider scope.
