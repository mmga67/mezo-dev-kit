# Add and remove basic-pool liquidity

Start with [addLiquidity](add.ts). Supply a [write connection](../SETUP.md),
persisted operation ID, verified `BasicPoolKey`, token0/token1 amounts and explicit
liquidity bounds. Pool sorting determines which asset is token0; convert each
amount using that token's verified precision. The reader verifies the pool
through its factory instead of trusting a supplied pool address.

Each required token approval names the exact spender and amount and asks for
consent. Prepare again after approvals, simulate the exact liquidity action,
request consent, then reconcile actual token amounts and LP shares.

[provideBasicLiquidity](workflow.ts) adds liquidity, removes half and then the
remaining LP shares, and collects any accrued wallet fees. The caller supplies
amounts, slippage basis points and a deadline window. This composition requires
an initially empty LP position. It does not perform a swap just to generate fees;
a zero fee payment is valid.

LP principal, remaining wallet LP shares and claimable fees are different
quantities. Fees can remain claimable after principal exit. Forecast-derived
minimums and deadlines describe specific guarantees, not a promise that a
future quote remains available. See the [Pools reference](../../packages/protocols/pools/REFERENCE.md)
for current methods, units and private release scope.
