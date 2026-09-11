# Pools SDK reference

Import from `@mezo-dev-kit/pools`. The [README](README.md) owns current support:
mainnet basic/CL pool reads and private MUSD/mUSDC basic liquidity/fee writers. Contracts owns
source/ABI/runtime evidence; [Pools knowledge](../../../knowledge/protocols/pools/README.md)
owns protocol semantics. CL position, pool creation and gauge writers
are not supplied by this package yet.

## Pool identity and reads

`sortBasicPoolKey({tokenA, tokenB, stable}): BasicPoolKey` validates nonzero,
distinct token addresses and an explicit boolean. It returns frozen lowercase
`token0`, `token1` in ascending address order, preserving `stable`. Every amount
field below follows that sorted order; do not reorder addresses independently
of associated amounts. Stable and volatile pools are distinct keys.

`createBasicPoolReader(config: BasicPoolReaderConfig): BasicPoolReader` requires
`networkId: 'mezo-mainnet'`, a Contracts `registry` and Core `RpcTransport`.
The returned method `read(input: BasicPoolReadInput): Promise<BasicPoolSnapshot>`
requires sorted `key` and `account`, plus optional bigint `blockNumber`. Otherwise
one head is selected. The reader verifies both roots and getter-discovered
runtime dependencies, standard clone implementation, factory membership, Router
prediction, pool factory/tokens/stable mode, and final block hash/chain. Missing
pools or required calls throw; zero reserves/supply remain readable values.

`BasicPoolSnapshot` retains coordinate, bigint Unix `timestamp`, `providerId`,
key/account, Router/factory/FactoryRegistry/implementation/pool addresses,
`paused`, bigint `feeBps`, `reserve0`, `reserve1`, `reserveTimestamp`,
`poolBalance0`, `poolBalance1`, `totalSupply`, and `poolLpBalance`. Reserves and
balances use each token's base units; LP quantities use the LP token's precision.
`token0`, `token1` and `lp` are Tokens `TokenSnapshot`s with exact balances,
allowances, precision and role-bound targets. The spender is always the Router.

`writeCompatible` is true only for the initial MUSD/mUSDC pair after verifying
MUSD runtime and mUSDC proxy, implementation slot/code and token precisions.
Other factory-created tokens are not assumed to have ordinary transfer behavior.
Discovery alone does not qualify an asset for a writer. Pool gauge positions and
streamed rewards are separate beneficial ownership, outside these wallet LP reads.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createBasicPoolReader, sortBasicPoolKey } from "@mezo-dev-kit/pools";
declare const transport: RpcTransport;
declare const account: `0x${string}`, musd: `0x${string}`, musdc: `0x${string}`;
const key = sortBasicPoolKey({ tokenA: musd, tokenB: musdc, stable: true });
const reader = createBasicPoolReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});
const state = await reader.read({ key, account });
console.log(state.coordinate, state.key, state.reserve0, state.reserve1, state.lp.balance);
```

`createBasicPoolTargetResolver({reader, key, account}): ExecutionTargetResolver`
binds Core approval targets to this selected pool. It accepts only anchor
`mezo-earn.pool-factory` and roles `basic-token-0`, `basic-token-1`, `basic-lp`,
then rereads discovery at the requested coordinate and returns the verified
address. Include it in Core's `resolveTarget` when approving these snapshots.
A role string alone never authorizes another token or pool.

## Liquidity forecast

`forecastBasicLiquidity(snapshot, action, bounds): BasicLiquidityForecast` is
pure integer arithmetic for existing initialized pools with verified writer
assets. It requires both reserves and supply positive, live token balances equal
to reserves, and no LP tokens waiting in pool custody. Donations/pending burns
change mint/burn behavior and therefore fail instead of being silently included.

`BasicLiquidityAction` is either `{kind: 'add', amount0Desired, amount1Desired}`
or `{kind: 'remove', liquidity}`. Amounts are bigint base units. Add selects the
limiting desired asset using the Router's exact floor sequence and mints the
smaller reserve-relative share quantity. Remove burns exact wallet LP shares and
floors each asset output. Products are checked for uint256 overflow before division.

`BasicLiquidityBounds` requires:

| Field                      | Meaning                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `minAmount0`, `minAmount1` | Positive bigint token minimums, encoded on-chain.                                                             |
| `minLiquidity`             | Positive minimum LP output for add; must be zero for remove. Checked in forecasts and both exact simulations. |
| `deadline`                 | Bigint Unix second encoded on-chain; preparation requires it strictly after the observed block.               |
| `maxDeadlineSeconds`       | Positive caller-owned maximum distance from the current block timestamp.                                      |
| `maxBlockAge`              | Nonnegative bigint maximum preparation age before submission.                                                 |

The forecast returns `kind`, actual selected `amount0`/`amount1`, `liquidity`,
and `nextReserve0`, `nextReserve1`, `nextTotalSupply`. It requires wallet balances
cover both desired maxima for add, since the reserve ratio can change the split.
For remove, the requested shares must be positive, owned and below total supply.
Token minimums must remain satisfied. A factory swap pause does not itself
prohibit the source contract's ordinary mint/burn paths.

## Writer lifecycle

`createBasicLiquidityWriter({reader, execution}): BasicLiquidityWriter` has:

| Method                                                 | Contract                                                                                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare({operationId, key, account, action, bounds})` | Fresh verified snapshot, forecast, explicit approvals and exact zero-value Router call. Direct self recipient only. Returns `PreparedBasicLiquidity`.                                                      |
| `simulate(prepared)`                                   | Requires preparations owned by this writer and sufficient confirmed allowance. Core decodes/rechecks the token and LP output bounds in both initial and final simulations. Returns `SimulatedTransaction`. |
| `submit(prepared, simulated)`                          | Checks the matching owned simulation, rereads identities, state, wallet budgets, allowances, deadline and block age, then delegates exact submission to Core. Returns `SubmissionRecord`.                  |
| `reconcile(prepared, record)`                          | Verifies durable intent, confirmations, Mint/Burn and LP/token transfers, receipt-block account/reserve/supply changes. Returns Core's reconciled record/receipt plus `BasicLiquidityOutcome`.             |

