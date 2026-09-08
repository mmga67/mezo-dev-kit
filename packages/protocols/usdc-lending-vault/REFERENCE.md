# USDC Lending Vault SDK reference

Import from `@mezo-dev-kit/usdc-lending-vault`. This private workspace package
reads the accepted depositor topology and composes the public mUSDC lending
reader. See [setup](../../../docs/reference/sdk.md) and [scope](README.md).

## Reader

`createVaultReader(config: VaultReaderConfig)` returns a `VaultReader`.
Configuration requires `networkId`, public `registry`, `transport: VaultTransport`,
and `codec: LendingCodec` from `@mezo-dev-kit/musdc-lending`.

`reader.read({ account, maxPriceAgeSeconds, previewAssets, previewShares,
blockNumber? })` returns `Promise<Readonly<VaultSnapshot>>`. Account and both
preview quantities are required. Quantities, price age in seconds, and the
optional block number are bigint. `previewAssets` is mUSDC base units and
`previewShares` is VaultV2 shares. A head is selected once when the block is
omitted. Only the accepted mainnet topology/generation is implemented.

## Pure functions

| Function                 | Parameters → result                                                                                  | Behavior                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `previewVaultConversion` | `(state, operation, value) → bigint`                                                                 | Fee-aware VaultV2 preview. Operation is `deposit`, `mint`, `withdraw`, or `redeem`. |
| `wrapperToReceipts`      | `(vaultShares, receiptSupply, userVaultShares) → bigint`                                             | Convert VaultV2 shares to wrapper receipts, rounding down.                          |
| `wrapperToVaultShares`   | `(receipts, receiptSupply, userVaultShares) → bigint`                                                | Convert wrapper receipts to VaultV2 shares, rounding down.                          |
| `calculateVaultHarvest`  | `({ userVaultShares, currentRatio, lastShareRatio, gaugeSet }) → { yieldShares, newLastShareRatio }` | Calculate appreciation assigned to yield and the next high-water ratio.             |

All quantities and ratios are bigint; `gaugeSet` is boolean.
`VaultPreviewState` requires `newTotalAssets`, `totalSupply`,
`performanceFeeShares`, `managementFeeShares`, and `virtualShares`.
Use the fee-aware state from the reader, not unadjusted totals.

| Preview operation | Input          | Output         | Rounding |
| ----------------- | -------------- | -------------- | -------- |
| `deposit`         | mUSDC assets   | VaultV2 shares | Down     |
| `mint`            | VaultV2 shares | mUSDC assets   | Up       |
| `withdraw`        | mUSDC assets   | VaultV2 shares | Up       |
| `redeem`          | VaultV2 shares | mUSDC assets   | Down     |

Wrapper conversions use the wrapper's separate virtual terms. `userVaultShares`
excludes accumulated yield; use the post-harvest amount for projected receipt
claims. Harvest keeps the high-water ratio unchanged when the current ratio
falls. Without a gauge, it assigns no yield and follows the current ratio.
All helpers validate unsigned values and checked uint256 intermediate products.

## Ports and example

