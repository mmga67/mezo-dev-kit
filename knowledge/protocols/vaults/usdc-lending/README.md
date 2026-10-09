# USDC Lending Vault

The USDC Lending Vault accepts mUSDC and allocates supplied assets to the Morpho
lending market. Vault shares record a depositor's interest in the vault. A
separate wrapper and Mezo Earn gauge add another layer of receipts and rewards.

Follow those layers to understand what you own, where yield goes, and how much
liquidity is available to withdraw. A vault share, a wrapper receipt, and a
reward balance represent different claims.

## Follow a deposit through the layers

- [Vault reference](generated/reference.md): layers, conversions, liquidity, and reconciliation.
- [Vault SDK](../../../../packages/protocols/usdc-lending-vault/README.md): reads, previews, and direct vault/wrapper workflows.
- [Lending market](../../lending/musdc/README.md): underlying market debt and liquidation.
- [Incentives](../../incentives/README.md): voting, emissions, and rewards.

## Check the claim and available liquidity

VaultV2 shares, wrapper receipts, Morpho shares, available mUSDC, redirected
vault-share yield, and MEZO rewards are distinct. The adapter and wrapper are
registered contracts; the vault and gauge must be resolved through the relevant
contract relationships. A listed contract or a share-conversion preview does not
establish that a deposit or withdrawal can execute.

The SDK documentation above identifies its reviewed reader and private transaction
implementations, including their release limits. Each state observation is tied
to a contract version and block.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
