# USDC Lending Vault knowledge

This module owns the current mUSDC supplier vault, its Morpho allocation,
receipt wrapper, and Mezo Earn gauge boundary. Borrower debt and liquidation
remain owned by `protocols/lending/musdc`; gauge voting and emissions remain
owned by `protocols/incentives`.

The records distinguish VaultV2 shares, wrapper receipts, Morpho supply shares,
available mUSDC liquidity, redirected vault-share yield, MEZO emissions, and
claimable rewards. Qualified Level 3 review accepted this bounded model on
2026-08-25 while protocol support remains `proposed` and operation support
remains `none`; no public reader or writer is implied. The adapter and receipt
wrapper are accepted Contract roots. VaultV2 and VaultGauge are accepted as
runtime-verified, role-resolved protocol candidates rather than forced Contract
identities because their official explorer records omit creation input.
