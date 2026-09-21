# Prices

`@mezo-dev-kit/prices` normalizes decimal prices, checks confidence and freshness, and reads the mainnet Skip BTC/USD feed without a signer.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the price observation example](../../examples/prices/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Choose an input

Use pure helpers with bigint values, explicit precision/rounding, and
caller-supplied Unix times. Supply Core's RPC transport for the direct Skip
reader. The [API reference](REFERENCE.md) describes the required source identity
and freshness inputs.

The direct feed is different from a protocol's configured oracle. Borrowing
and Lending retain their deployed oracle paths; a Skip observation must not
silently replace their protocol price.

## Scope

There is no default maximum age, clock, automatic fallback, updater, or
subscription. Missing confidence stays `null`; an unavailable price never
becomes zero. See [price knowledge](../../knowledge/prices/README.md) for source
classes and evidence, and the [selection guide](../../docs/guides/price-selection-and-dex-quotes.md)
for choosing an appropriate observation.

This private package uses Node crypto through Core. The reader checks native
interface bytes and block/chain consistency, while Mezo native dispatch and
browser distribution require separate verification.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/prices check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
