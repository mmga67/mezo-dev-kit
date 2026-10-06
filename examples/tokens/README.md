# Approve an exact token amount

[approveTokenAmount](approve.ts) takes a token snapshot, approval plan, operation
ID, RPC transport, execution client and application consent callback. The
snapshot names the account, token, spender and observed allowance. A sufficient
allowance sends nothing; a reset is its own transaction.

Approval grants spending permission. Show the exact spender and amount before
consent, then simulate, submit, confirm and reconcile the resulting allowance.
After approval, the calling protocol recipe must prepare again against the new
state. Never replace a missing allowance with zero or default to unlimited
approval. [readWalletToken](../runtime/token-units.ts) illustrates reading balances
and precision instead of copying token decimals into a financial calculation.

See [connection inputs](../SETUP.md) and the
[Tokens reference](../../packages/tokens/REFERENCE.md) for current contracts.
