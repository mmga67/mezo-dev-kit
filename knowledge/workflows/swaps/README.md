# Swap routes and quotes

A swap starts by finding pools and estimating what a route would return. The
selected route is encoded for a router contract, checked through simulation,
and compared with the actual result after execution. The estimate and the
settled amount are different stages of the process.

Basic and concentrated-liquidity pools use different route encodings and
settlement rules. This directory explains how to discover candidates, compare
quotes, and follow the selected route through to its outcome.

## Follow a swap from quote to settlement

Start with candidate routes. Each hop exchanges assets through a pool, so a
route must identify compatible pools in the right order. The
[pool model](../../protocols/pools/README.md) explains how pool identity and
liquidity are checked. A missing pool, one with no active liquidity and one
whose state could not be read are different outcomes.

Then estimate the output for the chosen input amount. The
[Swaps SDK](../../../packages/swaps/README.md) can compare routes supplied by
the application within explicit discovery and calculation limits. A quote
belongs to that route, amount and observed block. The
[price-selection guide](../../../docs/guides/price-selection-and-dex-quotes.md)
explains why it should not be treated as a protocol oracle price.

Execution adds checks the estimate cannot supply on its own: the selected
router, token approvals, permitted minimum output, deadline and simulation of
the exact call. After inclusion, compare events and actual token movements with
the intended result. The [routing reference](generated/reference.md) connects
these stages and preserves the rules for each router type.

## Route limits

The reference retains evidence about older Router/Quoter candidates: contracts
for executing swaps or requesting quotes. Neither is an SDK target or an
established current official integration. Combining basic and
concentrated-liquidity swaps into one transaction remains outside the current
scope, as do variants for tokens that deduct a fee when transferred.
A quote or historical replay is not a guaranteed received amount.

A workflow can instead perform a basic swap and a concentrated-liquidity swap
as two separate transactions. If the second cannot proceed, the first remains
settled. The [mixed-route recovery example](../../../packages/swaps/examples/mixed-recovery.ts)
shows how to retain the first result and prepare the second step with fresh
inputs and consent; the two transactions do not form one atomic swap.

The [recorded routing snapshot](artifacts/current-routing-2026-10-07.json)
distinguishes concentrated-liquidity pools with active liquidity, pools with no
active liquidity, and absent pools. Its router and replay checks apply to the
recorded scope. Pools created only in a local fork do not establish live routes.

The SDK documentation above describes its private quote and transaction
implementations. The package identifies the relevant
release-review requirements; recorded route evidence does not establish that a new swap is
ready to execute.

## Quick links

| Link                                                                            | What you will find                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Routing reference](generated/reference.md)                                     | Router identities, route rules and the execution lifecycle.                |
| [Swaps SDK](../../../packages/swaps/README.md)                                  | Quote readers, route comparison and private exact-input workflows.         |
| [Pools](../../protocols/pools/README.md)                                        | Pool discovery, positions and the math behind quotes.                      |
| [Price-selection guide](../../../docs/guides/price-selection-and-dex-quotes.md) | Distinguish trade estimates from protocol and market price observations.   |
| [Recorded routing snapshot](artifacts/current-routing-2026-10-07.json)          | The pools, liquidity and routes checked at the recorded block.             |
| [Mixed-route recovery](../../../packages/swaps/examples/mixed-recovery.ts)      | Continue two separate swaps without repeating a settled first transaction. |
| [Module index](index.json)                                                      | Exact provider, route, execution and evidence records.                     |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
