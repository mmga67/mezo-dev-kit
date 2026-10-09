# Prices and oracle evidence

A protocol oracle, a market observation, and a swap quote answer different
questions. The oracle supplies a value under a protocol's configured rules;
a market observation describes a source at a particular time; a quote estimates
the result of a particular trade.

Use this directory to identify the source, units, timestamp, and confidence
information behind a price. Those details determine whether two values can be
compared and whether a value is suitable for the intended use.

## Choose and interpret a price

- [Price source reference](generated/reference.md): source classes, feeds, deterministic rules, and recorded observations.
- [Choosing prices and DEX quotes](../../docs/guides/price-selection-and-dex-quotes.md): select an observation for a particular use.
- [Refreshing oracle evidence](../../docs/guides/oracle-evidence-refresh.md): capture and verification procedures.
- [Prices SDK](../../packages/prices/README.md): normalization, freshness checks, and the direct mainnet Skip reader.

## Check the source and observation time

The reference includes Skip BTC/USD and Pyth Core/feed evidence. Feed
identity, deployed code, and an old observation do not prove current liveness.
Inspect the selected observation's date, network, source class, and limitations;
the SDK documentation identifies which readers and calculations it implements
and their support limits.

Current-state captures and historical evidence have separate scopes. The full
module check retains an expired historical testnet evidence window; current-state
records do not renew it. The refresh guide explains the scoped checks.

MUSD and Lending own their deployed oracle policy, Pools owns DEX math, and
Swaps owns execution quotes. A direct feed or DEX value must not silently replace
a failed protocol oracle.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
