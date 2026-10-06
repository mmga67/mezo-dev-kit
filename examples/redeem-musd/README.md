# Redeem MUSD for BTC collateral

Redemption exchanges MUSD against the ordered trove queue; it is different from
repaying your own borrowing position. Start with [redeemCollateral](redeem.ts).
Supply a [write connection](../SETUP.md), operation ID, quote inputs, output
bounds and an explicit `RedemptionSimulator`.

[redeemMusd](workflow.ts) shows the provided trace adapter. The application supplies
requested MUSD base units, a maximum redemption rate scaled by 1e18, slippage in
basis points and a request port supporting `debug_traceCall` with the required
tracer/log behavior. A normal endpoint may lack it. Missing trace evidence stops
the recipe; an empty successful `eth_call` does not prove BTC output.

The quote bounds queue discovery and may truncate the attempted amount.
Simulation checks actual MUSD redeemed and net BTC received for the exact call.
The function derives explicit minimums, prepares again and requests consent
before submitting. TroveManager burns MUSD directly; this action has no token
approval.

The contract lacks minimum-received arguments, so application preflight bounds
are not inclusion guarantees. Inspect `outcome.amounts`, gas and
`boundsSatisfied` after reconciliation. Requested, helper-truncated, attempted
and actual amounts can differ. A partial fill is not permission to automatically
redeem the remainder.

See the [Redemption reference](../../packages/protocols/musd-redemptions/REFERENCE.md)
for exact fields, provider requirements and private release scope.
