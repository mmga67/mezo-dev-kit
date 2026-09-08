# MDK Core

See the [SDK reference](REFERENCE.md) for client methods, transport ports, results, errors, and examples.

`@mezo-dev-kit/core` is the private, provider-neutral read and execution coordination layer
for the GitHub source alpha. Its built entrypoint exposes an injected read
transport, exact chain assertion, accepted Contracts resolution, one-block
multi-read consistency, and typed failure semantics. It is not published to a
package registry and `0.0.0-private` is not a compatibility promise.

## Supported read boundary

```ts
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCoreReadClient } from "@mezo-dev-kit/core";

const client = createCoreReadClient({
  network: getNetwork("mezo-mainnet"),
  registry: createContractRegistry(),
  transport: myInjectedTransport,
});

const result = await client.readCoherent({
  calls: [
    { id: "required", contractId: "musd.savings-rate", data: "0x1234" },
    {
      id: "optional",
      contractId: "musd.token",
      data: "0xabcd",
      required: false,
    },
  ],
});
```

The client asserts the transport's chain ID, obtains or accepts one exact
`bigint` block number, verifies the returned 32-byte block hash, resolves every
contract at that coordinate, and sends the same network/block/hash coordinate
with each transport request. A required transport failure rejects the logical
read with `PartialReadFailure`. An optional failure returns a discriminated
`unavailable` item containing a serialized `ProviderFailure`; it never becomes
zero, `false`, or empty protocol state.

`CoreReadError` carries a stable code, stage, retry hint, structured context,
and preserved cause. Inputs are validated at runtime even though the public
boundary is typed. The transport result remains `unknown`: an owning protocol
module must validate and decode its own values and units.

The public codes are `InvalidReadInput`, `InvalidTransportResult`,
`ChainMismatch`, `ProviderFailure`, and `PartialReadFailure`. Contract
resolution may also throw the typed `ContractRegistryError` owned by the
Contracts package; Core does not erase that domain failure.

The read API remains unchanged. The package also exports createExecutionClient,
createRpcTransport, createRpcSigner, createMemorySubmissionStore,
parseSubmissionRecord and ExecutionError; see the SDK reference for the complete
execution contract.

## Injection and network requirements

Core depends on the public EVM, Chains, and Contracts entrypoints. EVM owns
shared byte/hash validation; Core retains its read stages and error codes. It does not
choose an RPC URL, import a provider library, access a wallet, or keep a hidden
global client. A consumer supplies `CoreReadTransport`, whose four methods are
`getChainId`, `getBlockNumber`, `getBlock`, and `read`.

The source-alpha development baseline is Node 24 and pnpm 11. From a checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/core test
pnpm --filter @mezo-dev-kit/core test:shuffle
```

The repository's built-boundary gate imports all four foundational packages
through their export maps, typechecks and runs the focused example, rejects a
Core deep import, checks a missing-artifact failure, and verifies that writer
proof files do not leak into `packages/core/dist`.

## Compatibility with the transaction proof

The original transaction proof remains private with its model tests. The new
additive execution API uses current Chains, Contracts and EVM types and does
not expose the proof's old interfaces. ADR-0015 owns the direct borrowing
implementation scope; qualified release review remains outstanding.

The proof's generated state/error tables still drift-check against stable transaction
knowledge with:

```sh
node scripts/generate-core-transaction-model.ts --check
```

## Limitations

- Core encodes no calldata and validates no protocol return shape; protocol
  packages own those semantics.
- Block/hash pinning expresses the requested consistency contract. The injected
  adapter is responsible for honoring it and applications must select a
  provider with the required historical-read capability.
- The application supplies signer requests, storage, timeouts, polling policy
  and consent. Core selects no RPC URL and stores no credentials.
- Execution supports explicitly selected EOAs without delegated code.
  Approval workflows and smart-account integrations are not implemented.
- Borrowing is a private implementation pending qualified protocol review.
- A transport success is only an available raw read value, not proof of
  protocol correctness or current live-chain support.

## Inspect this checkout

Use the [manifest](./package.json) and [exported entrypoint](./src/index.ts)
alongside this package's scope and injected-input contract. Build before
interpreting a missing artifact as an absent API. The [usage example](../../examples/foundational-readonly/README.md)
exercises the workspace boundary. Reassess these owners after checkout changes;
private versions alone do not identify capability changes. Follow the
[capability guidance maintenance rule](../../CONTRIBUTING.md#keep-capability-guidance-current)
when the public boundary, required inputs, or evidence dependencies change.

Core also exposes `createEventScanner` for bounded registered-contract raw log
queries. Explicit coverage, source/provider identity, checkpoint candidates and
reorg anchors are described in the [SDK reference](REFERENCE.md#bounded-event-scanning).
The caller owns capability evidence, whole-invocation cancellation and atomic
persistence of rows, coverage and checkpoints. Complete query coverage does not
prove protocol success or destination delivery.
