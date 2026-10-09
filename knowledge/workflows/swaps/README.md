# Swap routes and quotes

A swap starts by finding pools and estimating what a route would return. The
selected route is encoded for a router contract, checked through simulation,
and compared with the actual result after execution. The estimate and the
settled amount are different stages of the process.

Basic and concentrated-liquidity pools use different route encodings and
settlement rules. This directory explains how to discover candidates, compare
quotes, and follow the selected route through to its outcome.

## Follow a swap from quote to settlement

- [Routing reference](generated/reference.md): deployed providers, route dispositions, and the execution lifecycle.
- [Swaps SDK](../../../packages/swaps/README.md): current quote readers and private exact-input workflows.
- [Pools knowledge](../../protocols/pools/README.md): discovery and pool math.
- [Price selection guide](../../../docs/guides/price-selection-and-dex-quotes.md): distinguish trade quotes from protocol prices.

## Route limits

The reference retains evidence about older Router/Quoter candidates, but neither
is an SDK target or an established current official integration. Combining basic
and concentrated-liquidity swaps atomically, and fee-on-transfer variants, remain
outside the current scope.
A quote or historical replay is not a guaranteed received amount.

The [recorded routing snapshot](artifacts/current-routing-2026-10-07.json)
distinguishes concentrated-liquidity pools with active liquidity, pools with no
active liquidity, and absent pools. Its router and replay checks apply to the
recorded scope. Pools created only in a local fork do not establish live routes.

The SDK documentation above describes its private quote and transaction
implementations. Operation support remains unavailable pending the relevant
release review; recorded route evidence does not establish that a new swap is
ready to execute.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