`PreparedBasicLiquidity` contains `snapshot`, cloned/frozen `action`, `bounds`,
`forecast`, `transaction`, and `approvals`. Each approval entry contains its
`token: TokenSnapshot`, `requiredAmount`, and Tokens `ApprovalPlan`. Desired
maxima are approved for add; exact LP input for remove. Some allowance can remain
when actual deposit amounts are smaller than desired. No unlimited approval or
automatic revocation is performed.

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
declare const transport: RpcTransport, signer: ExecutionSigner;
declare const account: `0x${string}`, key: BasicPoolKey;
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

Use the [executable fork loop](test/fork.ts) for complete add, partial remove and
final remove with separate approval confirmations. In an application, create a
stable unique operation ID, prepare, confirm each required exact/reset approval,
and prepare again. After consent, simulate and submit the matching preparation.
Observe with Core until confirmed, then reconcile. Production storage must
atomically reserve operations/nonces and attach hashes; the memory store above
is only a process-local example. Preserve JSON-safe Core records and the domain
preparation/bounds for recovery. Uncertain submission is tracked by identity;
it does not authorize rebuilding another value-bearing action.

`BasicLiquidityOutcome` returns `kind`, actual token `amount0`/`amount1`, actual
minted/burned `liquidity`, and the receipt-block `snapshot`. Reconciliation reads
the preceding block as baseline rather than the old quote block. Other activity
in the same receipt block can prevent exact account/reserve/supply attribution
and produces a mismatch for investigation. A successful receipt alone is not an
accepted outcome. Minimum LP output is a simulation bound; a later inclusion
state can change it because the Router has no on-chain LP-minimum argument.

## Errors and types

`PoolError` exposes `code: PoolErrorCode`: `InvalidInput`, `IdentityMismatch`,
`UnavailablePool`, `UnsafeState`, `BoundExceeded`, or `ReconciliationMismatch`.
Required RPC, EVM representation, Contracts and Core execution errors can also
propagate. Rebuild stale preparations after fresh reads/confirmed approvals;
resolve identity failures and reconciliation mismatches before another action.

Exported types: `BasicPoolKey`, `BasicPoolReaderConfig`, `BasicPoolReadInput`,
`BasicPoolSnapshot`, `BasicPoolReader`, `BasicLiquidityAction`,
`BasicLiquidityBounds`, `BasicLiquidityForecast`, `PreparedBasicLiquidity`,
`BasicLiquidityOutcome`, `BasicLiquidityWriter`, and `PoolErrorCode`.

