# MUSD Savings SDK

See the [SDK reference](REFERENCE.md) for reader, calculation and writer methods, approvals, results, errors, and examples.

`@mezo-dev-kit/musd-savings` is a private, experimental workspace
package for the GitHub source alpha. The maintainer accepted Savings reader review and its
bounded dynamic interface review on 2026-09-07. The templates retain proposed
deployment support. Direct deposit, withdraw and yield-claim writers are now implemented as private candidates pending qualified review. The package is not available
from a registry.

## Setup and API

Use Node 24 or newer and the root-pinned pnpm from a source checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/musd-savings check
pnpm --filter @mezo-dev-kit/musd-savings test:shuffle
pnpm --filter @mezo-dev-kit/example-musd-savings-readonly test
pnpm check:readers:mainnet
```

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createSavingsReader } from "@mezo-dev-kit/musd-savings";
import type { SavingsReadCodec, SavingsReadTransport } from "@mezo-dev-kit/musd-savings";

function reader(transport: SavingsReadTransport, codec: SavingsReadCodec) {
  return createSavingsReader({
    networkId: "mezo-mainnet",
    registry: createContractRegistry(),
    transport,
    codec,
  });
}
```

Call `reader(transport, codec).read({ account, blockNumber })` with an explicit
account and optional bigint block. Omitting the block selects one head once.
The reader resolves the current Savings deployment through Contracts and
rejects unsupported historical generations and other networks.

The runtime exports are `createSavingsReader`, `calculateSavingsYield`,
`calculateSavingsDistribution`, and `SavingsReadError`. Pure calculations
perform no I/O or transaction construction. Yield calculation separates
stored claimable, newly indexed unclaimed, and total claimable MUSD. Arithmetic
follows deployed checked uint256 order, including the zero-balance branch.
Invalid positive-balance index subtraction, overflow, and a distribution ratio
that rounds to zero fail explicitly.

## Transport and codec

The application supplies both ports. `SavingsReadTransport` implements Core's
chain/block methods plus address-based `read`, `getCode`, and `getStorage`.
Every request carries the same network, chain, block number, and hash. The
adapter must honor that coordinate for calls, code, and storage, without
falling back to latest. A final chain assertion and block-hash check detect a
changed coordinate before returning the snapshot.

`SavingsReadCodec.encodeRead` uses the supplied ABI, function name, and address
arguments to produce actual EVM calldata. `decodeRead` decodes the raw result
into one scalar. Integers must be bigint; addresses must be full hex
addresses. Numeric strings, numbers, tuples, missing values, and malformed
values fail runtime validation. Typed fake-port tests do not certify an
external RPC or ABI library; application adapters need their own integration
verification.

No wallet, signer, retry, deadline, cancellation, RPC URL, credential, or
provider policy is supplied. Adapter calls must settle under the application's
explicit I/O policy. Node's built-in SHA-256 checks exact runtime bytes;
browser packaging has not been verified.

## Results and failures

| Field                    | Meaning                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `coordinate`             | One chain/block/hash coordinate                                                               |
| `global.principalSupply` | Outstanding sMUSD principal receipts                                                          |
| `global.pendingYield`    | Protocol MUSD yield awaiting index allocation                                                 |
| `wallet`                 | Account-held receipts and separate stored/indexed/claimable MUSD yield                        |
| `strategy`               | Discovered strategy with checked runtime and token/vault reverse links                        |
| `converter`              | PCV-discovered converter with checked implementation and MUSD/Savings links                   |
| `gauge`                  | Beneficial stake, total stake, custody, reward-token identity, earnings, cached voter revenue |
| `beneficialPrincipal`    | Wallet receipts plus that account's gauge stake, counted once                                 |
| `evidence`               | Canonical input digest, verification/review trigger, and proposed review boundary             |

Optional groups use `{ status: "available", value }` or
`{ status: "unavailable", error }`. Missing wallet inputs make wallet and
combined principal unavailable. Missing gauge earnings preserve known gauge
principal while earnings remain unavailable. Unknown dynamic runtime code
prevents calls through its captured interface. Missing values never become zero.

Required root failures reject the snapshot. Conflicting Savings, PCV,
strategy, converter, voter, or gauge links and inconsistent custody fail with
`TopologyMismatch`. A changed coordinate fails with `InconsistentCoordinate`.
Core and Contracts typed failures remain recognizable; other transport errors
become `ReadUnavailable` with a preserved cause. Serialized Savings errors
contain only code and field, not raw provider payloads.

Donated receipts can make gauge custody exceed recorded stake; excess custody
is not assigned to the account. Querying the gauge itself as the beneficial
account is rejected. Gauge reward-token identity is read rather than assumed
from a symbol. Earned rewards and cached voter-directed MUSD revenue stay
separate from wallet yield and principal. Paid-yield history, event ledgers,
voter claims, gauge distribution, APY, cross-system TVL, and classic MUSD debt
are outside this reader.

## Canonical inputs and limitations

The generator resolves accepted Savings model/roles/reconciliation resources,
Contracts roots, and proposed `contracts:savings-dynamic-read-interfaces`.
Full official-explorer source/ABI snapshots remain in Contracts. No static
Contract ID or deployment is added for a dynamic role. Only required view
functions are emitted, with source digests and exact-runtime profiles.

The direct role code, including immutables, and converter implementation must
match their captured profiles. Savings implementation storage and runtime
must agree with its registry generation and source. Converter proxy dispatch
is bounded by governed PCV discovery and checked getter links; no new proxy
activation history or audit is claimed. Gauge creation input remains absent.

```sh
node scripts/generate-savings-package.ts
node scripts/generate-savings-package.ts --check
```

Rejected module/interface lifecycle, source digest mismatch, missing or
ambiguous reads, and unregenerated inputs fail generation. `reviewAfter`
triggers re-verification and does not silently mutate canonical support.

## Consumer and agent guidance

Consume the built entrypoint and compatible public types. Configure the ports
explicitly, choose a supported deployment/block, inspect every availability
discriminant before displaying or summing values, and preserve coordinates in
stored snapshots. Stop on topology conflicts or missing interface support and
refresh owning evidence; do not hardcode an address or ABI to bypass failure.

See the [focused example](../../../examples/musd-savings-readonly/README.md).
This guidance covers the source-alpha candidate; it does not imply a released
consumer skill or writer.

## Inspect this checkout

Use the [manifest](./package.json) and [exported entrypoint](./src/index.ts)
alongside this package's scope and injected-input contract. Build before
interpreting a missing artifact as an absent API. The [usage example](../../../examples/musd-savings-readonly/README.md)
exercises the workspace boundary. Reassess these owners after checkout changes;
private versions alone do not identify capability changes. Follow the
[capability guidance maintenance rule](../../../CONTRIBUTING.md#keep-capability-guidance-current)
when the public boundary, required inputs, or evidence dependencies change.
