# Mezo economic-system composition

This map explains how Mezo's separately maintained economic domains compose
under the [domain boundary](../manifest#separate-economic-owners).
It does not own addresses, ABIs, formulas,
governed values, or live state.

## Stable owners

| Surface            | Module                                                 | Boundary                                                                                                  |
| ------------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Classic MUSD       | `protocols/musd` and its borrowing/redemption children | Token debt, troves, system aggregates, and redemptions                                                    |
| MUSD Savings       | `protocols/musd/savings`                               | sMUSD principal, yield index, protocol/strategy yield ingress, and savings-gauge stake boundary           |
| mUSDC market       | `protocols/lending/musdc`                              | Morpho market parameters, supply/borrow shares, BTC collateral, interest, health, and liquidation         |
| USDC Lending Vault | `protocols/vaults/usdc-lending`                        | Vault shares, market allocation, wrapper receipts, available liquidity, and vault-gauge yield redirection |
| Incentives         | `protocols/incentives`                                 | ve power, voting, epochs, weights, emissions, generic gauges, and rewards                                 |
| Pools              | `protocols/pools`                                      | AMM/CL pool state, LP positions, fees, and pool-gauge boundaries                                          |
| Asset movement     | `workflows/bridges`                                    | mUSDC/MUSD representations, routes, and terminal cross-chain delivery                                     |
| Price inputs       | `prices`                                               | Feed identity, typed datums, scaling, confidence, and freshness                                           |
| Identity/execution | `networks`, `contracts`, `workflows/transactions`      | Chain, deployment/ABI, and transaction lifecycle ownership                                                |

## Stable composition edges

These are logical references, not copied protocol facts:

| Consumer                           | Required owner resource                                  |
| ---------------------------------- | -------------------------------------------------------- |
| MUSD Savings principal             | `contracts:contract-deployments:musd.token@mezo-mainnet` |
| MUSD Savings fee ingress           | `contracts:contract-deployments:musd.pcv@mezo-mainnet`   |
| MUSD Savings gauge semantics       | `protocols/incentives:incentives-gauges-rewards`         |
| mUSDC market loan identity         | `workflows/bridges:bridge-assets:usdc-native-bridge`     |
| mUSDC market price dependency      | `prices:price-sources-feeds`                             |
| USDC Lending Vault market          | `protocols/lending/musdc:musdc-lending-market`           |
| USDC Lending Vault gauge semantics | `protocols/incentives:incentives-gauges-rewards`         |
| Shared mutation lifecycle          | `workflows/transactions:transaction-client-requirements` |

The [knowledge overview](../../knowledge/README.md) and its root catalog route
to the owning modules, generated references, and scoped evidence. Each module
retains its review and support state. Catalog membership does not establish an
executable capability.

Contracts owns registry identity and provenance. Dynamic or role-resolved
components remain in their protocol records unless they independently satisfy
the [contract provenance policy](../manifest#contract-identity-and-provenance).

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
5. Use `workflows/transactions` for the shared mutation lifecycle and require
   the owning protocol's post-state reconciliation in addition to receipt
   success.
6. Treat whitepaper/product descriptions as intent and orientation. Current
   executable claims require Contracts identity plus block-pinned state and
   version-matched source evidence.

## Lifecycle

The ownership graph follows the manifest. Owning modules record the evidence
and review scope of their knowledge models; package owners record implemented
interfaces and qualification limits. Use the [SDK reference](../reference/sdk.md)
for current private readers and writers. This map establishes no package
release or additional operation support.
