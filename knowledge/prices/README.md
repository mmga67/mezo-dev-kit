# Prices knowledge

`prices` is MDK's provider-neutral owner for price-source and feed identity,
typed price datums, exact scale/confidence handling, explicit freshness, and
provenance-preserving fallback results. Its architecture boundary is accepted
in ADR-0009, and oracle evidence review accepted the initial module review and two Contract
roots. oracle re-verification captured the completed Pyth upgrade boundary and post-upgrade
state, and qualified review accepted the refreshed Pyth ABI, implementation
generations, and price evidence. Feed/current support remains proposed because
both one-hour Pyth reads were stale.

Use the stable resources in `index.json`. Do not treat physical paths, a stored
number, bytecode presence, or feed identity as proof of current price liveness.

## Initial scope

- six non-interchangeable source classes;
- a typed datum/failure envelope and checked decimal-integer scaling;
- inclusive explicit max-age evaluation and typed fallback attempts;
- the Mezo Skip BTC/USD PriceOracle precompile;
- the Mezo Pyth Core proxy plus documented BTC/USD and MUSD/USD feed IDs;
- bounded mainnet/testnet observations, including stale Pyth results.

## Ownership boundaries

- Contracts owns addresses, ABIs, proxy history, runtime identity, and source provenance.
- Networks owns chain and RPC/provider capability.
- MUSD owns how its deployed PriceFeed consumes and validates an oracle result.
- Pools owns reserve, tick, spot, and TWAP math.
- A future accepted routing owner must own amount-specific execution quotes.
- Applications/indexers own stored projections and must retain upstream provenance.

No market, DEX, analytics, Skip-direct, or Pyth-direct value may be returned or
labeled as the MUSD protocol price when its deployed adapter fails.

## Validation

```sh
node scripts/validate-knowledge-structure.ts --module prices
node scripts/validate-price-knowledge.ts
node scripts/generate-price-reference.ts --check
```

Full-history evidence is selected per network through
`index.json` → `extensions.currentEvidenceByNetwork`. Mainnet has a fresh
compatible observation set; testnet still points to the expired August 27 set
because its original proxy activation storage was unavailable during refresh.
Retain older sets as immutable historical evidence. The accepted Pyth Contract
generation has bounded registry-only support; this does not establish feed
liveness or a public Prices capability.

Use `node scripts/validate-price-knowledge.ts --network mezo-mainnet` for
mainnet evidence freshness. The default command retains the full-module
deadline and continues to fail until testnet is refreshed. See the
[refresh guide](../../docs/guides/oracle-evidence-refresh.md).

`extensions.currentStateEvidenceByNetwork` separately selects the latest indexed
current-state captures for both networks. These verify runtime identity and feed
observations at their fixed blocks without recapturing historical storage. That
narrower scope does not renew full-history evidence or create a historical
archive prerequisite for the private mainnet reader. See the [selection guide](../../docs/guides/price-selection-and-dex-quotes.md).
Do not use the current-state references as substitutes for historical evidence
or as a permanent supported-feed allowlist.
