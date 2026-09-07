# MUSD Savings reference

> Generated from canonical `protocols/musd/savings` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`; support: `proposed`; review: `accepted`
- Evidence block: `11341710` (`0xcca3b133bbb5282b84fd383d3b73440169a50155cea3288d91067a2ff76c61d0`)
- Writers: none

## Accounting boundary

- transfer amount MUSD in and mint exactly amount sMUSD
- update and claim yield, burn exactly amount sMUSD, then transfer exactly amount MUSD out
- Yield update: delta=yieldIndex-supplyYieldIndex[user]; share=floor(balance[user]*delta/1e18); claimableYield[user]+=share; supplyYieldIndex[user]=yieldIndex
- sMUSD principal, claimable MUSD yield, gauge stake, and MEZO rewards are separate values.
- Savings state does not enter troves, TCR, Stability Pool, or redemptions.

## Current topology

- Savings proxy: `0xb4D498029af77680cD1eF828b967f010d06C51CC`
- Strategy: `0x0C0944713c185ea3e64F5609ECee3fB3C054a295` (resolved through the Savings root)
- Gauge: `0x677817bF3e44b90E8F95222F75e2950b7904a401` (must equal PoolsVoter discovery)
- Indexed principal supply: `7504423965490150381024223`
- Yield index: `210317627923623228`

## Double-counting guards

- do not add Savings-held MUSD to MUSD total supply
- do not add sMUSD totalSupply to classic MUSD debt
- do not count the same receipt in a wallet and in a gauge
- do not merge claimable MUSD yield with claimable MEZO rewards

Stable references: 7; see `review/gaps.md` before relying on proposed identities.
