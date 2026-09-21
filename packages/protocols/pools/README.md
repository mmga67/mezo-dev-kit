# Pools and liquidity positions

`@mezo-dev-kit/pools` reads basic and concentrated-liquidity pools, calculates pool math and fees, and manages liquidity positions. Use it for pool and position accounting; Swaps handles route quotes and exchange workflows.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the basic liquidity walkthrough](../../../examples/provide-basic-liquidity/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

For concentrated liquidity, use the [position walkthrough](../../../examples/manage-cl-position/README.md).

## Choose a workflow

| Area                   | Available work                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Basic pools            | Read reserves, live balances and LP holdings; add/remove liquidity; collect wallet LP fees            |
| Concentrated liquidity | Read bounded NFTs/ticks; mint, increase/decrease, collect, and burn a cleared self-owned unstaked NFT |
| Calculations           | Exact fee, tick, liquidity, and swap-step helpers                                                     |

Pools are discovered through verified roots and factory mappings. Applications
supply the account, pool or NFT selection, transport, and explicit execution.
[Incentives](../incentives/README.md) owns gauge staking and emissions.

## Amounts and scope

The private writer profile covers checked MUSD, mUSDC, and mUSDT generations in
existing initialized pools. Other pools may be readable without being writable.
Native BTC, fee-on-transfer/rebasing assets, and new-pool creation are outside
this writer profile.

Approvals are independent transactions. Token minimums and deadlines can be
on-chain constraints; minimum LP output and fee-claim minimums are preflight
checks. Principal, manager accounting, actual wallet transfers, fees, and native
gas remain separate. See [execution details](REFERENCE.md) before preparing an operation.

The package is private Node source and requires qualified protocol review before
release. Local-fork examples retain their documented funding/gas fixtures and
verification limits. [Pool knowledge](../../../knowledge/protocols/pools/README.md)
owns the models and source evidence.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/pools check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
