# Chains

`@mezo-dev-kit/chains` provides typed network identities and capability profiles. Use it to select a chain consistently across Contracts, Core, and protocol packages.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the network lookup example](../../examples/chains/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

```ts
import { getNetwork } from "@mezo-dev-kit/chains";

const network = getNetwork("mezo-mainnet");
console.log(network.evmChainId, network.nativeCurrency);
```

## What it provides

- Lookup and listing for Mezo Mainnet, Mezo Testnet, Ethereum Mainnet, and Base Mainnet.
- Exact bigint EVM chain IDs, optional Cosmos identity, currency metadata, and declared capabilities.
- Evidence dates and limitations carried from [network knowledge](../../knowledge/networks/README.md).

## Scope

This private package performs no network requests and selects no RPC endpoint.
A known chain does not guarantee provider availability, archive access, or a
protocol deployment. Applications supply their own transport.

Registry methods reject unknown IDs and unsupported record states. A review
date triggers re-verification when needed; it does not silently change a
record's support status. See [network results](REFERENCE.md#network-result).

Runtime data is generated from canonical knowledge. See [canonical generation](REFERENCE.md#canonical-generation)
before changing it.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/chains check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
