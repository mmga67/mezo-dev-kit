# mUSDC lending reference

> Generated from canonical `protocols/lending/musdc` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`; support: `proposed`; review: `accepted`
- Evidence block: `11341710` (`0xcca3b133bbb5282b84fd383d3b73440169a50155cea3288d91067a2ff76c61d0`)
- Writers: none

## Market

- Market ID: `0x6f88e79e8acb3a3ac2f990dcfb83b42ddae96ef406cd735f1721b2a2e1b733db`
- LLTV: `860000000000000000` (WAD-scaled, block-scoped)
- Supply assets/shares: `214046001638` / `213416130394564144`
- Borrow assets/shares: `135552034713` / `135100133166644254`
- Token liquidity: `78493966925`

## Exact formula set

- `to-shares-down`: floor(assets*(totalShares+1e6)/(totalAssets+1))
- `to-shares-up`: ceil(assets*(totalShares+1e6)/(totalAssets+1))
- `to-assets-down`: floor(shares*(totalAssets+1)/(totalShares+1e6))
- `to-assets-up`: ceil(shares*(totalAssets+1)/(totalShares+1e6))
- `interest`: compound=x*n+floor((x*n)^2/(2*WAD))+floor(floor((x*n)^2/(2*WAD))*(x*n)/(3*WAD)); interest=floor(totalBorrowAssets*compound/WAD)
- `fee-shares`: feeAmount=floor(interest*fee/WAD); feeShares=toSharesDown(feeAmount,totalSupplyAssetsAfterInterest-feeAmount,totalSupplyShares)
- `health`: borrowed=toAssetsUp(borrowShares,totalBorrowAssets,totalBorrowShares); maxBorrow=floor(floor(collateral*price/1e36)*lltv/WAD); healthy=maxBorrow>=borrowed
- `liquidation-factor`: min(1.15e18,floor(WAD*WAD/(WAD-floor(cursor*(WAD-lltv)/WAD))))
- `bad-debt`: when collateral becomes zero, remaining borrow shares convert to assets rounding up, capped by totalBorrowAssets; subtract that amount from both totalBorrowAssets and totalSupplyAssets

## Boundary

- Resolve mUSDC token identity from the Native Bridge asset record; market accounting does not own bridge supply.
- Market total supply assets, total supply shares, total borrow assets, total borrow shares, token liquidity, and collateral remain distinct.
- A supplier vault position is one market supply-share owner; do not add its vault assets to market totalSupplyAssets.
- Interest increases market borrow assets and supply assets; fee shares dilute suppliers without creating mUSDC bridge supply.
- Bad debt reduces market borrow assets and supplier assets; it is not classic MUSD bad debt.
- MUSD redemptions, troves, TCR, Stability Pool, and MUSD supply rules are inapplicable.
