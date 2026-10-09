# BTC/mUSDC lending

This Morpho market connects mUSDC supply with borrowing backed by BTC collateral.
Supply shares, borrow shares, collateral, and debt describe different parts of a
position; interest and liquidation affect how those quantities change.

mUSDC is the Native Bridge representation of Ethereum USDC. It is a different
asset from MUSD, and this market uses its own lending and collateral rules.

## Understand the market

Suppliers provide mUSDC to the market. Supply shares track their share of its
supplied assets. Borrowers provide BTC collateral and take on mUSDC debt, tracked
through borrow shares. The two kinds of shares have different conversions;
neither is simply a token balance. The [lending reference](generated/reference.md)
defines those conversions, interest calculations and rounding rules.

Interest changes the relationship between shares and asset amounts. To assess
a borrower, the model combines accrued debt with the collateral and the price
from the market's configured oracle. The
[price-selection guide](../../../../docs/guides/price-selection-and-dex-quotes.md)
explains why another feed or a trade quote cannot silently replace that input.
Liquidation and any remaining unpaid debt follow this market's own rules.

The [USDC Lending Vault](../../vaults/usdc-lending/README.md) is a depositor
product that allocates to this market. Its depositors own vault shares, which
are different from the market supply shares held for that allocation. Follow
the vault page when the question concerns a depositor's claim or withdrawal.

## Interpret balances and liquidity

Supply shares, borrow shares, collateral and debt use distinct units. Read them
at the same chosen block before combining them. Accounting liquidity describes
the market's balances; available token liquidity is another part of checking an
operation. Neither an old balance nor a successful preview guarantees a later
borrow or withdrawal.

The [Lending SDK](../../../../packages/protocols/musdc-lending/README.md)
provides market and account reads, calculations and direct supply, collateral,
borrowing and repayment workflows. Its scope is the recorded market, and its
documentation explains operation and release limits.

This market does not participate in classic MUSD borrower positions, collateral
ratios, Stability Pool, or redemptions. The SDK documentation above identifies
implemented operations and their review and release limits.

## Quick links

| Link                                                                               | What you will find                                               |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Lending reference](generated/reference.md)                                        | Market identity, share conversions, interest and evidence scope. |
| [Lending SDK](../../../../packages/protocols/musdc-lending/README.md)              | Account and market reads, calculations and direct workflows.     |
| [USDC Lending Vault](../../vaults/usdc-lending/README.md)                          | The separate depositor claim on funds allocated to this market.  |
| [Price-selection guide](../../../../docs/guides/price-selection-and-dex-quotes.md) | How to choose and interpret a suitable price input.              |
| [Module index](index.json)                                                         | Exact market, accounting, oracle, fixture and evidence records.  |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
