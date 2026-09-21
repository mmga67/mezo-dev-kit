# Read units and approve an exact amount

Start with [approve.ts](approve.ts). `approveTokenAmount` constructs the public
token reader and approval writer, prepares an exact spender/amount, simulates,
submits, confirms and checks the resulting allowance. A sufficient plan returns
without a wallet request. A reset is an independent transaction.

The protocol writer supplies the verified token snapshot and approval plan.
[Savings deposit](../save-musd/deposit.ts) demonstrates the caller: complete each
required approval, prepare the deposit again, then simulate its fresh call.
Keep the same execution client so approvals use the appropriate target resolver
and shared submission store. Amounts are token base units, not human decimals.

[token-units.ts](../runtime/token-units.ts) shows `createTokenReader().read()`
at a concrete block/hash before converting user text. It needs only network,
transport and account; it has no signer dependency.

[Package reference](../../packages/tokens/REFERENCE.md) · [Connection guide](../SETUP.md).
