# mUSDC lending reader

See the [SDK reference](REFERENCE.md) for reader/calculation methods, port signatures, results, errors, and examples.

Private source-alpha candidate for the accepted mainnet BTC/mUSDC Morpho market.
The maintainer accepted lending reader review on 2026-09-07. Import only
`@mezo-dev-kit/musdc-lending` after building the workspace.

`createLendingReader({ networkId, registry, transport, codec }).read({ account,
blockNumber?, maxPriceAgeSeconds })` returns one block number/hash and timestamp.
Use the public Contracts registry. The application supplies an ABI codec and a
Core-compatible transport with block timestamps, code/storage reads, and a
`getTokenBalance` port. Every port must honor the supplied coordinate; decoded
scalars are bigint or address strings and multi-output/tuple results are ordered
arrays. `borrowRateView` receives two tuple arguments. A provider adapter must
normalize its own response format accordingly.

The token balance port reads the generated, Bridge-evidenced mUSDC representation
at Morpho's address. This does not introduce a static token Contract identity.
Do not substitute Morpho's accounting liquidity for this actual token balance.
Neither value proves that a withdrawal or borrow transaction would succeed.

The reader checks the whole market tuple, IRM/Morpho and oracle/feed back-links,
scaling, root code hashes, and the oracle implementation against accepted
Contracts evidence. An unsupported generation, topology conflict, or changed
block invalidates the snapshot. Missing optional reads remain unavailable with
error codes. A latest-block request pins the head once, then rechecks it across
all stages; it does not imply finality.

Stored totals exclude unaccrued interest. Accrued totals use the deployed
three-term Taylor formula and fee-share dilution at the block timestamp.
Supply assets round down; debt rounds up. Projected fee-recipient assets include
newly accrued fee shares. Stored position shares remain separately visible.
Supply shares, borrow shares, collateral BTC wei, and mUSDC assets/debt have
separate quantity tags. Calculations use bigint, checked uint256 intermediate
products, and the market's uint128 storage bounds.

`maxPriceAgeSeconds` is an explicit caller policy. Health requires the market
oracle's value to match its direct Skip feed after exact normalization; the
feed's update timestamp must be present, not future, and no older than that
policy at the block timestamp. Equality at the maximum age is valid. Skip's
zero round fields are accepted for this verified source generation. Stale,
missing-time, future, disagreement, malformed, and transport failures remain
explicit. A zero-debt position is healthy without a price; unknown debt is not
zero. The timestamp check describes freshness at the requested block, not at
wall-clock time. No price fallback is attempted.

Canonical ownership remains with stable module resources
`protocols/lending/musdc`, `contracts`, `networks`, `prices`, and
`workflows/bridges`. Generate the bounded projection with
`node scripts/generate-lending-package.ts` from the repository root. Evidence
dates and input digest accompany each snapshot; dates do not refresh themselves.
Follow the [evidence refresh guide](../../../docs/guides/oracle-evidence-refresh.md).
The market evidence's current review deadline is represented by the generated
input; run the scoped evidence checks before evaluating release readiness.

```sh
pnpm --filter @mezo-dev-kit/musdc-lending check
pnpm --filter @mezo-dev-kit/musdc-lending test:shuffle
pnpm check:readers:mainnet
```

Tests exercise deterministic arithmetic and public-registry orchestration with
synthetic transport/codec ports and hash-verified historical runtime bytes. They
do not certify a production ABI encoder or RPC adapter. Direct supply, withdraw, collateral, borrow and repay writers now use Core execution and explicit token approvals. These private candidates require qualified review before release; liquidation and delegated account flows remain outside this API. Browser
bundling is not certified; runtime code hashing currently uses Node crypto.

## Inspect this checkout

Use the [manifest](./package.json) and [exported entrypoint](./src/index.ts)
alongside this package's scope and injected-input contract. Build before
interpreting a missing artifact as an absent API. The [usage example](../../../examples/musdc-lending-readonly/README.md)
exercises the workspace boundary. Reassess these owners after checkout changes;
private versions alone do not identify capability changes. Follow the
[capability guidance maintenance rule](../../../CONTRIBUTING.md#keep-capability-guidance-current)
when the public boundary, required inputs, or evidence dependencies change.
