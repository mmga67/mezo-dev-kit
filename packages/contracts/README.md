# Contracts

`@mezo-dev-kit/contracts` resolves contract identities, deployment generations, and ABI interfaces at an explicit network and block. Use it to select the deployment and interface a reader or protocol workflow needs.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the deployment lookup example](../../examples/contracts/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Choose a lookup

| Need                                            | API                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A deployment and read-only ABI                  | `resolveContract`                                                                                 |
| A curated state-changing operation              | `resolveOperation`                                                                                |
| Expected runtime or a discovered-role interface | Runtime and interface helpers in the [API reference](REFERENCE.md#functions-and-registry-methods) |
| Decoding at a recorded historical coordinate    | `resolveHistoricalContractEvidence`                                                               |

The package reads generated data and makes no RPC calls. Core and protocol
packages use the returned identities and interfaces with an explicit transport.

## Scope

This is a private workspace package. A resolved ABI establishes its documented
registry scope; it does not grant permission to send a transaction. Current
operation resolution and [historical evidence](REFERENCE.md#historical-evidence)
are separate result types. Historical evidence cannot serve as a current writer target.

Missing, ambiguous, unsupported, or incompatible generations fail explicitly.
Dynamic pools, gauges, and vault roles must be discovered and verified through
their protocol roots. An open validity range is not an immutability guarantee.

[Contract knowledge](../../knowledge/contracts/README.md) owns deployments,
full ABIs, and provenance. See [canonical generation](REFERENCE.md#canonical-generation)
for updating the runtime projections.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/contracts check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
