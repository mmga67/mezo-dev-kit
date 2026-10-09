# BTC/mUSDC lending

This Morpho market connects mUSDC supply with borrowing backed by BTC collateral.
Supply shares, borrow shares, collateral, and debt describe different parts of a
position; interest and liquidation affect how those quantities change.

mUSDC is the Native Bridge representation of Ethereum USDC. It is a different
asset from MUSD, and this market uses its own lending and collateral rules.

## Understand the market

- [Lending reference](generated/reference.md): market structure, exact formulas, and evidence boundaries.
- [Lending SDK](../../../../packages/protocols/musdc-lending/README.md): market/account reads, calculations, and direct workflows.
- [USDC Lending Vault](../../vaults/usdc-lending/README.md): the depositor product that allocates to this market.
- [Price selection guide](../../../../docs/guides/price-selection-and-dex-quotes.md): distinguish market oracle inputs from other price observations.

## Interpret balances and liquidity

Supply shares, borrow shares, collateral, and debt use distinct units. A recorded
market state or liquidity value does not guarantee a later borrow or withdrawal.
Check the observation's contract version and block before using it.

This market does not participate in classic MUSD borrower positions, collateral
ratios, Stability Pool, or redemptions. The SDK documentation above identifies
implemented operations and their review and release limits.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
