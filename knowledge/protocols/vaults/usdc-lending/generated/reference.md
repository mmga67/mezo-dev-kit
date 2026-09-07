# USDC Lending Vault reference

> Generated from canonical `protocols/vaults/usdc-lending` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`; support: `proposed`; review: `accepted`
- Evidence block: `11341710` (`0xcca3b133bbb5282b84fd383d3b73440169a50155cea3288d91067a2ff76c61d0`)
- Writers: none

## Layers

- `vault-v2`: mUSDC assets are represented by VaultV2 shares; allocation is delegated to reviewed adapters.
- `morpho-market-adapter`: the vault owns one Morpho supply-share position; borrower accounting stays in the lending module.
- `receipt-wrapper`: the wrapper custodies VaultV2 shares, mints receipts, and earmarks high-water-mark vault-share yield.
- `vault-gauge`: the gauge custodies wrapper receipts for beneficial stakers and accounts incentives-owned rewards.

## Current state

- Vault total assets / shares: `214046510838` / `213533948745915965719373`
- Adapter real assets: `214046510838` (included in vault total assets)
- Wrapper receipts: `203467332276561200733370`
- Wrapper accumulated yield shares: `33643321564473710328`
- Gauge stake: `203467332276561200733370`
- Adapter queue entries: `1`; allocation cap dimensions: `3`
- Enabled gates: `0` of `4` at the evidence block
- Curator timelock inventory: `18` selectors; nonzero durations: `0`; abdicated: `0`

## Conversion and liquidity

- Vault deposit: floor(assets*(newTotalSupply+virtualShares)/(newTotalAssets+1))
- Wrapper deposit: floor(vaultShares*(receiptSupply+1e6)/(userVaultShares+1e6))
- Allocation: Deposits allocate to liquidityAdapter; withdrawals use idle assets first and then request exact shortfall deallocation.

## Reconciliation

- VaultV2 totalAssets includes the adapter value; the adapter's market supply assets are not additive.
- VaultV2 shares held by the wrapper split into userVaultShares and accumulatedYield exactly once.
- Wrapper totalSupply is receipt accounting and is not VaultV2 totalSupply or mUSDC assets.
- Gauge totalSupply represents staked wrapper receipts; beneficial ownership replaces wallet custody for those receipts.
- Borrower debt and collateral remain in protocols/lending/musdc.
- MEZO emissions and redirected vault-share yield are different assets and different accounting owners.
- mUSDC representation supply remains a Native Bridge fact, not vault TVL.
