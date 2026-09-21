# Pools SDK reference

Use `@mezo-dev-kit/pools` to read pool reserves and positions, calculate liquidity and fees, and
prepare basic-pool or concentrated-liquidity position operations.

A **basic pool** represents liquidity with fungible LP tokens. A **concentrated-liquidity (CL)
position** represents liquidity within a selected price range and has an NFT ID. A **tick** is a
discrete price boundary; **tick spacing** determines usable boundaries. Token order is always the
sorted `token0`/`token1` order returned by the key helper.

| Task                                      | API family                                                           |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Inspect a basic pool or wallet LP balance | `sortBasicPoolKey`, `createBasicPoolReader`                          |
| Add or remove basic liquidity             | `forecastBasicLiquidity`, `createBasicLiquidityWriter`               |
| Collect wallet LP fees                    | `calculateBasicPoolFees`, `createBasicPoolFeeWriter`                 |
| Inspect CL NFTs or change a position      | `createCLPoolReader`, `forecastCLPosition`, `createCLPositionWriter` |
| Model one CL swap step                    | `calculateCLSwapStep`; use Swaps for a complete route quote          |

Amounts are bigint token base units. LP quantities and NFT liquidity have their own accounting
units. `sqrtPriceX96` stores a square-root price in Q64.96 fixed point; `X128` fields represent
fixed-point fee growth. The calculation sections specify rounding and bounds.

See [package scope](README.md) and [Pools knowledge](../../../knowledge/protocols/pools/README.md).
Pool creation is outside this API. [Incentives](../incentives/REFERENCE.md) owns gauge custody and
streamed rewards.

On this page:

