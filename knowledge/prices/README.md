# Prices and oracle evidence

A protocol oracle, a market observation, and a swap quote answer different
questions. The oracle supplies a value under a protocol's configured rules;
a market observation describes a source at a particular time; a quote estimates
the result of a particular trade.

Use this directory to identify the source, units, timestamp, and confidence
information behind a price. Those details determine whether two values can be
compared and whether a value is suitable for the intended use.

## Choose and interpret a price

Begin with the decision the price will inform. A borrowing calculation needs
the price selected by that protocol's oracle rules. A swap estimate needs a
quote for the particular trade. The
[price-selection guide](../../docs/guides/price-selection-and-dex-quotes.md)
explains these choices and how to keep their sources distinct. A DEX is a
decentralized exchange; its quote includes trade-specific conditions that a
standalone price observation does not describe.

Once the source is clear, check how its value is represented. A raw integer
needs its decimal scale to become a price, and confidence information must be
interpreted using that source's definition. The
[price reference](generated/reference.md) records source classes, feeds, units
and calculation rules. Missing confidence information does not mean that the
source has zero uncertainty.

Finally, decide whether the observation is recent enough for the intended use.
The [Prices SDK](../../packages/prices/README.md) provides normalization and
freshness checks, plus a direct mainnet Skip reader. The application supplies
the relevant time and maximum age; the package does not choose a universal
age limit or automatically select a fallback source.

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

## Quick links

| Link                                                                         | What you will find                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Price reference](generated/reference.md)                                    | Source classes, feeds, units, rules and recorded observations.          |
| [Price-selection guide](../../docs/guides/price-selection-and-dex-quotes.md) | Choose between a protocol price, source observation and trade quote.    |
| [Prices SDK](../../packages/prices/README.md)                                | Normalization, confidence and freshness helpers, and the Skip reader.   |
| [Oracle evidence refresh](../../docs/guides/oracle-evidence-refresh.md)      | How to check current observations while preserving historical evidence. |
| [Module index](index.json)                                                   | Exact source, feed, evidence and review records.                        |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
