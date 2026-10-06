# Manage a concentrated-liquidity position

Start with [mintPosition](mint.ts). Supply a [write connection](../SETUP.md),
operation ID, verified pool key, tick range, token amounts and explicit bounds.
A position is an NFT identifying liquidity within a price range. Its `tokenId`
comes from the reconciled result; never guess it from total NFT supply.

[manageCLPosition](workflow.ts) composes mint, increase, decrease, collect and
burn. The application supplies desired token0/token1 amounts in their own base
units. Its range and slippage policies are illustrative: review them for your
application and respect tick-spacing and supported tick bounds.

Decreasing liquidity credits principal owed to the position. Collection pays
owed tokens; burning the empty NFT closes it. Those are distinct steps. Optional
rebalancing exits the old NFT and mints another range in a separate transaction;
a later failure can leave tokens in the wallet.

[clGaugeCycle](gauge.ts) shows approval of one NFT, staking, reward claim and
unstaking. Gauge custody changes the on-chain owner while the depositor retains
the beneficial stake. Gauge rewards and LP fees are different quantities. Each
action asks for consent; claiming may return zero when no reward has accrued.

See the [Pools reference](../../packages/protocols/pools/REFERENCE.md) and
[Incentives reference](../../packages/protocols/incentives/REFERENCE.md) for
current methods, custody checks and release limits.
