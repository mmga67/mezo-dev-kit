# Pools

Private basic-pool and concentrated-liquidity SDK. The
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

CL math uses source-derived TickMath coefficients, explicit floor/ceil amounts,
uint128 liquidity limits and modular fee growth. `createCLPoolReader` verifies
accepted roots, clones, factory and gauge mappings at one block. It reads up to
16 explicit NFTs and 32 additional ticks, preserves empty-pool state, separates
active/staked/position liquidity and proves a supplied depositor through the
gauge stake set. Unknown depositors remain null.

`createCLPositionWriter` handles self-owned unstaked MUSD/mUSDC NFTs: mint into
existing initialized pools, increase/decrease liquidity, collect and burn a
cleared NFT. Explicit approvals, token/liquidity/price/time bounds and exact
simulation precede submission. Settlement separates removed principal credit
from wallet payment, manager collection accounting from actual pool transfers,
and token amounts from native gas. It checks NFT, tick and pool state as well
as events. These private operations still require qualified review before release.

The opt-in `test/cl-fork.ts` command takes the same localhost/source RPC arguments
and checks bounded pool/NFT reads plus wrong-code/mapping/anchor failures.
Append `positions` to run the twelve-operation NFT lifecycle and range rebalance,
including recovery from a rejected replacement mint after collection. It uses
local funding and a 1-wei gas-price fixture. Every mutation is confined to the
verified local fork and reverted. This does not qualify native engine behavior.
The reference explains independent transaction checkpoints, retained wallet
funds, the new NFT ID, and retirement of the empty old NFT.

CL exact-input step, fee-split and bitmap helpers support bounded Swaps quotes.
They preserve source rounding, signed word traversal and the token0 overflow
fallback. The fee scale and source digests derive from retained accepted source.
Quotes, router execution and multi-pool outcomes remain owned by Swaps.
