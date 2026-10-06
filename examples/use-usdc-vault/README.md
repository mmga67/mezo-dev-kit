# Deposit into the USDC lending vault

Start with [depositIntoVault](deposit.ts). Pass a [write connection](../SETUP.md),
operation ID, mUSDC asset base units and `VaultBounds`. A deposit exchanges assets
for vault shares; the return value contains actual reconciled assets and shares.
Approvals and the deposit each require consent.

[useUsdcVault](workflow.ts) composes deposit and redemption for an initially
empty account. Set `assets` explicitly. With `wrapAndStake`, the wrapper converts
vault shares into receipts and stakes them; the recipe then unstakes, unwraps
and redeems the actual wallet shares. Vault shares, wrapper receipts and gauge
stake are separate balances.

The advanced recipe derives illustrative output minimums from a forecast.
Preview amounts can change before inclusion. Adapter assets are already
included in vault total assets; do not count them again. Current `max*` getters
returning zero are not useful capacity estimates. Reconciliation and
`boundsSatisfied` describe the real outcome; a failed later action does not
undo earlier transactions.

See the [Vault reference](../../packages/protocols/usdc-lending-vault/REFERENCE.md)
for liquidity, wrapper yield, rounding and private release limits.
