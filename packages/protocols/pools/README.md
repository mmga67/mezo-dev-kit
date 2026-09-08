# Pools

Private basic-pool discovery and liquidity SDK. The
[SDK reference](REFERENCE.md) documents every exported method/type and examples.

`createBasicPoolReader` verifies the mainnet Router/PoolFactory, their discovered
FactoryRegistry and implementation, the standard minimal proxy, factory mapping,
Router prediction, token order and stable flag at one block. It reads reserves,
live balances, LP supply/custody, token allowances and the account's LP position.
Dynamic pool addresses are observations, not new static Contract IDs.

`createBasicLiquidityWriter` prepares, simulates, submits and reconciles
add/remove liquidity for initialized MUSD/mUSDC pools. Both token generations
are checked; mUSDC proxy/implementation changes invalidate its writer profile.
Other basic pools remain readable with `writeCompatible: false`. Native BTC
needs separate gas-aware wallet reconciliation and is not in this writer slice.
Fee-on-transfer/rebasing assets and new-pool creation are not implemented.

Approvals are explicit independent transactions for desired maxima or exact LP
shares. Reprepare after confirmation. Token minimums and deadlines are on-chain;
minimum LP output is verified in initial/final simulation but is not an on-chain
Router argument. Applications own consent, signer, RPC bounds, atomic storage
and whole-flow recovery. No new external client dependency is needed.

Qualified protocol review and release remain outstanding. Source/runtime
provenance is indexed in Contracts; mUSDC's fully verified explorer bytes match
RPC, but independent Solidity 0.8.29 reproduction was not performed. Node crypto
is used; browser distribution has not been verified.

```sh
pnpm --filter @mezo-dev-kit/pools check
pnpm build
node packages/protocols/pools/test/fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL"
```

The fork harness checks the source parent read-only, funds only local accounts,
runs add/partial-remove/final-remove through public imports, and reverts its
snapshot. It preserves token, Router, factory and pool code and uses no native
oracle/token fixture. Run it sequentially with other local fork harnesses.

`calculateBasicPoolFees` and `calculateBasicSwapFee` preserve exact fee rounding.
`createBasicPoolFeeWriter` collects wallet LP fees, including stored claims after
full LP withdrawal. It uses no approval and reconciles PoolFees payments and
zero pending credit. Claim minimums are preflight bounds, not contract arguments.