## Wallet LP fees

`calculateBasicPoolFees(input: BasicPoolFeeInput): BasicPoolFees` is pure checked
integer arithmetic. Input fields are bigint LP `balance`, global `index0`/`index1`,
user `supplyIndex0`/`supplyIndex1` and stored `claimable0`/`claimable1`.
Each result `pending0`/`pending1` adds stored credit to the independently floored
share of the index delta, with canonical index precision. A zero LP balance
preserves stored credit without index subtraction. Nonzero balance rejects a
regressed index; products and totals must fit uint256. The result also retains
the input fields. Pool snapshots expose this as `fees`, plus the discovered
`poolFees` custody address. Gauge-owned LP fees remain outside wallet accounting.

`calculateBasicSwapFee({amountIn, feeBps}): bigint` returns the floored gross-input
fee in input-token base units. Both inputs and their product must fit uint256;
fee must be below the canonical basis-point denominator. This is fee accounting,
not a swap output quote.

`createBasicPoolFeeWriter({reader, execution}): BasicPoolFeeWriter` supplies the
same `prepare`, `simulate`, `submit`, `reconcile` lifecycle as liquidity, with no
approval required. `prepare({operationId, key, account, bounds})` returns
`PreparedBasicPoolFeeClaim` containing the verified `snapshot`, cloned/frozen
`bounds` and Core `transaction`. `BasicPoolFeeBounds` has nonnegative bigint
`minAmount0`, `minAmount1` and `maxBlockAge`; at least one actual pending amount
must be positive. The call targets the verified pool using anchor
`mezo-earn.pool-factory` and role `basic-lp`. Configure the pool target resolver.

Simulation verifies both returned amounts, including immediately before wallet
submission. These minimums are client preflight bounds because `claimFees()` has
no amount or deadline arguments. Submission rechecks current fees, generation and
age. Reconciliation verifies one self-recipient Claim event, each nonzero token
payment from PoolFees, wallet balance changes and zero remaining pending fees,
with unchanged reserves, supply and LP balance. It returns Core's reconciled
record/receipt plus `BasicPoolFeeOutcome` (`amount0`, `amount1`, receipt-block
`snapshot`). Stored claims can be collected after fully withdrawing LP tokens.
The same-block attribution limitation of liquidity reconciliation also applies.

