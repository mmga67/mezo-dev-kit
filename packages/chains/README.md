# MDK Chains

See the [SDK reference](REFERENCE.md) for functions, registry methods, result fields, and examples.

`@mezo-dev-kit/chains` is the private, read-only source-alpha owner for typed
network identity and capability data consumed by MDK workspace modules. It is
not published to a package registry and its `0.0.0-private` version is not a
compatibility promise.

## Supported boundary

The generated registry currently carries the four accepted canonical
identities from `knowledge/networks`: Mezo Mainnet, Mezo Testnet, Ethereum
Mainnet, and Base Mainnet. `getNetwork` returns a record only when its evidence,
support, and review states are `verified`, `supported`, and `accepted`.
Proposed, stale/conflicting, historical/deprecated, or pending/rejected records
cannot silently enter the supported list.

EVM chain ID, optional Cosmos chain ID, native currency metadata, explorer, and
declared capability profile remain distinct. Chain IDs are exposed as exact
`bigint` values. The package deliberately contains no RPC URL, default provider,
credential, health promise, wallet configuration, protocol support, or writer.
Applications and adapters inject their transport explicitly.

```ts
import { getNetwork } from "@mezo-dev-kit/chains";

const network = getNetwork("mezo-mainnet");
// network.evmChainId === 31612n
```

The only public values are `createChainRegistry`, `getNetwork`, `isNetworkId`,
and `listNetworks`, plus their documented types and `ChainRegistryError`.
`InvalidNetworkId` reports malformed or unknown input,
`UnsupportedNetworkState` preserves a known record's rejected lifecycle, and
`MalformedGeneratedNetwork` identifies an invalid generated invariant. Records
include `verifiedAt`, `reviewAfter`, and limitations; per the canonical
knowledge policy, `reviewAfter` triggers re-verification rather than mutating
support automatically.

## Canonical generation

`scripts/generate-chains-package.ts` resolves every indexed canonical network
resource through stable `networks:<resource-id>` references. It validates the
profile/lifecycle shape, records a SHA-256 digest over the module index and
exact resource bytes, and deterministically emits `src/data.generated.ts`.
Runtime code imports only that generated TypeScript; it never reads repository
knowledge files.

```sh
pnpm --filter @mezo-dev-kit/chains generate:check
```

Do not edit the generated file. Change and validate the canonical Networks
owner first, regenerate, and review both sides of the diff.

## Development

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/chains check
pnpm --filter @mezo-dev-kit/chains test:shuffle
```

The source-alpha development baseline is Node 24 or newer and pnpm 11 as pinned
by the root manifest. The package itself performs no network access, so it has
no RPC-method or archive-node requirement.

The complete source-alpha verification also runs Networks structural,
semantic, negative-profile, and reference-drift checks, package boundaries,
the built-entrypoint smoke test, root `pnpm check`, and root shuffled tests.

## Limitations

- This is a private GitHub-source workspace package, not an npm installation
  surface.
- Identity support does not imply endpoint availability, archive support,
  protocol deployment support, or full optional JSON-RPC compatibility.
- Consumers must inspect freshness/limitations and reverify volatile evidence
  when their risk requires it.
- No signer, transaction, route, hosted provider, or write capability is
  exposed.

## Inspect this checkout

Use the [manifest](./package.json) and [exported entrypoint](./src/index.ts)
alongside this package's scope and injected-input contract. Build before
interpreting a missing artifact as an absent API. The [usage example](../../examples/foundational-readonly/README.md)
exercises the workspace boundary. Reassess these owners after checkout changes;
private versions alone do not identify capability changes. Follow the
[capability guidance maintenance rule](../../CONTRIBUTING.md#keep-capability-guidance-current)
when the public boundary, required inputs, or evidence dependencies change.