`VaultTransport` extends the [lending transport](../musdc-lending/REFERENCE.md#ports).
It supplies chain/head/block-with-timestamp, read, code, storage, and token
balance operations. Its `read(request)` must accept a missing `contractId`
for discovered-role addresses. It may return a value or promise; the reader
awaits it. All methods must honor the explicit block/hash. Use the lending
codec's scalar/ordered-array normalization rules.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { parseUserAddress } from "@mezo-dev-kit/evm";
import type { LendingCodec } from "@mezo-dev-kit/musdc-lending";
import { createVaultReader, previewVaultConversion } from "@mezo-dev-kit/usdc-lending-vault";
import type { VaultTransport } from "@mezo-dev-kit/usdc-lending-vault";

export async function previewDeposit(
  transport: VaultTransport,
  codec: LendingCodec,
  accountInput: unknown,
  assets: bigint,
  maxPriceAgeSeconds: bigint,
  blockNumber?: bigint,
) {
  const reader = createVaultReader({
    networkId: "mezo-mainnet",
    registry: createContractRegistry(),
    transport,
    codec,
  });
  const snapshot = await reader.read({
    account: parseUserAddress(accountInput),
    ...(blockNumber === undefined ? {} : { blockNumber }),
    maxPriceAgeSeconds,
    previewAssets: assets,
    previewShares: 0n,
  });
  if (snapshot.vaultState.status === "unavailable") {
    return { status: "unavailable" as const, error: snapshot.vaultState.error };
  }
  return {
    status: "available" as const,
    shares: previewVaultConversion(snapshot.vaultState.value, "deposit", assets),
    coordinate: snapshot.coordinate,
    onChainPreviews: snapshot.previews, // Has its own availability status.
  };
}
```

```ts
import {
  calculateVaultHarvest,
  wrapperToReceipts,
  wrapperToVaultShares,
} from "@mezo-dev-kit/usdc-lending-vault";

// Synthetic empty wrapper and a falling-ratio scenario.
export const receipts = wrapperToReceipts(1n, 0n, 0n); // 1n
export const vaultShares = wrapperToVaultShares(receipts, 0n, 0n); // 1n
export const harvest = calculateVaultHarvest({
  userVaultShares: 100n,
  currentRatio: 9n,
  lastShareRatio: 10n,
  gaugeSet: true,
}); // { yieldShares: 0n, newLastShareRatio: 10n }
```

See the [executable example](../../../examples/usdc-lending-vault-readonly/README.md).
Previews calculate conversions, not transaction capacity. Execution gates,
caps, timelocks, penalties, and required deallocation are not implemented here.

## Snapshot fields

| Fields                                                                     | Meaning                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `coordinate`, `asOf`, `account`, `vault`, `wrapper`, `adapter`, `evidence` | Block/hash/time, identities, and canonical evidence digest/dates.                    |
| `underlyingMarket`                                                         | Full lending snapshot for the adapter position, including its own partial failures.  |
| `vaultState`, `previews`                                                   | Fee-aware state and comparisons with all four on-chain preview views.                |
| `adapterAssets`, `allocationReconciled`, `idleLiquidity`                   | Allocation observation, reconciliation result, and idle mUSDC.                       |
| `wrapperState`, `harvest`                                                  | Receipt supply, held/user/yield shares, last ratio, and optional harvest projection. |
| `walletReceipts`, `walletVaultShares`                                      | Separate direct holdings in the wrapper and VaultV2.                                 |
| `gauge`, `beneficialReceipts`                                              | Gauge ownership/rewards and wallet-plus-stake receipt total.                         |
| `receiptClaim`, `receiptAssets`                                            | Receipt-backed VaultV2 shares and their mUSDC valuation.                             |

Optional fields use `VaultReadValue<T>`: available `value` or unavailable
`error: { code, field }`. `wrapperState` and `underlyingMarket` are required
objects, with the latter retaining lending availability groups. Gauge stake,
earnings, and redirected revenue have independent availability discriminants.
`VaultAmount<Unit>` carries `unit` and `baseUnits`.

Vault assets already include adapter assets. Wallet receipts plus beneficial
gauge stake are counted once; custody is not another account position.
Redirected VaultV2 revenue and earned gauge-token rewards keep separate units.

## Errors and public types

`VaultReadError(code, field, options?)` exposes `code`, `field`, optional `cause`,
and `toJSON() → { code, field }`. Codes: `InvalidValue`, `UnsupportedNetwork`,
`UnsupportedRuntime`, `TopologyMismatch`, `ReadUnavailable`,
`InconsistentCoordinate`. Unknown root/vault runtime or conflicting topology
rejects; an unknown gauge is unavailable and its interface is not called.
Lending/Core/Contracts failures retain the behavior of the composed boundary.

Public types: `VaultReadErrorCode`, `VaultAmount`, `VaultPreviewState`,
`VaultGaugeState`, `VaultReader`, `VaultReaderConfig`, `VaultReadValue`,
`VaultSnapshot`, `VaultTransport`, `VaultTransportReadRequest`.
See [exports](src/index.ts) and [port/result definitions](src/types.ts).

## Writer

`createVaultRpcReader({ networkId, registry, transport })` composes Core's
`RpcTransport` with the existing lending and vault ports.
`createVaultTargetResolver({ reader, account, maxPriceAgeSeconds })` resolves
`vault-v2`, `vault-gauge`, and `loan-token` roles through the verified current
wrapper graph. Inject it as Core's `resolveTarget`.

`forecastVault(snapshot, action, bounds)` is pure. Its `VaultForecast` contains
`input`, `output`, `assets`, `shares`, `receipts`, and `requiresApproval`.
It uses fee-aware VaultV2 conversions and the wrapper's high-water accounting.
Ordinary withdrawals also require sufficient idle/deallocation liquidity.

`createVaultWriter({ reader, registry, transport, execution })` returns
`VaultWriter`. This private implementation needs qualified review before release.

| Method      | Input → result                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `prepare`   | `{ operationId, account, action, bounds }` → `PreparedVault`.                                                |
| `simulate`  | Owned preparation → Core `SimulatedTransaction`; pending approvals reject.                                   |
| `submit`    | Preparation and its simulation → Core `SubmissionRecord`, after fresh gates/caps/liquidity/allowance checks. |
| `reconcile` | Preparation and durable record → `{ state, record, receipt, outcome: VaultOutcome }`.                        |

| `VaultAction`                        | Input → output / approval                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `{ kind: "deposit", assets }`        | mUSDC assets → VaultV2 shares; approve mUSDC to VaultV2.                                     |
| `{ kind: "mint", shares }`           | mUSDC assets → exact VaultV2 shares; approve explicit `maxInput` budget.                     |
| `{ kind: "withdraw", assets }`       | VaultV2 shares → exact mUSDC assets; self-owner needs no approval.                           |
| `{ kind: "redeem", shares }`         | Exact VaultV2 shares → mUSDC assets; no approval.                                            |
| `{ kind: "wrap-and-stake", shares }` | VaultV2 shares → wrapper receipts staked for the account; approve VaultV2 shares to wrapper. |
| `{ kind: "unwrap", receipts }`       | Wallet wrapper receipts → VaultV2 shares; unstake first, no approval.                        |

All quantities are positive bigint base units. mUSDC has 6 decimals; VaultV2
shares and wrapper receipts are distinct raw quantities. There is no standalone
wrap call in this interface: `depositAndStake` creates beneficial gauge stake.
Use [Incentives](../incentives/REFERENCE.md) for unstaking or streamed reward
claims. The wrapper's `claimYield` is gauge-only; it is not a user claim method.

`VaultBounds` requires positive bigint `maxBlockAge`, `maxPriceAgeSeconds`,
and bigint `maxInput`, `minOutput`. Input/output units follow the table above.
These are client preflight bounds; these contract entrypoints have no on-chain
deadline or output minimum. Reconciliation reports actual `boundsSatisfied`.

`PreparedVault` includes `snapshot`, `action`, `bounds`, `forecast`, `token`,
`approval`, exact `transaction`, and `state: VaultWriteState`. The write state
records `liquidityData`, four gate identities, the three adapter allocation
IDs with current absolute/relative caps, and `expectedAllocationChange`.
Preparation checks the required sender/receiver gates, adapter registration,
market tuple, each cap and allocation ownership. It never uses zero `max*`
getters as capacity. Only the current single-adapter ordinary liquidity path
is implemented; curator allocation, timelock changes and forced deallocation
with penalties remain separate operations.

```ts
import {
  createVaultRpcReader,
  createVaultTargetResolver,
  createVaultWriter,
} from "@mezo-dev-kit/usdc-lending-vault";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createExecutionClient, createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest, SubmissionStore } from "@mezo-dev-kit/core";
declare const request: RpcRequest;
declare const account: `0x${string}`;
declare const store: SubmissionStore;
const network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry();
const transport = createRpcTransport({ id: "app", request });
const reader = createVaultRpcReader({ networkId: network.id, registry, transport });
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request }),
  store,
  maxBlockAge: 5n,
  confirmations: 2n,
  resolveTarget: createVaultTargetResolver({ reader, account, maxPriceAgeSeconds: 60n }),
});
const writer = createVaultWriter({ reader, registry, transport, execution });
const prepared = await writer.prepare({
  operationId: "unique-vault-deposit",
  account,
  action: { kind: "deposit", assets: 100n * 10n ** 6n },
  bounds: { maxBlockAge: 5n, maxPriceAgeSeconds: 60n, minOutput: 1n, maxInput: 100n * 10n ** 6n },
});
// Choose an application-appropriate share minimum; 1n here only rejects zero output.
// Confirm any Token SDK approval and reprepare before proceeding.
if (prepared.approval.kind === "sufficient") {
  const record = await writer.submit(prepared, await writer.simulate(prepared));
  console.log(await execution.observe(record));
  // Persist; observe confirmation; then writer.reconcile(prepared, record).
}
```

`VaultOutcome` reports `kind`, actual `input`, `output`, `assets`, `shares`,
`receipts`, `boundsSatisfied` and receipt-block `snapshot`. Reconciliation
checks deposit/withdraw events, exact asset movements, share/receipt ownership,
wrapper gauge stake and ordinary allocation events plus post-state. Another
transaction affecting the account or allocation in the same block can cause
a mismatch. Client preflight is not an atomic approval/deposit guarantee.

Use [Tokens](../../tokens/REFERENCE.md) for separate approvals and
[Core](../../core/REFERENCE.md) for durable confirmation/recovery. Do not
resubmit uncertain intent blindly. Restored exact preparation context can be
reconciled; a new simulation requires an owned preparation. The
[local integration](test/fork.ts) exercises all six paths plus gauge exit,
restaking and a nonzero reward claim with labelled native-engine fixtures.
Node is tested; browser bundles remain unverified.

`VaultWriteError` exposes `code: VaultWriteErrorCode`: `InvalidInput`,
`UnavailableState`, `InsufficientBalance`, `InsufficientLiquidity`, `GateClosed`,
`CapacityExceeded`, `BoundsExceeded`, `ApprovalRequired`, `StaleState`,
`ReconciliationMismatch`. Owning EVM, Lending, Tokens, Contracts and Core errors
may propagate. Public writer types: `VaultAction`, `VaultBounds`,
`VaultForecast`, `VaultWriteErrorCode`, `PreparedVault`, `VaultOutcome`,
`VaultWriter`, `VaultWriteState`.