```ts
import { createBasicPoolFeeWriter } from "@mezo-dev-kit/pools";
import type { BasicPoolReader, BasicPoolKey } from "@mezo-dev-kit/pools";
import type { ExecutionClient } from "@mezo-dev-kit/core";
declare const reader: BasicPoolReader, execution: ExecutionClient, key: BasicPoolKey;
declare const account: `0x${string}`, operationId: string;
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

The [combined pool/swap fork example](../../swaps/test/fork.ts) earns fees in
both assets, exits the LP position and collects the retained claim.

## Concentrated-liquidity calculations

`getCLTickSqrtRatio(tick: number): bigint` reproduces the retained TickMath
algorithm with generated coefficients. Integer ticks range from -887272 to 887272. `getCLTickAtSqrtRatio(sqrtPriceX96: bigint): number` returns the greatest
tick whose exact ratio is no greater than the input; its ratio interval includes
the minimum and excludes the maximum. `getCLUsableTicks(tickSpacing: number)`
returns aligned `tickLower`/`tickUpper`. Readable tick bounds and write alignment
are distinct; spacing must be a positive integer.

`CLPriceRange` contains bigint `sqrtPriceX96`, `sqrtLowerX96`, `sqrtUpperX96`.
Prices use Q64.96, lower/upper must be strictly ordered, and current price must
be initialized. `calculateCLAmounts(range & {liquidity, rounding}): CLAmounts`
requires uint128 `liquidity` and explicit `rounding: "down" | "up"`. Principal
estimates/removal amounts floor; core mint amounts ceil. `CLAmounts` has bigint
`amount0`, `amount1` in sorted token base units. At/below the lower boundary all
principal is token0; at/above the upper boundary it is token1.

`calculateCLLiquidity(range & CLAmounts): bigint` returns the position manager's
floor-rounded uint128 liquidity. Each single-token branch must fit uint128
before choosing the minimum inside the range. Zero amounts/liquidity are valid
math inputs, not a permission to submit an empty operation.

`calculateCLFees(input: CLFeeInput): CLFees` handles one asset. Input fields are
`liquidity`, `globalX128`, `lowerOutsideX128`, `upperOutsideX128`,
`lastInsideX128`, `tokensOwed`, numeric `tick`, `tickLower`, `tickUpper`, and
boolean `staked`. It returns `insideX128`, newly `accrued`, resulting `tokensOwed`
and `overflowed`. Growth differences wrap at uint256 as deployed; stored owed
amounts truncate at uint128. A writer must reject `overflowed`, even though the
read faithfully reports the deployed arithmetic. Staked NFTs accrue no ordinary
position-manager swap fees through this calculation; gauge emissions are separate.
Calculated owed values are accounting estimates: the manager's Collect event
can exceed actual transfer by core rounding, so execution must reconcile the
actual payout independently.

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

## CL pool and position reads

`sortCLPoolKey({tokenA, tokenB, tickSpacing}): CLPoolKey` sorts distinct nonzero
addresses into `token0`/`token1` and preserves numeric `tickSpacing`.
`createCLPoolReader(config: CLPoolReaderConfig): CLPoolReader` requires mainnet
`networkId`, Contracts `registry` and Core `transport`. Its `read(CLPoolReadInput)`
accepts sorted `key`, `account`, optional `blockNumber`, up to 16 unique positive
`tokenIds`, and up to 32 unique additional `ticks`. NFT boundaries are added
automatically, for at most 64 tick reads. No collection is silently truncated.
The explicit NFTs must belong to the selected pool.

`CLPoolSnapshot` contains `coordinate`, Unix `timestamp`, `providerId`, `account`,
`key`, resolved `factory`, `implementation`, `manager`, `factoryRegistry`,
`factoryApproved`, dynamic `pool`, and nullable `gauge: CLGaugeSnapshot`.
It separates `liquidity` (active), `stakedLiquidity` (active staked), and each
NFT's liquidity. Other fields are `sqrtPriceX96`, numeric `tick`, `unlocked`,
live `fee`/`unstakedFee`, `globalFee0X128`/`globalFee1X128`, wallet
`token0`/`token1: TokenSnapshot` with manager as spender, `poolBalance0`,
`poolBalance1`, native BTC `nativeBalance`, manager `ownedCount`, `ticks`,
and `positions`. Token values retain their own decimals. Fee integers use the
deployed CL fee scale of 1,000,000; these are not a quote, APR, or safe price feed.

`CLTick` contains numeric `tick`, `liquidityGross`, signed `liquidityNet` and
`stakedLiquidityNet`, `feeGrowthOutside0X128`, `feeGrowthOutside1X128`, and
`initialized`. `CLGaugeSnapshot` contains `address`, `factory`, `implementation`,
`voter`, `rewardToken`, `alive`, and the supplied account's `stakeCount`.

Each `CLPosition` has `tokenId`, ERC-721 `owner`, `approved`, `callerApproved`,
`staked`, nullable `beneficialDepositor`, `tickLower`, `tickUpper`, `liquidity`,
`lastInside0X128`, `lastInside1X128`, stored `tokensOwed0`/`tokensOwed1`,
`fees0`/`fees1: CLFees`, floor-valued `principal: CLAmounts`, and nullable
`gaugeReward`. For staked NFTs, the account's stake-set membership is required
to report that account as depositor and read its earned reward; otherwise both
fields stay null. A gauge owning an NFT does not identify its depositor.

The reader verifies registered runtime generations, exact clone implementations,
factory membership, pool key and reverse gauge/voter mappings, and the final
chain/hash. Empty initialized pools and dead/missing gauges remain readable.
It permits the deployed left-of-boundary tick when a swap ends exactly at the
next tick's ratio. Missing required state, wrong identity or a changed anchor
throws; partial state never becomes an executable snapshot. A missing factory
pool throws `PoolError` with `UnavailablePool`.

```ts
import { createCLPoolReader, sortCLPoolKey } from "@mezo-dev-kit/pools";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
declare const transport: RpcTransport;
declare const account: `0x${string}`, tokenA: `0x${string}`, tokenB: `0x${string}`;
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
