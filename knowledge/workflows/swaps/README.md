# Mezo swaps and routing knowledge

This v0.4 module owns the provider-neutral workflow that turns pool discovery
and bounded quote observations into ranked swap candidates, exact router calls,
simulation requirements, and post-transaction reconciliation.

Current Mezo Mainnet has two separately deployed execution families:

- the basic `mezo-earn.router`, whose route is an array of
  `(from, to, stable, factory)` tuples; and
- the concentrated-liquidity `mezo-earn.cl-swap-router`, whose exact-input path
  is packed as `token || int24 tickSpacing || token`.

There is no evidenced Universal Router or current official Quoter deployment.
Atomic mixed basic/CL paths, command bytes, unsafe basic swaps, fee-on-transfer
variants, public readers, and every writer therefore remain unsupported. A
quote or historical replay is never a guaranteed minimum received.

Resolve resources through `index.json`. Read `review/gaps.md` before relying on
an unreviewed route or operation, and do not edit `generated/reference.md`
manually.
