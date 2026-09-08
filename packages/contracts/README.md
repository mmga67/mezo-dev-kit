# MDK Contracts

See the [SDK reference](REFERENCE.md) for functions, registry methods, result fields, and examples.

`@mezo-dev-kit/contracts` is the private source-alpha resolver for
accepted contract IDs, deployment generations, and read-safe ABI projections.
It is generated from the canonical Contracts module and is not an npm release
or compatibility promise.

## Supported boundary

Resolve by stable contract ID, accepted Chains network ID, and exact block:

```ts
import { resolveContract } from "@mezo-dev-kit/contracts";

const savings = resolveContract({
  contractId: "musd.savings-rate",
  networkId: "mezo-mainnet",
  blockNumber: 12_000_000n,
});
```

Resolution fails closed on absence, overlapping validity, malformed generated
data, non-current/non-supported/non-accepted deployment state, missing or
unsupported ABI state, and historical proxy generations for which the current
ABI does not apply. Returned values preserve address, deployment and current
code coordinates, implementation identity, provenance class, ABI digests,
catalog verification and review-trigger timestamps, and limitations.
`reviewAfter` remains the canonical trigger to reverify evidence, not an
automatic lifecycle mutation.

The existing readAbi projection remains read-only: it retains only `view`/`pure`
functions plus events and errors from each accepted full canonical ABI.
Constructors, fallback/receive entries, and payable/nonpayable functions are
excluded. The package exposes no encoding client, provider, signer, approval,
transaction construction, submission, or writer.

Additive `resolveOperation` exposes curated mainnet BorrowerOperations, Savings, Morpho and wrapper
functions; `resolveRuntimeIdentity` provides generated code hashes and proxy
slots for the borrowing dependency set. ABI availability does not authorize a
transaction or promote proposed protocol support.

The public values include `createContractRegistry`, `resolveContract`,
`listContractIds`, `isContractId`, `resolveOperation`, `resolveRuntimeIdentity`,
and `ContractRegistryError`, plus their
documented types.

The public error codes are `InvalidContractInput`, `UnknownContractId`,
`MissingDeployment`, `UnsupportedDeploymentState`, `OverlappingDeployments`,
`HistoricalGenerationUnsupported`, `AbiUnavailable`, and
`MalformedGeneratedContract`. Every failure includes structured context and no
failure is converted into a fallback address or ABI.

## Dependency and injection boundary

Contracts uses the public Chains entrypoint for network identity and the public
EVM entrypoint for address validation. Registry addresses remain canonical
lowercase values. It selects no RPC and performs no network call. `createContractRegistry`
returns an immutable registry implementing the exported `ContractRegistry`
interface; Core and protocol modules accept that interface as an injected port
and can supply deterministic fakes in tests.

## Canonical generation

`scripts/generate-contracts-package.ts` resolves
`contracts:contract-deployments`, `contracts:contract-abis`, and every indexed
`contracts:abi.*` artifact. It validates lifecycle fields, IDs, addresses,
validity/generation ranges, ABI references/counts/file digests, and read-entry
mutability. It records a SHA-256 digest over the Contracts module index and all
exact consumed bytes, then emits `src/data.generated.ts` deterministically.
Runtime code never reads `knowledge/`.

```sh
pnpm --filter @mezo-dev-kit/contracts generate:check
```

Do not edit generated data. Update and validate the canonical Contracts owner,
regenerate, and review input and output together.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/contracts check
pnpm --filter @mezo-dev-kit/contracts test:shuffle
```

The source-alpha development baseline is Node 24 or newer and pnpm 11 as pinned
by the root manifest. Contracts performs no live call; callers choose a
transport later and must provide a block coordinate covered by the selected
provider when they execute a read.

The Level 3 repository gate also runs Networks/Contracts structural,
semantic/provenance, and reference-drift checks, workspace boundaries, built
entrypoint/declaration smoke tests, root `pnpm check`, and shuffled tests.

## Limitations

- Registry acceptance does not create protocol, route, market, vault, or
  operation support.
- An open validity range means no supersession was observed at the evidence
  coordinate; it is not an immutability guarantee.
- Historical deployment/generation metadata is retained so it cannot be
  mistaken for current support, but this alpha does not expose a historical
  ABI unless the exact generation is canonically available and separately
  supported.
- Dynamic instances continue to resolve through their reviewed roots; this
  package does not fabricate pool, gauge, VaultV2, or VaultGauge identities.
- Curated operation/event and discovered-role interfaces are available; domain writers own financial checks and Core owns execution.

## Inspect this checkout

Use the [manifest](./package.json) and [exported entrypoint](./src/index.ts)
alongside this package's scope and injected-input contract. Build before
interpreting a missing artifact as an absent API. The [usage example](../../examples/foundational-readonly/README.md)
exercises the workspace boundary. Reassess these owners after checkout changes;
private versions alone do not identify capability changes. Follow the
[capability guidance maintenance rule](../../CONTRIBUTING.md#keep-capability-guidance-current)
when the public boundary, required inputs, or evidence dependencies change.
