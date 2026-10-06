# Convert form values without rounding money

Read [prepareAmount](amounts.ts). It accepts address text, decimal amount text
and the selected asset's verified decimal precision. It validates the address
and returns integer base units, formatted display text and an RPC quantity.
It performs no network request and needs no wallet.

For an asset with six decimal places, `"1.25"` becomes `1250000n` base units.
Use strings for form amounts: JavaScript floating-point arithmetic can lose
precision. Excess fractional precision rejects instead of silently rounding.
RPC quantities are hexadecimal integers; calldata and hashes are different
kinds of hexadecimal data with different validation rules.

Read [application connections](../SETUP.md) next, or use the
[EVM reference](../../packages/evm/REFERENCE.md) for exact validation contracts.
