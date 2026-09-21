# Exact EVM values

Start with [amounts.ts](amounts.ts). `prepareAmount(addressText, amountText,
decimals)` validates a user address and moves a decimal string through integer
base units, RPC hex and display text. For `"12.345"` at 6 decimals, the amount is
`12345000n`; `"0.0000001"` at that precision rejects instead of rounding.

Call it with precision read from the relevant token. The synthetic inputs in
[foundations.ts](../foundations.ts) make the conversion easy to inspect without
network setup. Run `pnpm --filter @mezo-dev-kit/examples foundations` after
[building](../README.md#build-and-run).

For ABI usage, [read-balances.ts](../core/read-balances.ts) shows `createAbiCodec`
encoding `balanceOf` arguments and decoding results with the Contracts-owned ABI.

The package supplies value validation/conversion and ABI codecs; it needs no
signer, RPC or workflow context. [Package reference](../../packages/evm/REFERENCE.md).
