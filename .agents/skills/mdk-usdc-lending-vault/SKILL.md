---
name: mdk-usdc-lending-vault
description: Resolve, calculate, verify, or maintain the Mezo USDC Lending Vault, Morpho allocation, VaultV2 and wrapper share math, high-water yield, liquidity, gauge custody, and reconciliation through the v0.4 vault module. Use for evidence-backed reads and deterministic rules; all writers remain unsupported.
---

# USDC Lending Vault knowledge

## Use when

Use for the current USDC Lending Vault, VaultV2 shares, Morpho allocation,
wrapper receipts, high-water-mark yield, liquidity/deallocation, gauge custody,
or maintenance of `knowledge/protocols/vaults/usdc-lending`.

Do not use it for borrower health/liquidation, MUSD Savings, retired Stablecoin
Vaults, generic vault strategy advice, APY forecasts, or a writer.

## Required context

Read the active task, applicable `AGENTS.md`, knowledge-maintenance skill, and
module README/index. Load `mdk-musdc-lending` for the underlying market,
bridge knowledge for mUSDC identity, incentives knowledge for gauge rewards,
contract knowledge for generations, and transaction execution for future
operation gates. Load TypeScript/testing skills when changing code.

## Procedure and invariants

1. Resolve the current vault, adapter, receipt wrapper, gauge, and market at
   one block; distinguish them from retired or partner vault generations.
2. Use VaultV2's exact fee-aware preview formulas and rounding. Current
   `max*` getters return zero and are not capacity estimates.
3. Treat adapter `realAssets` as included in vault total assets, not additive.
   Market supply shares, mUSDC liquidity, and borrower debt remain distinct.
4. For wrapper math, subtract accumulated yield from wrapper-held vault shares,
   use both 1e6 virtual terms, and preserve the nondecreasing high-water mark.
5. Count a receipt either in wallet custody or as a gauge beneficial stake;
   never both.
6. Keep redirected VaultV2 yield shares, MEZO emissions, other voter revenue,
   and claimable rewards separate by asset and owner.
7. Route borrower semantics to `protocols/lending/musdc` and gauge formulas to
   incentives. Writer support is `none`.

## Verification and stop conditions

Run the module checks plus underlying lending, bridge, incentives, Contracts,
transactions, troubleshooting, root-catalog, link, JSON/type, and whitespace
checks. Stop when current/retired topology conflicts, cap/queue/gate/timelock
state is insufficient for the risk, liquidity or rounding is ambiguous,
shares/assets/rewards would be double-counted, proposed scope would be
presented as supported, or a writer/public API change is required.
