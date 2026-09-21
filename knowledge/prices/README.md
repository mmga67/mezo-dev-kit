# Prices and oracle evidence

Understand price sources, feeds, scaling, confidence, and freshness. Use these records to distinguish a protocol’s configured oracle from a market observation or a trade quote.

## Start here

- [Price source reference](generated/reference.md): source classes, feeds, deterministic rules, and recorded observations.
- [Choosing prices and DEX quotes](../../docs/guides/price-selection-and-dex-quotes.md): select an observation for a particular use.
- [Refreshing oracle evidence](../../docs/guides/oracle-evidence-refresh.md): capture and verification procedures.
- [Prices SDK](../../packages/prices/README.md): normalization, freshness checks, and the direct mainnet Skip reader.

## Scope and evidence

The reviewed model includes Skip BTC/USD and Pyth Core/feed evidence. Feed
identity, deployed code, and an old observation do not prove current liveness.
Knowledge support remains proposed; inspect the selected observation's date,
network, source class, and limitations.

Current-state captures and historical evidence have separate scopes. The full
module check retains an expired historical testnet evidence window; current-state
records do not renew it. The refresh guide explains the scoped checks.

MUSD and Lending own their deployed oracle policy, Pools owns DEX math, and
Swaps owns execution quotes. A direct feed or DEX value must not silently replace
a failed protocol oracle.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
