# Interpret a price and its freshness

[evaluatePrice](normalize.ts) accepts an identified datum's amount/scale,
optional confidence, publication timestamp, an explicit evaluation time and
maximum age. It is a pure calculation: it reads no clock or RPC. Inspect amount,
freshness and confidence separately. Missing confidence means unknown confidence,
not zero uncertainty; unavailable prices must never become zero.

[readSkipPrice](read-skip.ts) adds a read transport and registry for the implemented
mainnet Skip observation. Supply the requested coordinate and freshness policy
through its typed input; preserve source identity, units, status and limitations
in the result. This is a direct feed observation, not automatically the oracle
value used by a particular borrowing or lending protocol. No wallet is required.

See the [Prices reference](../../packages/prices/REFERENCE.md) and
[price selection guide](../../docs/guides/price-selection-and-dex-quotes.md).
