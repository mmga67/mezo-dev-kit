# USDC Lending Vault

The USDC Lending Vault accepts mUSDC and allocates supplied assets to the Morpho
lending market. Vault shares record a depositor's interest in the vault. A
separate wrapper and Mezo Earn gauge add another layer of receipts and rewards.

Follow those layers to understand what you own, where yield goes, and how much
liquidity is available to withdraw. A vault share, a wrapper receipt, and a
reward balance represent different claims.

## Follow a deposit through the layers

Begin with the vault itself. It accepts mUSDC, the Native Bridge representation
of Ethereum USDC, and issues vault shares. An adapter connects the vault's
allocation to the [lending market](../../lending/musdc/README.md). The assets
allocated there already belong in the vault's total assets; adding them again
would count the same funds twice.

The wrapper adds another receipt. It holds vault shares and issues wrapper
receipts, with its own rules for separating user-held value from accumulated
yield. Those receipts can be staked in a gauge, a rewards contract. Staking
changes receipt custody, so count a receipt either in the wallet or as the
user's gauge stake, not in both places.

These layers also separate the returns. Redirected yield is accounted for in
vault shares, while MEZO rewards follow the [Incentives](../../incentives/README.md)
rules. Unstaking a wrapper receipt changes custody; it does not turn the receipt
into an unwrapped vault share. The [vault reference](generated/reference.md)
explains the conversions and how the balances should reconcile.

## Check the claim and available liquidity

For an exit, identify which claim is held and the conversion it requires. A
preview estimates an amount under the selected state and rounding rules; funds
also need to be available for the operation. A listed contract or a calculated
share value alone cannot establish that a deposit or withdrawal will execute.

The [Vault SDK](../../../../packages/protocols/usdc-lending-vault/README.md)
provides reads, previews and direct vault/wrapper workflows. It resolves the
vault and gauge through the recorded contract relationships, alongside the
registered adapter and wrapper. Use the same contract version and block when
comparing the layers.

The SDK documentation above identifies its reviewed reader and private transaction
implementations, including their release limits. Each state observation is tied
to a contract version and block.

## Quick links

| Link                                                                     | What you will find                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [Vault reference](generated/reference.md)                                | Contract layers, share conversions, liquidity and balance reconciliation. |
| [Vault SDK](../../../../packages/protocols/usdc-lending-vault/README.md) | Reads, previews, vault operations and wrapper workflows.                  |
| [Lending market](../../lending/musdc/README.md)                          | The underlying allocation, borrower debt and liquidation rules.           |
| [Incentives](../../incentives/README.md)                                 | Gauge staking, voting, emissions and rewards.                             |
| [Module index](index.json)                                               | Exact vault, adapter, wrapper, accounting and evidence records.           |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
