# Deposit MUSD and understand Savings receipts

Start with [depositMusd](deposit.ts). Supply a [write connection](../SETUP.md),
a persisted operation ID, an amount in MUSD base units and `SavingsBounds`.
The function checks the exact approval, prepares again after approval, simulates,
asks for consent and returns the reconciled deposit.

Savings principal receipts represent deposited principal 1:1; Savings is not
an ERC-4626 vault with a changing share price. Indexed MUSD yield is separate
from principal. An unavailable yield read is not zero yield.

[saveMusd](workflow.ts) composes deposit, optional gauge staking, available yield
claim and withdrawal for an initially empty position. The caller supplies the
amount; nothing seeds artificial yield. An immediate read may have no claimable
yield, so the recipe skips that claim. Real applications usually expose deposit,
claim and withdrawal as separate user actions over time.

[gaugeOperation](gauge.ts) explains a different accounting boundary: staking
moves receipts into gauge custody without creating another Savings deposit.
Gauge rewards are distinct from indexed MUSD yield. Unstake before withdrawing
wallet receipts. Each approval and action requests its own consent.

See the [Savings reference](../../packages/protocols/musd-savings/REFERENCE.md)
for current methods, unavailable results and release limits.
