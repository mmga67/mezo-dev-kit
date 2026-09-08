# mUSDC lending SDK reference

Import from `@mezo-dev-kit/musdc-lending`. This private workspace package reads
the accepted mainnet BTC/mUSDC Morpho market and performs exact accounting.
It does not implement classic MUSD borrowing. See
[setup](../../../docs/reference/sdk.md) and [scope](README.md).

## Reader

`createLendingReader(config)` returns a `LendingReader`.
`config: LendingReaderConfig` requires `networkId`, public `registry`,
`transport: LendingTransport`, and `codec: LendingCodec`.

`reader.read({ account, maxPriceAgeSeconds, blockNumber? })` returns
`Promise<Readonly<LendingSnapshot>>`. Account and maximum price age are required;
age is a bigint number of seconds. The optional block is bigint. Omission
selects one head and rechecks its coordinate across all stages. Only the
accepted mainnet market/generation is implemented.

## Pure functions

| Function                   | Parameters → result                                                         | Units and behavior                                                                           |
| -------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `lendingToShares`          | `(assets, totalAssets, totalShares, rounding) → bigint`                     | Asset base units to the corresponding supply or borrow shares, using deployed virtual terms. |
| `lendingToAssets`          | `(shares, totalAssets, totalShares, rounding) → bigint`                     | Shares to the corresponding asset base units.                                                |
| `calculateLendingInterest` | `(borrowRate, elapsed, totalBorrowAssets) → { compound, interest }`         | Per-second WAD rate, elapsed seconds, asset base units; three-term Taylor calculation.       |
| `accrueLendingMarket`      | `(market, borrowRate, asOf) → LendingMarketState & { interest, feeShares }` | Accrue market totals and fee-share dilution to an explicit timestamp in seconds.             |
| `calculateLendingHealth`   | `(collateral, price, lltv, borrowed) → { healthy, maxBorrowAssets }`        | BTC wei, market oracle-scaled price, WAD LLTV, and mUSDC debt base units.                    |

All numeric arguments/results above are bigint; `rounding` is `"down" | "up"`.
Use matching totals: supply shares use supply totals, borrow shares use borrow
totals. Supply asset valuation rounds down and debt rounds up. Do not pass a
display USD/BTC quote as the market's scaled oracle price.

`LendingMarketState` requires `totalSupplyAssets`, `totalSupplyShares`,
`totalBorrowAssets`, `totalBorrowShares`, `lastUpdate`, and `fee` (WAD fraction).
Helpers check uint256 intermediate products and the market's uint128 storage
bounds where applicable. An earlier accrual timestamp, fee above WAD, or borrow
assets greater than supply assets fails validation. The pure health helper
does not establish price freshness; the reader performs that verification.

## Ports

`LendingTransport` implements Core's `id`, `getChainId`, `getBlockNumber`, and
`read`. Its `getBlock(blockNumber)` additionally returns `timestamp`. It adds
`getCode({ ...coordinate, address })`,
`getStorage({ ...coordinate, address, slot })`, and
`getTokenBalance({ ...coordinate, token, account })`. Every method must honor
the explicit block/hash; the token balance is the actual requested asset's
balance, not an accounting estimate.

`LendingCodec.encodeRead({ abi, functionName, args })` returns calldata;
`decodeRead({ abi, functionName, args, data })` returns decoded values. Scalars
are bigint or address strings; tuple/multiple outputs are ordered arrays.
`LendingAbiValue` supports nested arrays; `borrowRateView` uses two tuple
arguments. Adapters must normalize provider-specific output shapes.

## Example

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { parseUserAddress } from "@mezo-dev-kit/evm";
import { createLendingReader } from "@mezo-dev-kit/musdc-lending";
import type { LendingCodec, LendingTransport } from "@mezo-dev-kit/musdc-lending";

export async function readLending(
  transport: LendingTransport,
  codec: LendingCodec,
  accountInput: unknown,
  maxPriceAgeSeconds: bigint,
  blockNumber?: bigint,
) {
  const reader = createLendingReader({
    networkId: "mezo-mainnet",
    registry: createContractRegistry(),
    transport,
    codec,
  });
  const snapshot = await reader.read({
    account: parseUserAddress(accountInput),
    maxPriceAgeSeconds,
    ...(blockNumber === undefined ? {} : { blockNumber }),
  });
  if (snapshot.debt.status === "unavailable") {
    return { status: "unavailable" as const, error: snapshot.debt.error };
  }
  return {
    status: "available" as const,
    coordinate: snapshot.coordinate,
    debt: snapshot.debt.value,
    health: snapshot.health, // Inspect this independent availability discriminant.
  };
}
```

```ts
import {
  accrueLendingMarket,
  calculateLendingHealth,
  calculateLendingInterest,
  lendingToAssets,
  lendingToShares,
} from "@mezo-dev-kit/musdc-lending";

