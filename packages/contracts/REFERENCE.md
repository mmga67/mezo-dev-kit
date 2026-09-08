# Contracts SDK reference

Import from `@mezo-dev-kit/contracts`. This private workspace package resolves
accepted deployment generations and read-safe ABI projections. See
[setup](../../docs/reference/sdk.md) and the [package contract](README.md).

## Functions and registry methods

`resolveOperation({ contractId, networkId, blockNumber, functionName, inputTypes? })`
returns `ResolvedOperation` with `contract: ResolvedContract` and
`functionAbi: ContractAbiEntry`. Its initial scope is mainnet
`musd.borrower-operations`: `openTrove`, `addColl`, `withdrawColl`,
`withdrawMUSD`, `repayMUSD`, `adjustTrove`, `closeTrove`, `refinance`, and
`claimCollateral`. It also exposes Savings `deposit`, `withdraw`, `claimYield`,
`approve`; MUSD `approve`; Morpho `supply`, `withdraw`, `supplyCollateral`,
`withdrawCollateral`, `borrow`, `repay`; and wrapper `depositAndStake`,
`withdraw`, `approve`. Overloads require exact `inputTypes`, e.g.
`["uint256"]` for a direct wrapper call. Missing/ambiguous combinations throw
`AbiUnavailable`.

`resolveEvent({ contractId, networkId, blockNumber, eventName })` returns a
curated `ContractAbiEntry` for receipt decoding. This includes compiler-derived
Morpho library events omitted by its explorer/read ABI. `getTokenInterface()`
returns the canonical `balanceOf`, `allowance`, `decimals`, `approve`, `Transfer`
and `Approval` shapes; it does not establish token or spender identity.

`resolveRoleInterface({ role, networkId })` returns `ProtocolRoleInterface`
with `role: ProtocolRole`, `anchorContractId`, exact `runtimeSha256` and curated
`abi`. Current roles are `savings-gauge`, `vault-v2`, and `vault-gauge` on
mainnet. They are source/runtime templates. The owning protocol must discover
and verify the address and topology at the requested block. Gauge operations
are `deposit`, `withdraw`, `getReward`; VaultV2 operations are `deposit`, `mint`,
`withdraw`, `redeem`, `approve`. Template availability is not writer support.

`resolveRuntimeIdentity({ contractId, networkId, blockNumber })` returns
`ContractRuntimeIdentity`: `addressCodeSha256`, nullable
`implementationCodeSha256`, and nullable `implementationSlot`. Its generated
scope is the thirteen mainnet MUSD borrowing roots plus Savings, Morpho, the
USDC Lending Vault wrapper, PoolsVoter and Skip native interface (eighteen roots). Consumers
fetch bytes and slots at their own coordinate and compare them; a catalog hash
is not a live verification. Both functions retain normal deployment resolution
failures. Existing `readAbi` is unchanged.

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

ABI availability does not authorize a transaction or promote proposed writer
support. Prefer borrowing's preparation API for borrower actions.

| API                        | Input → result                                         | Behavior                                                                           |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `resolveContract(input)`   | `ContractResolutionInput → Readonly<ResolvedContract>` | Resolve a contract at one exact network/block coordinate.                          |
| `listContractIds()`        | none → readonly `ContractId[]`                         | List generated identities; this does not prove deployment support at a coordinate. |
| `isContractId(value)`      | `unknown → value is ContractId`                        | Test generated identity membership.                                                |
| `createContractRegistry()` | none → `Readonly<ContractRegistry>`                    | Return an immutable registry with `resolve(input)` and `listContractIds()`.        |

The registry method is named `resolve`, while the top-level function is
`resolveContract`. There is no public custom-data constructor or arbitrary
address fallback.

## Resolution input and result

`ContractResolutionInput` requires `contractId: ContractId`,
`networkId: NetworkId` from Chains, and `blockNumber: bigint`.

| Result fields                                                          | Meaning                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `contractId`, `networkId`, `deploymentId`, `address`, `blockNumber`    | Selected identity, generation, and requested coordinate.               |
| `deploymentFromBlock`, `currentCodeFromBlock`, `implementationAddress` | Deployment/code activation bounds and nullable implementation address. |
| `contractType`, `provenanceClass`, `abiAppliesTo`                      | Type and scope of deployment/source evidence.                          |
| `readAbi`                                                              | ABI entries for view/pure calls plus events and errors.                |
| `abi`                                                                  | Canonical and projected entry counts; file, ABI, and semantic digests. |
| `evidence`, `limitations`                                              | Catalog verification/review dates and support limits.                  |

`abi` is digest metadata, not the callable ABI array: use `readAbi` with your
codec. Payable/nonpayable functions, constructors, fallback, and receive entries
are absent. Resolution performs no RPC or current runtime-bytecode check.
Consumers needing runtime reconciliation must add it, as the protocol readers do.

## Example

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
  if (!isContractId(input)) return { status: "unknown" as const };
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

Inject `registry` into [Core](../core/REFERENCE.md) or a protocol reader.
Historical resolution can fail even when a contract ID exists: an old proxy
generation needs a matching supported ABI. An open validity interval records
no observed supersession, not a guarantee against future upgrades.

## Errors and public types

`ContractRegistryError(code, message, context, options?)` exposes `code`,
structured `context`, and an optional `cause`. Codes: `InvalidContractInput`,
`UnknownContractId`, `MissingDeployment`, `UnsupportedDeploymentState`,
`OverlappingDeployments`, `HistoricalGenerationUnsupported`, `AbiUnavailable`,
`MalformedGeneratedContract`. Chains errors may propagate for invalid networks.

Public types: `ContractAbiEntry`, `ContractAddress`, `ContractId`,
`ContractRegistry`, `ContractResolutionInput`, `ResolvedContract`,
`ContractRegistryErrorCode`, `ContractRegistryErrorContext`.
See the [export list](src/index.ts), [type definitions](src/registry.ts), and
built declarations (`dist/index.d.ts`).

## Basic pool interface profiles

`resolveBasicPoolInterface({networkId, role}): BasicPoolInterface` supports
mainnet roles `pool` and `factory-registry`. Each returns `anchorContractId`,
getter name, expected implementation/registry `runtimeSha256`, pinned
`sourceSha256`, and a curated `abi`. The Pool profile is for the implementation;
a pool clone's own bytes must also be validated. Runtime/template presence does
not prove factory membership, token order, stable mode, reserves or ownership.
Both source bundles reproduce their executable bytes and match pinned Tigris
primary source. Private operation support remains proposed pending review.

`resolveOperation` additionally curates basic Router `addLiquidity`,
`removeLiquidity`, and `swapExactTokensForTokens` on mainnet. Router and
PoolFactory runtime identities are also projected. Direct Pool `mint`, `burn`
and `swap`, governance and unsafe/FOT variants are not public operation helpers.
