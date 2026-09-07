# Mezo economic-system composition

This is the human system map established by ADR-0011. It explains how the
separate knowledge owners compose; it does not own addresses, ABIs, formulas,
governed values, or live state.

## Stable owners

| Surface | Module | Boundary |
| --- | --- | --- |
| Classic MUSD | `protocols/musd` and its borrowing/redemption children | Token debt, troves, system aggregates, and redemptions |
| MUSD Savings | `protocols/musd/savings` | sMUSD principal, yield index, protocol/strategy yield ingress, and savings-gauge stake boundary |
| mUSDC market | `protocols/lending/musdc` | Morpho market parameters, supply/borrow shares, BTC collateral, interest, health, and liquidation |
| USDC Lending Vault | `protocols/vaults/usdc-lending` | Vault shares, market allocation, wrapper receipts, available liquidity, and vault-gauge yield redirection |
| Incentives | `protocols/incentives` | ve power, voting, epochs, weights, emissions, generic gauges, and rewards |
| Pools | `protocols/pools` | AMM/CL pool state, LP positions, fees, and pool-gauge boundaries |
| Asset movement | `workflows/bridges` | mUSDC/MUSD representations, routes, and terminal cross-chain delivery |
| Price inputs | `prices` | Feed identity, typed datums, scaling, confidence, and freshness |
| Identity/execution | `networks`, `contracts`, `workflows/transactions` | Chain, deployment/ABI, and transaction lifecycle ownership |

## Stable composition edges

These are logical references, not copied protocol facts:

| Consumer | Required owner resource |
| --- | --- |
| MUSD Savings principal | `contracts:contract-deployments:musd.token@mezo-mainnet` |
| MUSD Savings fee ingress | `contracts:contract-deployments:musd.pcv@mezo-mainnet` |
| MUSD Savings gauge semantics | `protocols/incentives:incentives-gauges-rewards` |
| mUSDC market loan identity | `workflows/bridges:bridge-assets:usdc-native-bridge` |
| mUSDC market price dependency | `prices:price-sources-feeds` |
| USDC Lending Vault market | `protocols/lending/musdc:musdc-lending-market` |
| USDC Lending Vault gauge semantics | `protocols/incentives:incentives-gauges-rewards` |
| Future mutation lifecycle | `workflows/transactions:transaction-client-requirements` |

The root knowledge catalog resolves all three new owners and their generated
references. Savings evidence review through vault evidence review qualified review accepted their bounded
knowledge models. Protocol support remains `proposed`, operation support
remains `none`, and catalog membership is discovery rather than public-capability
promotion. Contracts separately owns six accepted registry roots: the Savings
proxy, Morpho, IRM, market oracle, vault adapter, and receipt-wrapper proxy.
Dynamic or role-resolved components remain in their owning protocol records
unless they independently satisfy the Contract provenance policy.

## Value-flow map

```text
Classic MUSD borrowing activity
  └─ protocol fees / BTC fees
       └─ governed PCV and conversion boundary
            └─ MUSD Savings yield-index accounting
                 ├─ unstaked sMUSD → holder claimable MUSD yield
                 └─ staked sMUSD → redirected MUSD voter revenue
                                      + MEZO gauge emissions

USDC bridge representation
  └─ mUSDC loan asset in BTC/mUSDC Morpho market
       ├─ borrower BTC collateral / debt / interest / liquidation
       └─ supplier assets and market supply shares
            └─ USDC Lending Vault allocation
                 ├─ held vault shares → borrower-interest appreciation
                 └─ wrapped and staked shares → redirected vault-share yield
                                              + MEZO gauge emissions
```

The two branches meet through voting and emissions, not through shared debt or
share accounting. Pools compete for the same accepted incentives surface but
retain their own fee, liquidity, and position models.

## Reconciliation rules

1. Resolve every edge through the source module's stable module/resource/record
   IDs before reading its physical file.
2. Pin deployed values to a common block whenever a result combines current
   state from more than one contract or module.
3. Preserve units and identities: MUSD, sMUSD, mUSDC, Morpho supply/borrow
   shares, Vault V2 shares, wrapper receipts, gauge stake, redirected revenue,
   MEZO emissions, and claimable rewards are not interchangeable.
4. Count a position's economic path once. A staked savings or lending-vault
   position cannot simultaneously receive the direct yield that its gauge path
   redirects.
5. Use `workflows/transactions` for any future mutation lifecycle and require
   the owning protocol's post-state reconciliation in addition to receipt
   success.
6. Treat whitepaper/product descriptions as intent and orientation. Current
   executable claims require Contracts identity plus block-pinned state and
   version-matched source evidence.

## Lifecycle

ADR-0011 accepts the ownership graph. Savings evidence review through vault evidence review qualified Level
3 review accepted the three bounded protocol models and the associated scoped
Contract dispositions. Their protocol support remains proposed and no public
reader or writer is available. The composition map therefore describes
accepted ownership and reviewed knowledge boundaries, not a released
capability surface.