// Synthetic empty market: virtual terms keep conversions defined.
const market = {
  totalSupplyAssets: 0n,
  totalSupplyShares: 0n,
  totalBorrowAssets: 0n,
  totalBorrowShares: 0n,
  lastUpdate: 100n,
  fee: 0n,
};
export const shares = lendingToShares(1n, 0n, 0n, "down");
export const assets = lendingToAssets(shares, 0n, 0n, "down"); // 1n
export const interest = calculateLendingInterest(0n, 1n, 0n); // interest: 0n
export const accrued = accrueLendingMarket(market, 0n, 101n);
export const health = calculateLendingHealth(0n, 0n, 0n, 0n); // healthy: true
```

See the [executable example](../../../examples/musdc-lending-readonly/README.md).

## Results, freshness, and errors

| Snapshot fields                                         | Meaning                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `coordinate`, `asOf`, `marketId`, `account`, `evidence` | Block/hash, timestamp, identities, and canonical input digest/dates.                |
| `storedMarket`, `borrowRate`, `accruedMarket`           | Stored totals, optional rate, optional totals after accrual.                        |
| `position`, `supplyAssets`, `debt`                      | Shares/collateral and separate asset/debt valuations.                               |
| `price`, `health`                                       | Validated price observation and position health.                                    |
| `tokenLiquidity`, `accountingLiquidity`                 | Actual Morpho token balance versus stored supply assets minus stored borrow assets. |

Except for required identities, `storedMarket`, and `accountingLiquidity`, the
read groups above use `LendingReadValue<T>`: available `value` or unavailable
`error: { code, field }`. `LendingAmount<Unit>` carries `unit` and `baseUnits`.

Nonzero-debt health requires agreement between the market oracle and the
normalized feed, with a nonfuture timestamp within `maxPriceAgeSeconds` at
`asOf`. Equality at the age limit is accepted. Zero debt can be healthy without
a price; unavailable debt is never zero. Historical freshness is evaluated at
the block timestamp, not the current wall clock. There is no price fallback.

`LendingReadError(code, field, options?)` exposes `code`, `field`, optional
`cause`, and `toJSON() → { code, field }`. Codes: `InvalidValue`,
`UnsupportedNetwork`, `UnsupportedRuntime`, `TopologyMismatch`,
`ReadUnavailable`, `InconsistentCoordinate`, `PriceStale`, `PriceFuture`,
`PriceMissingTime`, `PriceDisagreement`. Required failures and topology/coordinate
conflicts reject the read; optional failures remain explicit in results.

Public types: `LendingReadErrorCode`, `LendingAmount`, `LendingMarketState`,
`LendingAbiValue`, `LendingCall`, `LendingCodec`, `LendingPosition`, `LendingPrice`,
`LendingReader`, `LendingReaderConfig`, `LendingReadValue`, `LendingSnapshot`,
`LendingTransport`. See [exports](src/index.ts) and [definitions](src/types.ts).

## Writer

`createLendingRpcReader({ networkId, registry, transport })` configures the
reader with Core's `RpcTransport` and the EVM codec. `createLendingRpcConfig`
returns those same typed reader ports for composition by the Vault package.
`createLendingTargetResolver({ reader, account, maxPriceAgeSeconds })` resolves
the `loan-token` and `collateral-token` approval roles through the verified
market. Inject it into Core's execution client as `resolveTarget`.

`forecastLending(snapshot, action, bounds)` is pure and returns
`LendingForecast`: actual preview `assets`, `shares`, post-operation
`collateral`, `supplyShares`, `borrowShares`, accrued `debt`, `requiresApproval`
and `assetKind`. Debt is `null` for collateral supply, which does not accrue the
market. Required unavailable state rejects. The forecast includes fee shares
when the account is the fee recipient; `LendingSnapshot.feeRecipient` is now
populated by the reader and optional only for older stored snapshots.

`createLendingWriter({ reader, registry, transport, execution })` returns
`LendingWriter`. This private candidate requires qualified review before release.

| Method      | Input → result                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `prepare`   | `{ operationId, account, action, bounds }` → `PreparedLending`.                                                       |
| `simulate`  | Owned preparation → Core `SimulatedTransaction`; required approval must already be sufficient.                        |
| `submit`    | Preparation and its simulation → Core `SubmissionRecord`, after fresh amount, liquidity, health and allowance checks. |
| `reconcile` | Preparation and durable record → `{ state, record, receipt, outcome: LendingOutcome }`.                               |

`LendingAction` and `LendingQuantity` select exactly one positive quantity:

| Action                | Input                                  | Conversion / approval                                                                                           |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `supply`              | `quantity: { assets }` or `{ shares }` | Assets→shares down; shares→assets up. Approve mUSDC.                                                            |
| `withdraw`            | Same                                   | Assets→shares up; shares→assets down. No approval.                                                              |
| `borrow`              | Same                                   | Assets→shares up; shares→assets down. No approval.                                                              |
| `repay`               | Same                                   | Assets→shares down; shares→assets up. Approve mUSDC. Use exact current borrow shares to repay all accrued debt. |
| `supply-collateral`   | `assets`                               | Native BTC ERC-20 representation, 18 decimals; approve that token to Morpho. Transaction native value is zero.  |
| `withdraw-collateral` | `assets`                               | BTC base units; health required while debt remains. No approval.                                                |

Loan amounts are mUSDC base units (6 decimals); supply and borrow shares are
distinct raw integers, not 6-decimal token amounts. The writer uses self as
owner/on-behalf-of/receiver and empty callback data. Liquidation, delegated
authorization, arbitrary receivers and callbacks are outside this API.

`LendingBounds` requires bigint `maxBlockAge`, `maxPriceAgeSeconds`, `minAssets`,
`maxAssets`, `minShares`, `maxShares`, and `minBorrowHeadroom`. Ages must be
positive. Asset bounds use the action's asset units; collateral actions have
zero shares and therefore need `minShares: 0n`. Headroom is mUSDC base units.
Share-denominated supply/repay approvals use the explicit `maxAssets` budget
to cover accrual; assets-denominated payments use their exact assets. The
current forecast and allowance are checked again before signing. Morpho has
no slippage/deadline arguments in these calls: client bounds cannot prevent
state changes between simulation and inclusion.

```ts
import {
  createLendingRpcReader,
  createLendingTargetResolver,
  createLendingWriter,
} from "@mezo-dev-kit/musdc-lending";
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
const reader = createLendingRpcReader({ networkId: network.id, registry, transport });
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request }),
  store,
  maxBlockAge: 5n,
  confirmations: 2n,
  resolveTarget: createLendingTargetResolver({ reader, account, maxPriceAgeSeconds: 60n }),
});
const writer = createLendingWriter({ reader, registry, transport, execution });
const prepared = await writer.prepare({
  operationId: "unique-supply",
  account,
  action: { kind: "supply", quantity: { assets: 100n * 10n ** 6n } },
  bounds: {
    maxBlockAge: 5n,
    maxPriceAgeSeconds: 60n,
    minAssets: 100n * 10n ** 6n,
    maxAssets: 100n * 10n ** 6n,
    minShares: 1n,
    maxShares: 10n ** 24n,
    minBorrowHeadroom: 0n,
  },
});
// If required, execute prepared.approval with the Token SDK, confirm and reprepare.
if (prepared.approval.kind === "sufficient") {
  const record = await writer.submit(prepared, await writer.simulate(prepared));
  console.log(await execution.observe(record));
  // Persist; observe confirmation; then writer.reconcile(prepared, record).
}
```

`PreparedLending` has `snapshot`, `action`, `bounds`, `forecast`, token snapshot
`token`, `approval`, and exact `transaction`. `LendingOutcome` reports action
`kind`, actual `assets`, `shares`, `boundsSatisfied`, and receipt-block
`snapshot`. Reconciliation checks canonical library events, market ID,
caller/owner/receiver, asset transfers, fee-minted shares and position changes.
Other position activity in the receipt block can cause a mismatch.

Use [Tokens](../../tokens/REFERENCE.md) for separate approvals and
[Core](../../core/REFERENCE.md) for confirmation, uncertainty and reorg recovery.
Do not repeat a whole sequence after a lost submission response. New simulations
require this writer's preparation; restored exact context can be reconciled
with the durable record. The [local fork integration](test/fork.ts) covers
supply, withdrawal, collateral, borrow, partial repayment and full repayment by
shares. Its native BTC/oracle fixtures do not verify mezod native execution.
Node is tested; browser bundling remains unverified.

`LendingWriteError` exposes `code: LendingWriteErrorCode`: `InvalidInput`,
`UnavailableState`, `InsufficientBalance`, `InsufficientLiquidity`,
`UnhealthyPosition`, `BoundsExceeded`, `ApprovalRequired`, `StaleState`,
`ReconciliationMismatch`. Errors from EVM, Tokens, Contracts and Core may
propagate. Public writer types: `LendingQuantity`, `LendingAction`,
`LendingBounds`, `LendingForecast`, `LendingWriteErrorCode`, `PreparedLending`,
`LendingOutcome`, `LendingWriter`.
