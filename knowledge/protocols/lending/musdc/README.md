# BTC/mUSDC lending

Understand the BTC-collateralized mUSDC Morpho market: shares, interest, health, liquidation, and bad debt. mUSDC is the Native Bridge representation of Ethereum USDC and is distinct from MUSD.

## Start here

- [Lending reference](generated/reference.md): market structure, exact formulas, and evidence boundaries.
- [Lending SDK](../../../../packages/protocols/musdc-lending/README.md): market/account reads, calculations, and direct workflows.
- [USDC Lending Vault](../../vaults/usdc-lending/README.md): the depositor product that allocates to this market.
- [Price selection guide](../../../../docs/guides/price-selection-and-dex-quotes.md): distinguish market oracle inputs from other price observations.

## Scope and evidence

The bounded model and Contract roots have accepted review; knowledge support
remains proposed. SDK availability and operation review are documented by the
package. This market does not participate in classic MUSD troves, collateral
ratios, Stability Pool, or redemptions.

Supply shares, borrow shares, collateral, and debt use distinct units. A recorded
market state or liquidity value does not guarantee a later borrow or withdrawal.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
