# Swap routes and quotes

Understand how pool discovery and bounded quotes become ranked swap candidates, router calls, simulation requirements, and reconciled outcomes.

## Start here

- [Routing reference](generated/reference.md): deployed providers, route dispositions, and the execution lifecycle.
- [Swaps SDK](../../../packages/swaps/README.md): current quote readers and private exact-input workflows.
- [Pools knowledge](../../protocols/pools/README.md): discovery and pool math.
- [Price selection guide](../../../docs/guides/price-selection-and-dex-quotes.md): distinguish trade quotes from protocol prices.

## Scope and evidence

The reviewed routing model covers separately deployed basic and
concentrated-liquidity families. Their route encodings and reconciliation differ;
see the reference before composing them. Module operation support remains absent
while the SDK documents its implemented private scope.

There is no evidenced Universal Router or current official Quoter. Atomic mixed
basic/CL execution and fee-on-transfer variants remain outside the current scope.
A quote or historical replay is not a guaranteed received amount.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
