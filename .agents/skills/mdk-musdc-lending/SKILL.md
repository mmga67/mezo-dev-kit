---
name: mdk-musdc-lending
description: Resolve the BTC/mUSDC Morpho market, shares, interest, health, liquidation and oracle dependencies. Evidence and calculations; no writers.
---

# mUSDC lending knowledge

## Use when

Use for the current BTC/mUSDC market, Morpho supply/borrow conversions,
interest accrual, health, liquidation, bad debt, liquidity, or maintenance of
`knowledge/protocols/lending/musdc`.

Do not use it for MUSD troves/redemptions, bridge execution, the supplier
vault's depositor shares, generic Morpho markets, APR forecasts, or a writer.

## Required context

Reuse current task/instructions. Read owning package docs for code work and
module README/index for protocol evidence. Load knowledge-maintenance only
when changing knowledge or generated projections. Load bridge knowledge for mUSDC representation identity,
price knowledge for the oracle datum, contract knowledge for deployed
generations, transaction execution for future gates, and TypeScript/testing
skills when changing scripts or tests.

## Procedure and invariants

1. Resolve the exact market ID back to its loan token, collateral token,
   oracle, IRM, and LLTV at one block.
2. Resolve mUSDC through `workflows/bridges:bridge-assets:usdc-native-bridge`;
   never classify it as MUSD.
3. Keep asset amounts, supply shares, borrow shares, collateral, accrued debt,
   token liquidity, and vault-owned supply shares separate.
4. Use the deployed generation's virtual shares/assets and exact upward/downward
   rounding for every call path. Debt and health use borrow-share conversion
   upward.
5. Accrue interest with the three-term Taylor order before health-sensitive
   operations; keep fee-share dilution distinct from asset interest.
6. Evaluate health with a same-timestamp oracle result and apply liquidation
   and bad-debt ordering exactly.
7. Route vault depositor accounting to `protocols/vaults/usdc-lending` and
   keep all classic MUSD aggregates inapplicable.
8. Writer support is `none`; operation records are future requirements only.

## Verification and stop conditions

Run the module checks plus bridge, prices, Contracts, Networks, transactions,
troubleshooting, root-catalog, link, JSON/type, and whitespace checks. Stop
when tuple/source/oracle/IRM identity conflicts, a datum is stale or
unclassified, rounding is ambiguous, bridge/vault/classic-MUSD values would be
merged, proposed scope would be presented as supported, or a writer/public API
change is required.