- [Pool identity and reads](#pool-identity-and-reads)
- [Liquidity forecast](#liquidity-forecast)
- [Writer lifecycle](#writer-lifecycle)
- [Errors and types](#errors-and-types)
- [Wallet LP fees](#wallet-lp-fees)
- [Concentrated-liquidity calculations](#concentrated-liquidity-calculations)
- [CL pool and position reads](#cl-pool-and-position-reads)
- [CL position operations](#cl-position-operations)
- [CL swap calculations](#cl-swap-calculations)

## Pool identity and reads

### `sortBasicPoolKey` — establish token order

Sort the token addresses once and keep all paired amounts in that same order.

`sortBasicPoolKey({tokenA, tokenB, stable}): BasicPoolKey` validates nonzero, distinct token
addresses and an explicit boolean. It returns frozen lowercase `token0`, `token1` in ascending
address order, preserving `stable`. Every amount field below follows that sorted order; do not
reorder addresses independently of associated amounts. Stable and volatile pools are distinct keys.

### `createBasicPoolReader` — configure pool reads

Read an explicitly selected pool and the account’s wallet holdings.

`createBasicPoolReader(config: BasicPoolReaderConfig): BasicPoolReader` requires
`networkId: 'mezo-mainnet'`, a Contracts `registry` and Core `RpcTransport`. The returned method
`read(input: BasicPoolReadInput): Promise<BasicPoolSnapshot>` requires sorted `key` and `account`,
plus optional bigint `blockNumber`. Otherwise one head is selected. The reader verifies both roots
and getter-discovered runtime dependencies, standard clone implementation, factory membership,
Router prediction, pool factory/tokens/stable mode, and final block hash/chain. Missing pools or
required calls throw; zero reserves/supply remain readable values.

### Basic snapshot fields

Reserves, actual pool balances and wallet LP holdings are separate observations.

`BasicPoolSnapshot` groups the pool state and the account’s holdings:

| Fields                                                           | Meaning                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `coordinate`, `timestamp`, `providerId`, `key`, `account`        | Block identity, bigint Unix seconds, provider, sorted pool key and account.               |
| `router`, `factory`, `factoryRegistry`, `implementation`, `pool` | Verified pool and dependency addresses.                                                   |
| `paused`, `feeBps`                                               | Factory pause state and current fee in basis points.                                      |
| `reserve0`, `reserve1`, `reserveTimestamp`                       | Recorded reserves and their update time.                                                  |
| `poolBalance0`, `poolBalance1`                                   | Actual token custody, kept separate from recorded reserves.                               |
| `totalSupply`, `poolLpBalance`                                   | LP supply and LP tokens held by the pool itself.                                          |
| `token0`, `token1`, `lp`                                         | Token snapshots with account balances, precision, allowances and Router approval targets. |

Reserves and balances use their token’s base units. LP quantities use the LP token’s precision;
token0 and token1 can have different precision.

### Writer token compatibility

A readable pool can still be outside the private writer’s accepted token profile.

`writeCompatible` requires both tokens to belong to the private MUSD, mUSDC, mUSDT profile. For each
token present, the reader verifies its runtime and precision; each mapped ERC-20 uses its own
proxy/implementation hashes and slot. The mUSDT profile references its indexed Contracts source,
current Native mapping and six-decimal evidence; it does not authorize Native Bridge writes. Other
factory-created tokens are not assumed to have ordinary transfer behavior. Discovery alone does not
qualify an asset for a writer. Pool gauge positions and streamed rewards are separate beneficial
ownership, outside these wallet LP reads.

Read a basic stable pool with an application-supplied transport, account and token pair:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createBasicPoolReader, sortBasicPoolKey } from "@mezo-dev-kit/pools";

declare const transport: RpcTransport;
declare const account: `0x${string}`;
declare const musd: `0x${string}`;
declare const musdc: `0x${string}`;

const key = sortBasicPoolKey({ tokenA: musd, tokenB: musdc, stable: true });

const reader = createBasicPoolReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});

const state = await reader.read({ key, account });

console.log(state.coordinate, state.key, state.reserve0, state.reserve1, state.lp.balance);
```

The reserves follow `state.key.token0` and `token1`, regardless of input address order.
`state.lp.balance` is the account’s wallet LP balance.

### `createBasicPoolTargetResolver` — approval destinations

Bind token approvals to the verified selected pool.

`createBasicPoolTargetResolver({reader, key, account}): ExecutionTargetResolver` binds Core approval
targets to this selected pool. It accepts only anchor `mezo-earn.pool-factory` and roles
`basic-token-0`, `basic-token-1`, `basic-lp`, then rereads discovery at the requested coordinate and
returns the verified address. Include it in Core's `resolveTarget` when approving these snapshots. A
role string alone never authorizes another token or pool.

## Liquidity forecast

### `forecastBasicLiquidity` — preview add or remove

Calculate selected token amounts and LP changes using an existing snapshot.

`forecastBasicLiquidity(snapshot, action, bounds): BasicLiquidityForecast` is pure integer
arithmetic for existing initialized pools with verified writer assets. It requires both reserves and
supply positive, live token balances equal to reserves, and no LP tokens waiting in pool custody.
Donations/pending burns change mint/burn behavior and therefore fail instead of being silently
included.

`BasicLiquidityAction` is either `{kind: 'add', amount0Desired, amount1Desired}` or
`{kind: 'remove', liquidity}`. Amounts are bigint base units. Add selects the limiting desired asset
using the Router's exact floor sequence and mints the smaller reserve-relative share quantity.
Remove burns exact wallet LP shares and floors each asset output. Products are checked for uint256
overflow before division.

### Minimums, deadline and age

Some bounds are encoded in the Router call; the table identifies the simulation-only LP minimum.

`BasicLiquidityBounds` requires:

| Field                      | Meaning                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `minAmount0`, `minAmount1` | Positive bigint token minimums, encoded on-chain.                                                             |
| `minLiquidity`             | Positive minimum LP output for add; must be zero for remove. Checked in forecasts and both exact simulations. |
| `deadline`                 | Bigint Unix second encoded on-chain; preparation requires it strictly after the observed block.               |
| `maxDeadlineSeconds`       | Positive caller-owned maximum distance from the current block timestamp.                                      |
| `maxBlockAge`              | Nonnegative bigint maximum preparation age before submission.                                                 |

The forecast returns `kind`, actual selected `amount0`/`amount1`, `liquidity`, and `nextReserve0`,
`nextReserve1`, `nextTotalSupply`. It requires wallet balances cover both desired maxima for add,
since the reserve ratio can change the split. For remove, the requested shares must be positive,
owned and below total supply. Token minimums must remain satisfied. A factory swap pause does not
itself prohibit the source contract's ordinary mint/burn paths.

## Writer lifecycle

### `createBasicLiquidityWriter` — configure basic liquidity transactions

Use one writer instance for preparation and simulation, then retain the submission identity for
tracking.

`createBasicLiquidityWriter({reader, execution}): BasicLiquidityWriter` has:

### `prepare`

Fresh verified snapshot, forecast, explicit approvals and exact zero-value Router call. Direct self
recipient only. Returns `PreparedBasicLiquidity`.

**Call:** `prepare({operationId, key, account, action, bounds})`

### `simulate`

Requires preparations owned by this writer and sufficient confirmed allowance. Core decodes/rechecks
the token and LP output bounds in both initial and final simulations. Returns
`SimulatedTransaction`.

**Call:** `simulate(prepared)`

### `submit`

Checks the matching owned simulation, rereads identities, state, wallet budgets, allowances,
deadline and block age, then delegates exact submission to Core. Returns `SubmissionRecord`.

**Call:** `submit(prepared, simulated)`

### `reconcile`

Verifies durable intent, confirmations, Mint/Burn and LP/token transfers, receipt-block
account/reserve/supply changes. Returns Core's reconciled record/receipt plus
`BasicLiquidityOutcome`.

**Call:** `reconcile(prepared, record)`

### Prepared approvals

Each token has its own required amount and approval plan.

`PreparedBasicLiquidity` contains `snapshot`, cloned/frozen `action`, `bounds`, `forecast`,
`transaction`, and `approvals`. Each approval entry contains its `token: TokenSnapshot`,
`requiredAmount`, and Tokens `ApprovalPlan`. Desired maxima are approved for add; exact LP input for
remove. Some allowance can remain when actual deposit amounts are smaller than desired. No unlimited
approval or automatic revocation is performed.

Configure a liquidity writer and a separate token-approval writer. Supply a transport, signer,
account and sorted pool key:

```ts
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createExecutionClient, createMemorySubmissionStore } from "@mezo-dev-kit/core";
import type { ExecutionSigner, RpcTransport } from "@mezo-dev-kit/core";
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import {
  createBasicPoolReader,
  createBasicPoolTargetResolver,
  createBasicLiquidityWriter,
} from "@mezo-dev-kit/pools";
import type { BasicPoolKey } from "@mezo-dev-kit/pools";

declare const transport: RpcTransport;
declare const signer: ExecutionSigner;
declare const account: `0x${string}`;
declare const key: BasicPoolKey;

const registry = createContractRegistry();

const reader = createBasicPoolReader({ networkId: "mezo-mainnet", registry, transport });

const execution = createExecutionClient({
  network: getNetwork("mezo-mainnet"),
  registry,
  transport,
  signer,
  store: createMemorySubmissionStore(),
  maxBlockAge: 2n,
  confirmations: 2n,
  resolveTarget: createBasicPoolTargetResolver({ reader, key, account }),
});

const writer = createBasicLiquidityWriter({ reader, execution });

const approvals = createApprovalWriter({
  reader: createTokenReader({ transport }),
  transport,
  execution,
});

console.log(writer, approvals); // Connect these to the application's consent and tracking flow.
```

This excerpt constructs the clients; it does not submit a liquidity operation. The memory store is
suitable only for a process-local example. Use durable atomic storage for application recovery.

Use the [executable fork loop](test/fork.ts) for complete add, partial remove and final remove with
separate approval confirmations. In an application, create a stable unique operation ID, prepare,
confirm each required exact/reset approval, and prepare again. After consent, simulate and submit
the matching preparation. Observe with Core until confirmed, then reconcile. Production storage must
atomically reserve operations/nonces and attach hashes; the memory store above is only a
process-local example. Preserve JSON-safe Core records and the domain preparation/bounds for
recovery. Uncertain submission is tracked by identity; it does not authorize rebuilding another
value-bearing action.

### Reconciled liquidity outcome

Use actual token amounts and minted or burned LP shares when reporting the operation.

`BasicLiquidityOutcome` returns `kind`, actual token `amount0`/`amount1`, actual minted/burned
`liquidity`, and the receipt-block `snapshot`. Reconciliation reads the preceding block as baseline
rather than the old quote block. Other activity in the same receipt block can prevent exact
account/reserve/supply attribution and produces a mismatch for investigation. A successful receipt
alone is not an accepted outcome. Minimum LP output is a simulation bound; a later inclusion state
can change it because the Router has no on-chain LP-minimum argument.

## Errors and types

`PoolError` exposes `code: PoolErrorCode`: `InvalidInput`, `IdentityMismatch`, `UnavailablePool`,
`UnsafeState`, `BoundExceeded`, or `ReconciliationMismatch`. Required RPC, EVM representation,
Contracts and Core execution errors can also propagate. Rebuild stale preparations after fresh
reads/confirmed approvals; resolve identity failures and reconciliation mismatches before another
action.

Exported types: `BasicPoolKey`, `BasicPoolReaderConfig`, `BasicPoolReadInput`, `BasicPoolSnapshot`,
`BasicPoolReader`, `BasicLiquidityAction`, `BasicLiquidityBounds`, `BasicLiquidityForecast`,
`PreparedBasicLiquidity`, `BasicLiquidityOutcome`, `BasicLiquidityWriter`, and `PoolErrorCode`.

## Wallet LP fees

### `calculateBasicPoolFees` — wallet fee accounting

Calculate pending amounts for both tokens from a wallet LP balance and fee indexes.

`calculateBasicPoolFees(input: BasicPoolFeeInput): BasicPoolFees` is pure checked integer
arithmetic. Input fields are bigint LP `balance`, global `index0`/`index1`, user
`supplyIndex0`/`supplyIndex1` and stored `claimable0`/`claimable1`. Each result
`pending0`/`pending1` adds stored credit to the independently floored share of the index delta, with
canonical index precision. A zero LP balance preserves stored credit without index subtraction.
Nonzero balance rejects a regressed index; products and totals must fit uint256. The result also
retains the input fields. Pool snapshots expose this as `fees`, plus the discovered `poolFees`
custody address. Gauge-owned LP fees remain outside wallet accounting.

### `calculateBasicSwapFee` — gross-input fee

Calculate the input-token fee separately from the swap’s output estimate.

`calculateBasicSwapFee({amountIn, feeBps}): bigint` returns the floored gross-input fee in
input-token base units. Both inputs and their product must fit uint256; fee must be below the
canonical basis-point denominator. This is fee accounting, not a swap output quote.

### `createBasicPoolFeeWriter` — collect wallet fees

A fee claim can remain available after the wallet has withdrawn all LP tokens.

`createBasicPoolFeeWriter({reader, execution}): BasicPoolFeeWriter` supplies the same `prepare`,
`simulate`, `submit`, `reconcile` lifecycle as liquidity, with no approval required.
`prepare({operationId, key, account, bounds})` returns `PreparedBasicPoolFeeClaim` containing the
verified `snapshot`, cloned/frozen `bounds` and Core `transaction`. `BasicPoolFeeBounds` has
nonnegative bigint `minAmount0`, `minAmount1` and `maxBlockAge`; at least one actual pending amount
must be positive. The call targets the verified pool using anchor `mezo-earn.pool-factory` and role
`basic-lp`. Configure the pool target resolver.

Simulation verifies both returned amounts, including immediately before wallet submission. These
minimums are client preflight bounds because `claimFees()` has no amount or deadline arguments.
Submission rechecks current fees, generation and age. Reconciliation verifies one self-recipient
Claim event, each nonzero token payment from PoolFees, wallet balance changes and zero remaining
pending fees, with unchanged reserves, supply and LP balance. It returns Core's reconciled
record/receipt plus `BasicPoolFeeOutcome` (`amount0`, `amount1`, receipt-block `snapshot`). Stored
claims can be collected after fully withdrawing LP tokens. The same-block attribution limitation of
liquidity reconciliation also applies.

Prepare a wallet LP fee claim using an existing reader, execution client, key and unique operation
ID:

```ts
import { createBasicPoolFeeWriter } from "@mezo-dev-kit/pools";
import type { BasicPoolReader, BasicPoolKey } from "@mezo-dev-kit/pools";
import type { ExecutionClient } from "@mezo-dev-kit/core";

declare const reader: BasicPoolReader;
declare const execution: ExecutionClient;
declare const key: BasicPoolKey;
declare const account: `0x${string}`;
declare const operationId: string;

const writer = createBasicPoolFeeWriter({ reader, execution });

const state = await reader.read({ key, account });

const prepared = await writer.prepare({
  operationId,
  key,
  account,
  bounds: {
    minAmount0: state.fees.pending0,
    minAmount1: state.fees.pending1,
    maxBlockAge: 2n,
  },
});

console.log(prepared.transaction); // Obtain application consent, then simulate/submit/track/reconcile.
```

The preparation uses each token’s current pending amount as its minimum. Inspect the exact
transaction, obtain consent, then simulate, submit, confirm and reconcile.

The [combined pool/swap fork example](../../swaps/test/fork.ts) earns fees in both assets, exits the
LP position and collects the retained claim.

## Concentrated-liquidity calculations

### `getCLTickSqrtRatio`, `getCLTickAtSqrtRatio`, `getCLUsableTicks`

Convert between ticks and encoded square-root prices, or choose the outer aligned ticks for a
spacing.

`getCLTickSqrtRatio(tick: number): bigint` reproduces the retained TickMath algorithm with generated
coefficients. Integer ticks range from -887272 to 887272.
`getCLTickAtSqrtRatio(sqrtPriceX96: bigint): number` returns the greatest tick whose exact ratio is
no greater than the input; its ratio interval includes the minimum and excludes the maximum.
`getCLUsableTicks(tickSpacing: number)` returns aligned `tickLower`/`tickUpper`. Readable tick
bounds and write alignment are distinct; spacing must be a positive integer.

### `calculateCLAmounts` — value liquidity in a range

Choose rounding for the operation: minting costs round up; principal estimates and removals round
down.

`CLPriceRange` contains bigint `sqrtPriceX96`, `sqrtLowerX96`, `sqrtUpperX96`. Prices use Q64.96,
lower/upper must be strictly ordered, and current price must be initialized.
`calculateCLAmounts(range & {liquidity, rounding}): CLAmounts` requires uint128 `liquidity` and
explicit `rounding: "down" | "up"`. Principal estimates/removal amounts floor; core mint amounts
ceil. `CLAmounts` has bigint `amount0`, `amount1` in sorted token base units. At/below the lower
boundary all principal is token0; at/above the upper boundary it is token1.

### `calculateCLLiquidity` — derive position liquidity

Calculate the liquidity supported by desired token amounts within a range.

`calculateCLLiquidity(range & CLAmounts): bigint` returns the position manager's floor-rounded
uint128 liquidity. Each single-token branch must fit uint128 before choosing the minimum inside the
range. Zero amounts/liquidity are valid math inputs, not a permission to submit an empty operation.

### `calculateCLFees` — account for accrued position fees

Calculate one token’s fee accounting, retaining overflow information and the difference between
accounting caps and actual payment.

`calculateCLFees(input: CLFeeInput): CLFees` handles one asset. Input fields are `liquidity`,
`globalX128`, `lowerOutsideX128`, `upperOutsideX128`, `lastInsideX128`, `tokensOwed`, numeric
`tick`, `tickLower`, `tickUpper`, and boolean `staked`. It returns `insideX128`, newly `accrued`,
resulting `tokensOwed` and `overflowed`. Growth differences wrap at uint256 as deployed; stored owed
amounts truncate at uint128. A writer must reject `overflowed`, even though the read faithfully
reports the deployed arithmetic. Staked NFTs accrue no ordinary position-manager swap fees through
this calculation; gauge emissions are separate. Calculated owed values are accounting estimates: the
manager's Collect event can exceed actual transfer by core rounding, so execution must reconcile the
actual payout independently.

Calculate liquidity and mint-side token requirements for a synthetic range without RPC:

```ts
import { getCLTickSqrtRatio, calculateCLLiquidity, calculateCLAmounts } from "@mezo-dev-kit/pools";

const range = {
  sqrtPriceX96: getCLTickSqrtRatio(0),
  sqrtLowerX96: getCLTickSqrtRatio(-60),
  sqrtUpperX96: getCLTickSqrtRatio(60),
};

const liquidity = calculateCLLiquidity({ ...range, amount0: 10000n, amount1: 10000n });

console.log(calculateCLAmounts({ ...range, liquidity, rounding: "up" }));
```

The returned `amount0` and `amount1` are sorted token base units. Rounding up models the required
mint amounts; it does not establish that an actual pool has the specified state.

## CL pool and position reads

### `sortCLPoolKey` — select token order and tick spacing

A CL key identifies a token pair and spacing.

`sortCLPoolKey({tokenA, tokenB, tickSpacing}): CLPoolKey` sorts distinct nonzero addresses into
`token0`/`token1` and preserves numeric `tickSpacing`.

### `createCLPoolReader` — read a pool and selected NFTs

Supply explicit NFT IDs and any extra tick boundaries you need; the reader does not enumerate the
whole pool.

`createCLPoolReader(config: CLPoolReaderConfig): CLPoolReader` requires mainnet `networkId`,
Contracts `registry` and Core `transport`. Its `read(CLPoolReadInput)` accepts sorted `key`,
`account`, optional `blockNumber`, up to 16 unique positive `tokenIds`, and up to 32 unique
additional `ticks`. NFT boundaries are added automatically, for at most 64 tick reads. No collection
is silently truncated. The explicit NFTs must belong to the selected pool.

### CL pool snapshot

Active pool liquidity, active staked liquidity and individual NFT liquidity are separate quantities.

`CLPoolSnapshot` keeps pool-wide state separate from selected NFT positions:

| Fields                                                                               | Meaning                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `coordinate`, `timestamp`, `providerId`, `account`, `key`                            | Block/time, provider, account and sorted CL pool identity.                   |
| `factory`, `implementation`, `manager`, `factoryRegistry`, `factoryApproved`, `pool` | Resolved dependencies and factory approval.                                  |
| `gauge`                                                                              | Nullable `CLGaugeSnapshot` with the verified gauge and account stake count.  |
| `liquidity`, `stakedLiquidity`, `maxLiquidityPerTick`                                | Active pool liquidity, active staked liquidity and per-tick capacity.        |
| `sqrtPriceX96`, `tick`, `unlocked`                                                   | Encoded square-root price, numeric tick and pool lock state.                 |
| `fee`, `unstakedFee`, `globalFee0X128`, `globalFee1X128`                             | Current fees and fixed-point global fee growth.                              |
| `token0`, `token1`, `poolBalance0`, `poolBalance1`                                   | Wallet token snapshots with manager allowance, and actual pool custody.      |
| `nativeBalance`, `managerNativeBalance`                                              | Native BTC held by the account and manager.                                  |
| `ownedCount`, `nftSupply`, `ticks`, `positions`                                      | Manager NFT counts, requested boundaries and positions.                      |
| `writeCompatible`                                                                    | Whether the verified tokens fit the private MUSD/mUSDC/mUSDT writer profile. |

Token values retain their own decimals. CL fee integers use the deployed 1,000,000 scale. These
state fields are not a swap quote, APR or price feed.

### Ticks and gauge metadata

These records retain the boundary and gauge state needed by calculations and verification.

`CLTick` contains numeric `tick`, `liquidityGross`, signed `liquidityNet` and `stakedLiquidityNet`,
`feeGrowthOutside0X128`, `feeGrowthOutside1X128`, and `initialized`. `CLGaugeSnapshot` contains
`address`, `factory`, `implementation`, `voter`, `rewardToken`, `alive`, and the supplied account's
`stakeCount`.

### NFT ownership and fee results

Gauge custody alone cannot identify the beneficial depositor; the reader checks account membership.

Each `CLPosition` describes one requested NFT:

| Fields                                                             | Meaning                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `tokenId`, `owner`, `approved`, `callerApproved`                   | NFT identity, ERC-721 custody and caller permissions.              |
| `staked`, `beneficialDepositor`                                    | Gauge custody and nullable verified depositor.                     |
| `tickLower`, `tickUpper`, `liquidity`                              | Position range and liquidity.                                      |
| `lastInside0X128`, `lastInside1X128`, `tokensOwed0`, `tokensOwed1` | Stored fee checkpoints and owed accounting amounts.                |
| `fees0`, `fees1`, `principal`                                      | `CLFees` for each asset and floor-valued principal as `CLAmounts`. |
| `gaugeReward`                                                      | Nullable earned reward for a proven account stake.                 |

For a staked NFT, the account must belong to the gauge’s stake set before the reader reports it as
depositor or reads its earned reward. Otherwise the two fields stay null. Gauge ownership of an NFT
alone does not identify its depositor.

The reader verifies registered runtime generations, exact clone implementations, factory membership,
pool key and reverse gauge/voter mappings, and the final chain/hash. Empty initialized pools and
dead/missing gauges remain readable. It permits the deployed left-of-boundary tick when a swap ends
exactly at the next tick's ratio. Missing required state, wrong identity or a changed anchor throws;
partial state never becomes an executable snapshot. A missing factory pool throws `PoolError` with
`UnavailablePool`.

Read one selected CL position. Supply the transport, account and tokens; replace the illustrative
spacing and NFT ID with the position being inspected:

```ts
import { createCLPoolReader, sortCLPoolKey } from "@mezo-dev-kit/pools";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";

declare const transport: RpcTransport;
declare const account: `0x${string}`;
declare const tokenA: `0x${string}`;
declare const tokenB: `0x${string}`;

const reader = createCLPoolReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});

const state = await reader.read({
  account,
  key: sortCLPoolKey({ tokenA, tokenB, tickSpacing: 200 }),
  tokenIds: [1n],
});

console.log(state.positions[0]?.beneficialDepositor);
```

`beneficialDepositor` is populated only when the account’s gauge membership establishes that
ownership. A null value must not be replaced with the gauge’s address as the owner.

## CL position operations

### `forecastCLPosition` — preview an NFT operation

Choose the operation by `kind` and provide the corresponding quantities below.

`forecastCLPosition({snapshot, action, bounds}): CLPositionForecast` calculates one ordinary
self-owned, unstaked position operation. `CLPositionAction` is:

| `kind`     | Additional fields (amounts and NFT IDs are bigint)                   |
| ---------- | -------------------------------------------------------------------- |
| `mint`     | Numeric `tickLower`, `tickUpper`, `amount0Desired`, `amount1Desired` |
| `increase` | `tokenId`, `amount0Desired`, `amount1Desired`                        |
| `decrease` | `tokenId`, `liquidity`                                               |
| `collect`  | `tokenId`, uint128 `amount0Max`, `amount1Max`                        |
| `burn`     | `tokenId`                                                            |

Mint uses an existing initialized pool and encodes the manager's zero price sentinel. Increase/mint
require an approved factory, zero manager native refund custody, funded desired maxima, a positive
signed-int128 liquidity delta and per-tick/total liquidity capacity. Amounts spent round up. Newly
initialized boundaries establish their fee baseline and do not earn historical growth. Decrease
rounds principal down and credits it to the NFT's owed balances; it pays nothing to the wallet.
Collect caps fee/principal accounting independently for both assets. Burn requires zero liquidity
and zero stored owed balances. Overflowed fee accounting is rejected. No pool creation, native
wrapping, third-party recipient, gauge-held NFT mutation or implicit approval is included.

### CL bounds and on-chain guarantees

The applicable amount and deadline arguments depend on the action.

`CLPositionBounds` requires `minAmount0`, `minAmount1`, `minLiquidity`, `sqrtPriceMinX96`,
`sqrtPriceMaxX96`, Unix-second `deadline`, positive `maxDeadlineSeconds`, and nonnegative
`maxBlockAge`. Every field is bigint. Each expected positive amount needs an explicit positive
minimum; an expected zero amount needs zero. Increase/mint require positive minimum liquidity; the
other operations require zero. The observed price must remain within the ordered Q64.96 interval.
Min amounts and deadline are on-chain for mint, increase and decrease. Collection/burn, price and
minimum-liquidity bounds are client checks in initial/final simulation and post-receipt reporting.

### Forecast amounts and fee accounting

Interpret the returned amounts according to the operation: spend, credited principal, or collection
accounting caps.

`CLPositionForecast` contains `kind`, nullable `tokenId` (null before mint), `tickLower`,
`tickUpper`, signed `liquidityDelta`, `liquidityAfter`, `amount0`, `amount1`, `tokensOwedAfter0`,
`tokensOwedAfter1`, and `lastInsideAfter0X128`, `lastInsideAfter1X128`. Amounts represent spend for
mint/increase, principal credit for decrease, and manager accounting caps for collect. The deployed
pool may pay slightly less than the collection caps.

### `createCLPositionWriter` — prepare and execute NFT operations

Approvals, preparation and submission are separate stages.

`createCLPositionWriter({reader, execution, transport}): CLPositionWriter` provides
`prepare({operationId, account, key, action, bounds})`, `simulate(prepared)`,
`submit(prepared, simulated)`, and `reconcile(prepared, record)`. Preparation returns
`PreparedCLPosition` with `snapshot`, frozen `action`/`bounds`, `forecast`, exact zero-value
`transaction`, and explicit `approvals` entries (`token`, `requiredAmount`, `plan`). Desired maxima
need manager allowance for mint/increase; other operations need none. Confirm each Tokens approval
independently and reprepare. Use
`createCLPositionTargetResolver({reader, key, account}): ExecutionTargetResolver` for Core's
approval resolution: it accepts only the CL factory anchor and `cl-token-0`/`cl-token-1` roles and
rereads verified assets at the exact coordinate.

Simulation decodes exact manager output and checks current identity, owner, price, funding,
approvals, minimums, deadline and age. Preparations and simulations must originate from the same
writer. Submission rechecks state and Core reruns the verifier on the final exact call. Durable
reconciliation validates saved calldata/identity before provider work, then uses the receipt
predecessor and receipt block. It verifies NFT events/counts/ownership, manager fee accounting, pool
Mint/Burn/Collect events, tick gross/net liquidity and fee boundaries, active/staked liquidity,
token transfers, wallet/pool custody and native gas.

### Actual CL outcome

Wallet deltas distinguish credited principal from assets actually received.

`ReconciledCLPosition` contains `state: "reconciled"`, Core `record`, `receipt`, and
`outcome: CLPositionOutcome`. The outcome has receipt-block `snapshot`, actual `tokenId`,
`forecast`, `amount0`, `amount1`, signed `walletDelta0`, `walletDelta1`, native-base-unit `gasFee`,
and `boundsSatisfied`. Actual collection payment comes from pool events and token/custody deltas;
manager owed balances decrease by the accounting caps even when payment is lower. Decrease reports
credited principal with zero wallet deltas. Other activity in the receipt block can prevent exact
state attribution and is not silently ignored.

Prepare collection from an existing CL NFT with application-chosen bounds and a configured execution
client:

```ts
import { createCLPositionWriter, createCLPositionTargetResolver } from "@mezo-dev-kit/pools";
import type { CLPoolReader, CLPoolKey, CLPositionBounds } from "@mezo-dev-kit/pools";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";

declare const reader: CLPoolReader;
declare const execution: ExecutionClient;
declare const transport: RpcTransport;
declare const key: CLPoolKey;
declare const account: `0x${string}`;
declare const tokenId: bigint;
declare const bounds: CLPositionBounds;

const resolveTarget = createCLPositionTargetResolver({ reader, key, account });

const writer = createCLPositionWriter({ reader, execution, transport });

const prepared = await writer.prepare({
  operationId: "application-owned-unique-id",
  key,
  account,
  bounds,
  action: {
    kind: "collect",
    tokenId,
    amount0Max: (1n << 128n) - 1n,
    amount1Max: (1n << 128n) - 1n,
  },
});

console.log(resolveTarget, prepared.transaction); // Application consent precedes simulation/submission.
```

The maximums are accounting caps. Reconciliation reports actual transferred amounts, which can
differ because of pool rounding. This excerpt prepares the call without submitting it.

The [CL fork lifecycle](test/cl-position-fork-workflows.ts) demonstrates confirmed approvals,
mint/increase, partial/full decrease, positive/zero collect and burn through public entrypoints. It
preserves deployed token/manager/pool code, uses local funding and explicit nonzero gas, and
restores its snapshot.

### Changing a position's range

Compose the existing position operations as independently confirmed steps. A range change is not
atomic. If the NFT is staked, first reconcile Incentives' `unstake`; then reread it through Pools.
Decrease the selected liquidity and collect the credited assets. Decrease alone does not fund the
wallet. Persist each prepared call and Core submission record before advancing the application
checkpoint; an uncertain send must be tracked through its existing record.

Choose the replacement range and desired amounts using fresh pool state and confirmed wallet
balances. Bound the amounts to the application's rebalance budget, including actual collected
amounts rather than manager accounting caps. Confirm any required approval separately, reprepare,
simulate, submit once, and reconcile the replacement mint. Retain its returned NFT ID. Only then
retire an empty old NFT with `burn`; a partially withdrawn NFT must remain. Staking the new NFT is
another separately confirmed Incentives operation.

If preparation or simulation rejects the replacement, the prior withdrawal remains complete and the
collected assets remain in the wallet. Refresh the state and revise only the unsubmitted
replacement. Do not repeat withdrawal or collection from a stale checkpoint, and do not rebuild a
mint whose submission is uncertain. Burn the old NFT only after its current liquidity and owed
balances are zero. The application chooses whether to retry a replacement or retain the withdrawn
assets; MDK does not silently swap the surplus.

The fork lifecycle additionally demonstrates a wider replacement range, an insufficient-funds
rejection after collection, unchanged wallet/nonce/NFT state at that rejection, successful resumed
mint, and retirement of the old NFT. It uses no swap and leaves unused desired amounts in the
wallet. The fork's one-unit minimums and memory submission store are fixture choices; an application
must provide its own slippage limits, consent, durable records and recovery policy.

## CL swap calculations

### `calculateCLSwapStep` — one exact-input price step

This local calculation is a component of a route quote. It does not discover or traverse pools.

`calculateCLSwapStep(input: CLSwapStepInput): CLSwapStep` models one exact-input step between
prices. Input has bigint `sqrtPriceX96`, `sqrtTargetX96`, uint128 `liquidity`, nonnegative
signed-int256 `amountRemaining`, and uint24 `fee` below the generated CL fee scale. It returns next
`sqrtPriceX96`, net `amountIn`, `amountOut` and `feeAmount`. Input plus fee never exceeds the
remaining amount. The target is inclusive of canonical min/max ratios; current price is in the
normal half-open interval. Empty liquidity can advance a step to its target without consuming input;
an executable quote still needs a complete bounded path. The source's token0 overflow fallback and
separate rounding operations are preserved. A partial step charges the remaining rounding residue as
fee, even when the configured fee is zero. This calculation is not a quote or simulation.

### `calculateCLSwapFeeSplit` — assign fee growth

Keep the staked share, gauge fee and unstaked-liquidity growth separate.

`calculateCLSwapFeeSplit({feeAmount, liquidity, stakedLiquidity, unstakedFee}): CLSwapFeeSplit`
requires positive uint128 active liquidity, staked liquidity no greater than total, and a levy no
greater than the generated fee scale. All inputs are bigint. It returns `unstakedFeeAmount`,
`gaugeFeeAmount`, `growthX128`, and `overflowed` for uint128 gauge accounting. The staked share and
levy on the remaining unstaked share each round up separately. Global fee growth uses only unstaked
liquidity; fully staked liquidity assigns the full fee to the gauge. Swaps rejects overflowing gauge
accounting before writing.

### `getCLBitmapLocation` and `findCLBitmapTick` — search one tick word

A bitmap word records initialized tick boundaries. These helpers inspect one supplied word without
RPC.

`getCLBitmapLocation({tick, tickSpacing, zeroForOne}): CLBitmapLocation` returns numeric `word`,
`bit`, `compressed`. Negative ticks floor toward minus infinity; rightward search starts with the
next compressed tick. `findCLBitmapTick` takes the same input plus a uint256 `bitmap` and returns
numeric `tick` and boolean `initialized`. Only that word is searched. An empty word returns its
directional boundary, which the caller must clamp to canonical ticks. The signed-int24 result
preserves the library's arithmetic; accepted factory spacing constrains usable execution inputs.
Current ticks permit the left-of-minimum transition state for this low-level helper. Neither method
performs RPC or enumerates pools.

Model one synthetic CL swap step locally:

```ts
import { calculateCLSwapStep, getCLTickSqrtRatio } from "@mezo-dev-kit/pools";

const step = calculateCLSwapStep({
  sqrtPriceX96: getCLTickSqrtRatio(0),
  sqrtTargetX96: getCLTickSqrtRatio(-60),
  liquidity: 10n ** 18n,
  amountRemaining: 10n ** 15n,
  fee: 3000n,
});

console.log(step.amountIn, step.amountOut, step.feeAmount);
```

`amountIn` is the net input used by this step; `feeAmount` is separate and uses the same input
token. A complete swap quote must also account for all remaining steps and route limits.
