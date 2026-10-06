# Swap tokens with explicit bounds

Start with [swapExactInput](swap.ts). Supply a [write connection](../SETUP.md),
operation ID, an explicit basic route, input amount and output/deadline bounds.
The input uses the input token's base units; the minimum output uses the output
token's units. The router is the spender for a separate exact approval.

[swapTokens](workflow.ts) compares a bounded pair of basic pool candidates. The
caller supplies input amount, quote age, slippage basis points and deadline
window. Missing optional candidates stay unavailable; no eligible best route
stops execution. A quote is an estimate, not exact-call simulation or a guarantee.

[swapConcentratedLiquidity](concentrated-liquidity.ts) uses a bounded CL route,
explicit intermediate assets and a required output minimum. Basic and CL route
encodings differ. The private CL reader traverses verified pool state within
budgets; it does not assume an official Quoter address.

## Continue across two transactions

[mixed.ts](mixed.ts) separates `startMixedSwap` and `continueMixedSwap`.
The first returns and persists `intermediate-held` with the actual reconciled
output. Only then does the application decide whether to continue through CL
with a fresh quote and explicit minimum. These two swaps are not atomic.

Keep the original intent ID and validate saved checkpoint data before use.
If continuation fails before submission, observe current intermediate custody
before making another decision. If submission is uncertain, inspect its journal
and wallet transaction first. Never repeat the first swap to retry the second,
and never assume a timeout means the second transaction did not execute.

See the [Swaps reference](../../packages/swaps/REFERENCE.md) for route limits,
private asset compatibility, unavailable results and release scope.
