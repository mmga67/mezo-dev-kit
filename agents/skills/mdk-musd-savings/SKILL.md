---
name: mdk-musd-savings
description: Resolve, calculate, verify, or maintain Mezo MUSD Savings principal receipts, indexed MUSD yield, PCV/converter flow, strategy, gauge custody, reward boundaries, and reconciliation through the v0.4 Savings module. Use for evidence-backed reads and deterministic rules; all writers remain unsupported.
---

# MUSD Savings knowledge

## Use when

Use for MUSD Savings/sMUSD accounting, pending or indexed yield, PCV fee
recipient flow, BTC conversion into MUSD yield, the current strategy, gauge
stake, or maintenance of `knowledge/protocols/musd/savings`.

Do not use it for classic troves/TCR, MUSD redemptions, ERC-4626 exchange-rate
math, mUSDC lending, portfolio yield projections, or a writer.

## Required context

1. Read the active task, applicable `AGENTS.md`, the knowledge-maintenance
   skill, and `knowledge/protocols/musd/savings/README.md`.
2. Resolve the module through its `index.json`; load only the required model,
   roles, reconciliation, fixture, evidence, or review resource.
3. Load `mdk-musd-knowledge` for classic boundaries,
   `mdk-incentives-knowledge` for gauge/reward semantics, and
   `mdk-transaction-execution` only for future-operation gates.
4. For authored scripts, also load `mdk-typescript-development` and
   `mdk-testing`.

## Procedure and invariants

1. Pin the network, Savings proxy generation, roles, PoolsVoter gauge mapping,
   PCV recipients, and reverse links at one block.
2. Treat deposit and withdrawal principal as 1:1 MUSD/sMUSD. Savings is not
   ERC-4626.
3. Apply the exact yield-index order: zero supply buffers; nonzero supply
   floors the ratio and rejects a zero ratio; user updates floor balance times
   index delta.
4. Keep principal receipts, pending yield, indexed/unclaimed MUSD yield, paid
   yield, wallet receipts, gauge beneficial stake, redirected voter revenue,
   and MEZO rewards separate.
5. Keep all Savings balances outside classic troves, TCR, Stability Pool, and
   redemption accounting.
6. Resolve strategy, converter, and gauge through reviewed roots/current
   getters rather than turning dynamic roles into timeless registry facts.
7. Treat operation records as requirements only. Writer support is `none`.

## Verification and stop conditions

Run the three module checks plus relevant MUSD, incentives, Contracts,
transactions, root-catalog, link, JSON/type, and whitespace checks. Stop when
proxy/source/role evidence conflicts, the PCV/gauge reverse link fails,
principal and yield would be merged, ERC-4626 math would be imported, proposed
scope would be presented as supported, or a writer/public API change is
required.
