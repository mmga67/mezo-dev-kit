# Chains SDK reference

Import from `@mezo-dev-kit/chains`. This private workspace package resolves
accepted network identity without contacting an RPC endpoint. See
[setup](../../docs/reference/sdk.md) and the [package contract](README.md).

## Functions and registry methods

| API                     | Input → result                   | Behavior                                                                                        |
| ----------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `getNetwork(networkId)` | `unknown → Readonly<Network>`    | Resolve a known network in an accepted, supported, verified state. Throws otherwise.            |
| `listNetworks()`        | none → readonly `Network[]`      | List supported records.                                                                         |
| `isNetworkId(value)`    | `unknown → value is NetworkId`   | Test membership in generated identities; use resolution to check support.                       |
| `createChainRegistry()` | none → `Readonly<ChainRegistry>` | Create an immutable registry exposing `getNetwork` and `listNetworks` with the same signatures. |

There is no public custom-data constructor. To implement a test or integration
port, satisfy `ChainRegistry` explicitly.

## Network result

| Fields                                        | Meaning                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `id`, `displayName`, `environment`, `profile` | Stable network identity, display name, mainnet/testnet, and EVM/Cosmos-EVM profile.               |
| `evmChainId`, `cosmosChainId`                 | Exact bigint EVM ID and nullable Cosmos identity.                                                 |
| `nativeCurrency`                              | Name, symbol, decimals, and nullable Cosmos EVM denomination.                                     |
| `explorer`                                    | Explorer name and URL.                                                                            |
| `capabilities`                                | Declared protocol capabilities, including EVM, Cosmos, consensus engine, and native gas currency. |
| `status`, `supportStatus`, `reviewStatus`     | Canonical lifecycle and acceptance.                                                               |
| `verifiedAt`, `reviewAfter`, `limitations`    | Evidence dates and boundaries.                                                                    |

`reviewAfter` requests evidence re-verification; it does not automatically
remove a network. No field supplies a default RPC, credential, availability
guarantee, archive support, or protocol writer.

## Example

```ts
import {
  ChainRegistryError,
  createChainRegistry,
  getNetwork,
  isNetworkId,
  listNetworks,
} from "@mezo-dev-kit/chains";

const network = getNetwork("mezo-mainnet");
const registry = createChainRegistry();
const allNetworks = listNetworks();
const sameNetwork = registry.getNetwork(network.id);

export function resolveNetwork(input: unknown) {
  if (!isNetworkId(input)) return { status: "unknown" as const };
  try {
    return { status: "available" as const, network: getNetwork(input) };
  } catch (error) {
    if (error instanceof ChainRegistryError) {
      return { status: "unavailable" as const, code: error.code };
    }
    throw error;
  }
}

export { network, allNetworks, sameNetwork };
```

Pass the resolved `Network` to Core and supply your transport separately; see
the [Core reference](../core/REFERENCE.md).

## Errors and public types

`ChainRegistryError(code, message, context, options?)` extends `Error` with
`code` and structured `context`; `options` can preserve a `cause`.
Codes are `InvalidNetworkId`, `UnsupportedNetworkState`, and
`MalformedGeneratedNetwork`.

Public types: `ChainRegistry`, `Network`, `NetworkEnvironment`, `NetworkId`,
`NetworkProfile`, `ChainRegistryErrorCode`, `ChainRegistryErrorContext`.
See the [export list](src/index.ts), [type definitions](src/registry.ts), and
built declarations (`dist/index.d.ts`). Import types through the package root.
