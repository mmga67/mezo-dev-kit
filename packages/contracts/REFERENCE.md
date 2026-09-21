# Contracts SDK reference

Use `@mezo-dev-kit/contracts` to resolve a contract's deployment and ABI at a specific network and
block. Start with `resolveContract` for a single lookup, or inject `createContractRegistry()` into a
reader that needs repeated lookups.

A **deployment generation** identifies the code and interface valid for a recorded period. An
**ABI** describes how to encode calls and decode results. Resolution reads the generated catalog
without RPC; live runtime verification is a separate step. Use `readAbi` for read calls and the
curated operation resolver when an owning protocol needs an allowed transaction interface.

See [workspace setup](../../docs/reference/sdk.md) and [package scope](README.md). Protocol packages
own transaction preparation and execution requirements.

On this page:

- [Functions and registry methods](#functions-and-registry-methods)
- [Resolution input and result](#resolution-input-and-result)
- [Example](#example)
- [Errors and public types](#errors-and-public-types)
- [Operation and runtime interfaces](#operation-and-runtime-interfaces)
- [Basic pool interface profiles](#basic-pool-interface-profiles)
- [Voting interface profiles](#voting-interface-profiles)
- [Historical evidence](#historical-evidence)
- [Canonical generation](#canonical-generation)

## Functions and registry methods

### `resolveContract`

Resolve a contract at one exact network/block coordinate.

**Call:** `resolveContract(input)`

**Input → result:** `ContractResolutionInput → Readonly<ResolvedContract>`

### `listContractIds`

List generated identities; this does not prove deployment support at a coordinate.

**Call:** `listContractIds()`

**Input → result:** none → readonly `ContractId[]`

### `isContractId`

Test generated identity membership.

**Call:** `isContractId(value)`

**Input → result:** `unknown → value is ContractId`

### `createContractRegistry`

Return an immutable registry with `resolve(input)` and `listContractIds()`.

**Call:** `createContractRegistry()`

**Input → result:** none → `Readonly<ContractRegistry>`

The registry method is named `resolve`, while the top-level function is `resolveContract`. There is
no public custom-data constructor or arbitrary address fallback.

## Resolution input and result

`ContractResolutionInput` requires `contractId: ContractId`, `networkId: NetworkId` from Chains, and
`blockNumber: bigint`.

| Result fields                                                          | Meaning                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `contractId`, `networkId`, `deploymentId`, `address`, `blockNumber`    | Selected identity, generation, and requested coordinate.               |
| `deploymentFromBlock`, `currentCodeFromBlock`, `implementationAddress` | Deployment/code activation bounds and nullable implementation address. |
| `contractType`, `provenanceClass`, `abiAppliesTo`                      | Type and scope of deployment/source evidence.                          |
| `readAbi`                                                              | ABI entries for view/pure calls plus events and errors.                |
| `abi`                                                                  | Canonical and projected entry counts; file, ABI, and semantic digests. |
| `evidence`, `limitations`                                              | Catalog verification/review dates and support limits.                  |

`abi` is digest metadata, not the callable ABI array: use `readAbi` with your codec.
Payable/nonpayable functions, constructors, fallback, and receive entries are absent. Resolution
performs no RPC or current runtime-bytecode check. Consumers needing runtime reconciliation must add
it, as the protocol readers do.

## Example

Resolve an externally supplied contract ID and retain the reason when a known contract cannot be
used at the requested block:

```ts
import {
  ContractRegistryError,
  createContractRegistry,
  isContractId,
  listContractIds,
  resolveContract,
} from "@mezo-dev-kit/contracts";
import type { NetworkId } from "@mezo-dev-kit/chains";

export function inspectDeployment(input: unknown, networkId: NetworkId, blockNumber: bigint) {
  if (!isContractId(input)) {
    return { status: "unknown" as const };
  }

  try {
    const contract = resolveContract({ contractId: input, networkId, blockNumber });

    return { status: "available" as const, contract };
  } catch (error) {
    if (error instanceof ContractRegistryError) {
      return { status: "unavailable" as const, code: error.code, context: error.context };
    }

    throw error;
  }
}

export const registry = createContractRegistry();

export const contractIds = listContractIds();
// Obtain blockNumber from your selected provider before using it for a live read.
```

The helper returns `unknown`, `available`, or `unavailable`. A known ID can still lack a supported
generation at that block; the returned registry error explains that distinction.

Inject `registry` into [Core](../core/REFERENCE.md) or a protocol reader. Historical resolution can
fail even when a contract ID exists: an old proxy generation needs a matching supported ABI. An open
validity interval records no observed supersession, not a guarantee against future upgrades.

## Errors and public types

`ContractRegistryError(code, message, context, options?)` exposes `code`, structured `context`, and
an optional `cause`. Codes: `InvalidContractInput`, `UnknownContractId`, `MissingDeployment`,
`UnsupportedDeploymentState`, `OverlappingDeployments`, `HistoricalGenerationUnsupported`,
`AbiUnavailable`, `MalformedGeneratedContract`. Chains errors may propagate for invalid networks.

Public types: `ContractAbiEntry`, `ContractAddress`, `ContractId`, `ContractRegistry`,
`ContractResolutionInput`, `ResolvedContract`, `ContractRegistryErrorCode`,
`ContractRegistryErrorContext`. See the [export list](src/index.ts),
[type definitions](src/registry.ts), and built declarations (`dist/index.d.ts`).

## Operation and runtime interfaces

### `resolveOperation` — select a transaction ABI

Look up a curated operation by contract, network, block and function name. Supply exact input types
when the name is overloaded.

`resolveOperation({ contractId, networkId, blockNumber, functionName, inputTypes? })` returns
`ResolvedOperation` with `contract: ResolvedContract` and `functionAbi: ContractAbiEntry`. Its scope
includes mainnet `musd.borrower-operations`: `openTrove`, `addColl`, `withdrawColl`, `withdrawMUSD`,
`repayMUSD`, `adjustTrove`, `closeTrove`, `refinance`, and `claimCollateral`. It also exposes
Savings `deposit`, `withdraw`, `claimYield`, `approve`; MUSD `approve`; Morpho `supply`, `withdraw`,
`supplyCollateral`, `withdrawCollateral`, `borrow`, `repay`; and wrapper `depositAndStake`,
`withdraw`, `approve`; and the MEZO rebase distributor's `claim(uint256)`. Overloads require exact
`inputTypes`, e.g. `["uint256"]` for a direct wrapper call. Missing/ambiguous combinations throw
`AbiUnavailable`.

For registered MUSD NTT managers on Mezo, Ethereum and Base mainnet, ordinary private interfaces
include only the six-argument `transfer`, `completeOutboundQueuedTransfer`,
`cancelOutboundQueuedTransfer`, `completeInboundQueuedTransfer` and `executeMsg`. The registered
Wormhole transceiver exposes `receiveMessage`. Administrative, relayer-only and shortened transfer
entrypoints remain unavailable through this projection. The separate Bridges workflow owns
runtime/configuration, consent, fee, simulation and reconciliation requirements. The retained
TypeChain `TransferSent` discrepancy is unchanged; this projection does not correct or rely on that
event.

For the current Native Bridge generations, the ordinary source projection exposes
`bridge.native-mezo-bridge` on Ethereum mainnet: `bridgeERC20(address,uint256,address)`, and
`bridge.native-assets-precompile` on Mezo mainnet: `bridgeOut(address,uint256,uint8,bytes)`. Both
are nonpayable calls; the bridged amount belongs in calldata. `bridgeOut` returns a boolean and
`bridgeERC20` has no return value. System injection, validator attestations, administration, Bitcoin
deposits and triparty operations are excluded. These are ABI and runtime lookup capabilities; the
Bridges source workflow and its release qualification remain separate. Older transfer generations
continue to require the historical evidence API.

### `getNativeBridgeCalldataAbi` — decode observed bridge calls

Use this interface to inspect calldata from an observed transaction.

`getNativeBridgeCalldataAbi({ contractId, networkId, blockNumber })` resolves current source/system
calldata solely for decoding observed transactions. Its system `bridge` ABI does not appear in
`resolveOperation` and authorizes no writer.

### `getNativeTokenProfile` — inspect token expectations

Retrieve the expected precision and runtime identity for a recorded Native Bridge token
representation.

`getNativeTokenProfile({ networkId, tokenAddress })` returns a private `NativeTokenProfile`:
decimals, expected token bytecode hash, nullable proxy slot, implementation address/hash and
narrowly required extra read ABI. The four representations come from the indexed Native
qualification and existing mUSDC runtime owner. Verify these expectations at the actual coordinate;
a profile lookup alone establishes no live token identity or route support.

### `resolveEvent` — select a receipt event

Retrieve an event ABI before decoding protocol receipt logs.

`resolveEvent({ contractId, networkId, blockNumber, eventName })` returns a curated
`ContractAbiEntry` for receipt decoding. This includes compiler-derived Morpho library events
omitted by its explorer/read ABI. `getTokenInterface()` returns the canonical `balanceOf`,
`allowance`, `decimals`, `approve`, `Transfer` and `Approval` shapes; it does not establish token or
spender identity.

### `resolveRoleInterface` — inspect a discovered role

A role is a protocol-discovered contract, such as a gauge, whose address must be verified by its
owning reader.

`resolveRoleInterface({ role, networkId })` returns `ProtocolRoleInterface` with
`role: ProtocolRole`, `anchorContractId`, exact `runtimeSha256` and curated `abi`. Current roles are
`savings-gauge`, `vault-v2`, and `vault-gauge` on mainnet. They are source/runtime templates. The
owning protocol must discover and verify the address and topology at the requested block. Gauge
operations are `deposit`, `withdraw`, `getReward`; VaultV2 operations are `deposit`, `mint`,
`withdraw`, `redeem`, `approve`. Template availability is not writer support.

### `resolveRuntimeIdentity` — inspect expected code

Retrieve catalog code hashes and proxy expectations for comparison with provider responses.

`resolveRuntimeIdentity({ contractId, networkId, blockNumber })` returns `ContractRuntimeIdentity`:
`addressCodeSha256`, nullable `implementationCodeSha256`, and nullable `implementationSlot`. Its
generated scope includes the mainnet MUSD borrowing roots, Savings, Morpho, the USDC Lending Vault
wrapper, basic pools/router, escrows, voters, reward factory, MEZO rebase distributor/minter, CL
factory, pool implementation, position manager, swap router and gauge factory/implementation,
institutional roots and Skip native interface, the six registered NTT manager/transceiver
deployments on Mezo, Ethereum and Base, and the two current Native Bridge deployments above. Native
expectations are selected by resolved deployment ID: the Ethereum proxy has code, implementation
code and slot checks; Mezo has a wrapper code check. A wrapper hash alone does not establish native
client execution behavior. Consumers fetch bytes and slots at their own coordinate and compare them;
a catalog hash is not a live verification. Runtime lookup retains normal deployment resolution
failures. `readAbi` remains the separate read-call interface.

Encode the curated `closeTrove` interface at an illustrative block. This local example creates
calldata only:

```ts
import { resolveOperation } from "@mezo-dev-kit/contracts";
import { encodeFunctionData } from "@mezo-dev-kit/evm";

const operation = resolveOperation({
  contractId: "musd.borrower-operations",
  networkId: "mezo-mainnet",
  blockNumber: 12_000_000n,
  functionName: "closeTrove",
});

export const data = encodeFunctionData(operation.functionAbi);
```

`data` contains the encoded call. For an actual borrower operation, use Borrowing’s preparation API
to check account state and transaction requirements.

ABI availability does not authorize a transaction or promote proposed writer support. Prefer
borrowing's preparation API for borrower actions.

## Basic pool interface profiles

### `resolveBasicPoolInterface` — pool and registry profiles

Select the interface template used to verify a discovered basic pool or factory registry.

`resolveBasicPoolInterface({networkId, role}): BasicPoolInterface` supports mainnet roles `pool` and
`factory-registry`. Each returns `anchorContractId`, getter name, expected implementation/registry
`runtimeSha256`, pinned `sourceSha256`, and a curated `abi`. The Pool profile is for the
implementation; a pool clone's own bytes must also be validated. Runtime/template presence does not
prove factory membership, token order, stable mode, reserves or ownership. Both source bundles
reproduce their executable bytes and match pinned Tigris primary source. Private operation support
remains proposed pending review.

`resolveOperation` additionally curates basic Router `addLiquidity`, `removeLiquidity`, and
`swapExactTokensForTokens` on mainnet. Router and PoolFactory runtime identities are also projected.
Direct Pool `mint`, `burn` and `swap`, governance and unsafe/FOT variants are not public operation
helpers.

The CL position manager projection supplies `mint`, `increaseLiquidity`, `decreaseLiquidity`,
`collect`, `burn`, and single-NFT `approve` with exact shapes. Pools owns asset/owner/range checks,
the existing-pool zero-price sentinel, approval planning, simulation and accounting-versus-payment
reconciliation. The CL gauge implementation projection supplies `deposit(uint256)`,
`withdraw(uint256)` and the two `getReward` overloads. Select explicit `inputTypes`; the address
overload is voter-only. Calls target a verified dynamic gauge, not the implementation address.
Incentives owns that role and lifecycle. The CL router projection supplies `exactInputSingle` and
`exactInput`. Swaps owns bounded source-based quoting, token/spender checks, the exact tuple/packed
path, default price-limit sentinel and complete receipt/asset reconciliation.

## Voting interface profiles

### `resolveVotingInterface` — voter discovery

Select the voter contract and its recorded target-list layout for a voting domain.

`resolveVotingInterface({networkId, domain}): VotingInterface` selects a mainnet `VotingDomain`
(`pools`, `boost`, `validator`), returning `contractId`, `listGetter`, and decimal `targetListSlot`.
These slots derive from retained compiler layouts reproduced against the accepted executable. Verify
the runtime before reading the mapping's dynamic-array length; they are generation-specific.

### `resolveVotingRewardInterface` — reward contract templates

Retrieve the bytecode template and ABI for a discovered fee or bribe reward contract.

`resolveVotingRewardInterface({networkId, role}): VotingRewardInterface` selects `fees` or `bribe`,
returning `factoryContractId`, full `runtimeTemplate`, `immutableWords` (`role`, byte `start`), and
curated `abi`. The owning reader must resolve the current voter mapping, substitute every
`forwarder`/`voter`/`ve` immutable, compare the full child runtime, and verify its getters. A
template never establishes an arbitrary address as a reward contract.

`resolveOperation` includes `vote`, `reset`, and `claimBribes` for all three voters, plus
`claimFees` for PoolsVoter. Their events and exact runtime identities are projected with the reward
factory. Escrow lock operations are also curated. These are private implementation inputs; use the
Incentives preparation API.

Inspect the validator voter and its bribe reward template without RPC:

```ts
import { resolveVotingInterface, resolveVotingRewardInterface } from "@mezo-dev-kit/contracts";

const voter = resolveVotingInterface({ networkId: "mezo-mainnet", domain: "validator" });

const rewards = resolveVotingRewardInterface({ networkId: "mezo-mainnet", role: "bribe" });

console.log(voter.contractId, voter.targetListSlot, rewards.immutableWords);
```

The result identifies the voter and template fields that the Incentives reader uses for discovery.
It is not a verified reward-contract address.

## Historical evidence

### `resolveHistoricalContractEvidence` — recorded historical observations

Inspect a specifically observed historical generation when the current deployment resolver cannot
represent it.

`resolveHistoricalContractEvidence(input: ContractResolutionInput): HistoricalContractEvidence`
resolves the separate proposed historical catalog. It throws `HistoricalEvidenceUnavailable` for
gaps, including unobserved blocks inside an otherwise known implementation interval. Existing
resolvers keep their current generation restrictions.

The result contains `kind: "historical-contract-evidence"`, logical `contractId`, `networkId`,
`generationId`, `address`, and the exact `coordinate` (bigint block number and hash).
`coverage.fromBlock` and `coverage.untilExclusiveBlock` describe observation coverage, not
installation heights. `runtime` provides `codeAddress`, the Keccak-256 `codeHash`,
`implementationAddress`, `implementationSlot`, `executionVersion`, and `provenanceClass`. The caller
must verify these at the coordinate when observing live provider responses.

`readAbi` contains view/pure functions and events. `calldataAbi` contains the full generation's
functions for decoding included calls, including system payloads. It is not an operation allowlist.
`evidence` preserves lifecycle, `verifiedAt`, and SHA-256 digests for ABI serialization, source,
build and observations. `limitations` travels with the result. Nested ABI data and result fields are
immutable. Artifact and source/build provenance are checked by generation; runtime does not re-read
files or qualify release evidence.

This type intentionally lacks current deployment fields and is not assignable to `ResolvedContract`.
It adds no fallback to current ABI resolution, signer, writer or supported route. Initial profiles
remain pending qualified review.

Inspect a retained Native Bridge observation at its recorded historical block:

```ts
import { resolveHistoricalContractEvidence } from "@mezo-dev-kit/contracts";

const evidence = resolveHistoricalContractEvidence({
  contractId: "bridge.native-assets-precompile",
  networkId: "mezo-mainnet",
  blockNumber: 8_944_561n,
});

console.log(evidence.generationId, evidence.coordinate, evidence.evidence.reviewStatus);
```

The returned generation and coordinate describe that observation’s coverage. They cannot be
substituted for a current `ResolvedContract`.

## Canonical generation

`scripts/generate/generate-contracts-package.ts` resolves `contracts:contract-deployments`,
`contracts:contract-abis`, and every indexed `contracts:abi.*` artifact. It validates lifecycle
fields, IDs, addresses, validity/generation ranges, ABI references/counts/file digests, and
read-entry mutability. It records a SHA-256 digest over the Contracts module index and all exact
consumed bytes, then emits `src/data.generated.ts` deterministically. Runtime code never reads
`knowledge/`.

It also projects ordinary Native source calls and current deployment runtime expectations into
`src/native.generated.ts`, checking the accepted deployment lifecycle, provenance class and exact
source-call signature. Bounded token profiles and observation-only calldata come from their indexed
owners, with artifact digests and runtime/proxy bytes checked during generation. Bridges owns source
execution; historical observation coverage stays separate.

The same generator validates `contracts:historical-contract-evidence` and its separate
source/build/RPC artifacts, then emits `src/historical.generated.ts`.
`resolveHistoricalContractEvidence` returns `HistoricalContractEvidence` at explicitly observed
blocks. Its separate calldata ABI is for observing included transactions. It cannot be passed as
`ResolvedContract` to current operation or runtime helpers. See
[Contract identity and provenance](../../docs/manifest#contract-identity-and-provenance). These
additional profiles remain proposed pending qualified release review. Contracts' offline capture
tools use its existing EVM workspace dependency; build EVM before invoking the generator directly
from a fresh checkout.

```sh
pnpm --filter @mezo-dev-kit/contracts generate:check
```

Do not edit generated data. Update and validate the canonical Contracts owner, regenerate, and
review input and output together.
