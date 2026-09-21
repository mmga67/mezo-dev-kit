# Chains SDK reference

Use `@mezo-dev-kit/chains` to look up a network's chain ID, native currency and recorded
capabilities. Lookups use the package's generated catalog and make no RPC requests. Start with
`getNetwork` when you know the network ID; use `listNetworks` to present the available choices.

A **network ID**, such as `mezo-mainnet`, is MDK's stable name. Its `evmChainId` is the bigint
identifier used by EVM clients. The catalog also carries evidence dates and limitations; selecting a
network does not configure an RPC provider. See [workspace setup](../../docs/reference/sdk.md) and
[package scope](README.md).

On this page:

- [Functions and registry methods](#functions-and-registry-methods)
- [Network result](#network-result)
- [Example](#example)
- [Errors and public types](#errors-and-public-types)
- [Canonical generation](#canonical-generation)

## Functions and registry methods

### `getNetwork`

Resolve a known network in an accepted, supported, verified state. Throws otherwise.

**Call:** `getNetwork(networkId)`

**Input → result:** `unknown → Readonly<Network>`

### `listNetworks`

List supported records.

**Call:** `listNetworks()`

**Input → result:** none → readonly `Network[]`

### `isNetworkId`

Test membership in generated identities; use resolution to check support.

**Call:** `isNetworkId(value)`

**Input → result:** `unknown → value is NetworkId`

### `createChainRegistry`

Create an immutable registry exposing `getNetwork` and `listNetworks` with the same signatures.

**Call:** `createChainRegistry()`

**Input → result:** none → `Readonly<ChainRegistry>`

There is no public custom-data constructor. To implement a test or integration port, satisfy
`ChainRegistry` explicitly.

## Network result

Read identity and currency fields when configuring a client. Read the evidence fields when deciding
whether the recorded capabilities meet your application’s requirements. These describe the catalog,
rather than the current health of an endpoint.

| Fields                                        | Meaning                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `id`, `displayName`, `environment`, `profile` | Stable network identity, display name, mainnet/testnet, and EVM/Cosmos-EVM profile.               |
| `evmChainId`, `cosmosChainId`                 | Exact bigint EVM ID and nullable Cosmos identity.                                                 |
| `nativeCurrency`                              | Name, symbol, decimals, and nullable Cosmos EVM denomination.                                     |
| `explorer`                                    | Explorer name and URL.                                                                            |
| `capabilities`                                | Declared protocol capabilities, including EVM, Cosmos, consensus engine, and native gas currency. |
| `status`, `supportStatus`, `reviewStatus`     | Canonical lifecycle and acceptance.                                                               |
| `verifiedAt`, `reviewAfter`, `limitations`    | Evidence dates and boundaries.                                                                    |

`reviewAfter` requests evidence re-verification; it does not automatically remove a network. No
field supplies a default RPC, credential, availability guarantee, archive support, or protocol
writer.

## Example

Resolve mainnet directly, then handle a network ID supplied by an external caller. This example uses
only the local catalog:

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
  if (!isNetworkId(input)) {
    return { status: "unknown" as const };
  }

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

The helper distinguishes an unknown ID from a known ID whose catalog state prevents use. `network`,
`allNetworks`, and `sameNetwork` are catalog objects; none is an RPC connection.

Pass the resolved `Network` to Core and supply your transport separately; see the
[Core reference](../core/REFERENCE.md).

## Errors and public types

`ChainRegistryError(code, message, context, options?)` extends `Error` with `code` and structured
`context`; `options` can preserve a `cause`.

| Code                        | Meaning and next step                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `InvalidNetworkId`          | The input is not a known network ID. Validate the selection with `isNetworkId`.                      |
| `UnsupportedNetworkState`   | The catalog record is not in an accepted usable state. Inspect its support and review evidence.      |
| `MalformedGeneratedNetwork` | Generated network data failed validation. Repair and regenerate the canonical input before using it. |

Public types: `ChainRegistry`, `Network`, `NetworkEnvironment`, `NetworkId`, `NetworkProfile`,
`ChainRegistryErrorCode`, `ChainRegistryErrorContext`. See the [export list](src/index.ts),
[type definitions](src/registry.ts), and built declarations (`dist/index.d.ts`). Import types
through the package root.

## Canonical generation

`scripts/generate/generate-chains-package.ts` resolves every indexed canonical network resource
through stable `networks:<resource-id>` references. It validates the profile/lifecycle shape,
records a SHA-256 digest over the module index and exact resource bytes, and deterministically emits
`src/data.generated.ts`. Runtime code imports only that generated TypeScript; it never reads
repository knowledge files.

```sh
pnpm --filter @mezo-dev-kit/chains generate:check
```

Do not edit the generated file. Change and validate the canonical Networks owner first, regenerate,
and review both sides of the diff.
