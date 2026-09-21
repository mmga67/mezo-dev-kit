# USDC Lending Vault

Understand the mUSDC supplier vault, its Morpho allocation, receipt wrapper, and Mezo Earn gauge. These records explain how deposits, share conversions, yield, and available liquidity relate.

## Start here

- [Vault reference](generated/reference.md): layers, conversions, liquidity, and reconciliation.
- [Vault SDK](../../../../packages/protocols/usdc-lending-vault/README.md): reads, previews, and direct vault/wrapper workflows.
- [Lending market](../../lending/musdc/README.md): underlying market debt and liquidation.
- [Incentives](../../incentives/README.md): voting, emissions, and rewards.

## Scope and evidence

The bounded model is reviewed; protocol support remains proposed and operation
support remains absent. Package docs describe the separately reviewed reader
and private writer implementations.

VaultV2 shares, wrapper receipts, Morpho shares, available mUSDC, redirected
vault-share yield, and MEZO rewards are distinct. The adapter and wrapper are
Contract roots; VaultV2 and VaultGauge resolve as checked runtime roles.
Neither catalog membership nor a share preview establishes operation capacity.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
