# Prices

Private TypeScript package for explicit decimal normalization, confidence and
freshness, plus a signer-free mainnet Skip BTC/USD reader. See the
[SDK reference](REFERENCE.md) for every method, result and example.

Borrowing uses its deployed MUSD PriceFeed and Lending uses its deployed market
oracle. They reuse the pure helpers here while retaining those protocol paths
and domain errors. A direct Skip observation is a pushed feed; it does not
replace protocol oracle state. The reader verifies canonical native interface
bytes and block/chain consistency. It does not reproduce mezod native dispatch.

Inputs use bigint base units, explicit rounding and caller-supplied Unix times.
Missing confidence remains null. There is no default max age, automatic fallback,
price updater, HTTP endpoint, subscription or clock. Supply a Core RpcTransport
with application-owned credentials, timeouts and cancellation. Canonical model
inputs come from indexed Prices records through the root generator.

This package is private and uses Node crypto through Core. Browser distribution
and production support require their own validation and release review.

```sh
pnpm --filter @mezo-dev-kit/prices check
```

After `pnpm build`, an opt-in public-import probe reads Skip and scans/resumes
four MUSD event blocks. It only permits read RPC methods and bounds response size:

```sh
node packages/prices/test/live.ts "$SOURCE_RPC_URL"
```

Run this from the repository root with your own mainnet RPC. It is a current
observation, not a promotion of canonical evidence or proof of log completeness
across other ranges/providers.
