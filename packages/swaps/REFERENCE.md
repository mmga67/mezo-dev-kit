# Swaps SDK reference

Use `@mezo-dev-kit/swaps` to estimate how many tokens a swap may return, compare routes supplied by
your application, and prepare transactions for supported tokens. The package has separate basic-pool
and concentrated-liquidity readers and writers.

A **route** is the sequence of pools a swap passes through. Each step is a **hop**: A → B is one
hop; A → B → C is two. An **exact-input** swap specifies how much of the input token to spend. A
**quote** estimates the resulting output using pool state at one block.

| If you want to…                         | Start with                                                |
| --------------------------------------- | --------------------------------------------------------- |
| Estimate a basic-pool route             | `createBasicSwapReader` and `reader.quote`                |
| Estimate a concentrated-liquidity route | `createCLSwapReader` and an explicit traversal budget     |
| Compare a set of routes                 | `createSwapQuoteReader` from `@mezo-dev-kit/swaps/quotes` |
| Prepare a transaction                   | The basic or CL writer from `@mezo-dev-kit/swaps`         |

Import readers and comparison helpers from `@mezo-dev-kit/swaps/quotes`. The root entrypoint also
exports writers. These amount-specific observations use `sourceClass: "dex-execution-quote"`; they
describe swap estimates rather than protocol oracle prices.

Amounts are bigint base units of the corresponding token. A **coordinate** records network, chain,
block number and block hash. **Writer compatibility** means the route fits the private writer’s
checked token profile; it does not mean a transaction has passed simulation.

See the [swap walkthrough](../../examples/swap-tokens/README.md) for complete setup and
[package scope](README.md) for current mainnet/private limits.
[Pools](../protocols/pools/REFERENCE.md) owns pool discovery and accounting;
[Core](../core/REFERENCE.md#transaction-execution) owns submission and durable records.

On this page:

- [Routes and quotes](#routes-and-quotes)
- [Concentrated-liquidity routes and quotes](#concentrated-liquidity-routes-and-quotes)
- [Bounded read-only candidate comparison](#bounded-read-only-candidate-comparison)
- [Exact-input writer](#exact-input-writer)
- [CL exact-input writer](#cl-exact-input-writer)
- [Separate basic/CL continuation example](#separate-basiccl-continuation-example)

## Routes and quotes

### `validateBasicSwapRoute` — validate the chosen path

Check the shape of a route and the intermediate tokens your application permits. For A → B → C,
include B in `intermediateAssets`; a direct route uses an empty array. This validation does not
discover pools.

`validateBasicSwapRoute(route, intermediateAssets): readonly BasicSwapHop[]` returns frozen
lowercase hops. A `BasicSwapHop` has `tokenIn`, `tokenOut` and an explicit boolean `stable`. Require
one to three hops, nonzero distinct assets, contiguous outputs/inputs and no repeated asset in the
route. Each intermediate must appear in the caller's explicit allowlist (at most 16 entries). Stable
and volatile pools are different paths. There is no automatic route enumeration.

### `createBasicSwapReader` — configure basic-pool quotes

Create the reader once with the registry, transport and pool reader used by your application.

**Call:** `createBasicSwapReader({ networkId, registry, transport, pools }): BasicSwapReader`

| Input       | Required value                   |
| ----------- | -------------------------------- |
| `networkId` | `"mezo-mainnet"`                 |
| `registry`  | Contracts registry               |
| `transport` | Core `RpcTransport`              |
| `pools`     | Verified Pools `BasicPoolReader` |

### `BasicSwapReader.quote` — estimate the output

Estimate a fixed input amount along the supplied basic-pool route. Every pool is read at the same
block.

**Call:** `reader.quote(input: BasicSwapQuoteInput)`

| Input                | Meaning                                                                      |
| -------------------- | ---------------------------------------------------------------------------- |
| `route`              | Required ordered basic-pool hops.                                            |
| `intermediateAssets` | Required list of permitted intermediate tokens; use `[]` for a direct route. |
| `account`            | Required account for token balance and allowance snapshots.                  |
| `amountIn`           | Required positive bigint input-token base units.                             |
| `maxAgeBlocks`       | Required nonnegative bigint age policy checked before submission.            |
| `blockNumber`        | Optional bigint historical block; omission selects one head.                 |

**Validation:** Every pool must have the same block/hash and Router, positive reserves, ordinary
reserve/balance agreement, an unpaused factory and a valid current fee. The source Router's
`getAmountsOut` supplies exact integer hop estimates. Partial/zero responses, missing pools and
chain/hash changes reject the quote.

#### Quote result

Read `estimatedAmountOut` for the estimated output and `outputToken.decimals` for display precision.
`amounts` also preserves the amount after every hop.

`BasicSwapQuote` fields:

| Field                                                  | Meaning                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `sourceClass`, `providerId`, `coordinate`, `timestamp` | DEX provenance and block; timestamp is bigint Unix seconds.                                                  |
| `route`, `intermediateAssets`, `account`, `router`     | Validated caller route policy and destination.                                                               |
| `amountIn`, `amounts`, `estimatedAmountOut`            | Bigint base units. `amounts` has one input plus each hop output; each entry uses that hop asset's precision. |
| `maxAgeBlocks`                                         | Caller maximum preparation age checked before submission.                                                    |
| `inputToken`, `outputToken`                            | Tokens snapshots with asset, precision, balances and Router allowance targets.                               |
| `pools`                                                | Verified pool snapshots in route order.                                                                      |
| `writeCompatible`                                      | Every pool's writer token compatibility passed. Private profile: MUSD, mUSDC, mUSDT.                         |

Estimate a direct stable-pool swap of 10 mUSDC to MUSD. Supply a configured transport, account and
verified token addresses; `declare` statements describe those application inputs:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createBasicPoolReader } from "@mezo-dev-kit/pools";
import { createBasicSwapReader } from "@mezo-dev-kit/swaps/quotes";

declare const transport: RpcTransport;
declare const account: `0x${string}`;
declare const musdc: `0x${string}`;
declare const musd: `0x${string}`;

const registry = createContractRegistry();

const pools = createBasicPoolReader({ networkId: "mezo-mainnet", registry, transport });

const reader = createBasicSwapReader({ networkId: "mezo-mainnet", registry, transport, pools });

const quote = await reader.quote({
  route: [{ tokenIn: musdc, tokenOut: musd, stable: true }],
  intermediateAssets: [],
  account,
  amountIn: 10_000_000n, // 10 mUSDC, which uses six decimal places.
  maxAgeBlocks: 2n,
});

console.log({
  estimatedOutputBaseUnits: quote.estimatedAmountOut,
  outputDecimals: quote.outputToken.decimals,
  blockNumber: quote.coordinate.blockNumber,
});
```

The output is in MUSD base units. Use the returned output precision when formatting it. This call
produces an estimate at the returned block and does not submit a transaction.

### `rankBasicSwapQuotes` — order compatible basic quotes

Use this helper when you already have comparable basic quotes. To request and compare several basic
or CL candidates together, use the combined reader below.

`rankBasicSwapQuotes(quotes)` accepts 1–64 complete writer-compatible quotes for the same account,
input amount, input/output assets and precisions, age policy, network, chain and block/hash. It
verifies route/pool consistency and sorts by decreasing output; equal outputs use deterministic
route ordering. It throws on incompatible or incomplete candidates rather than silently mixing
requests. It neither subtracts gas costs nor asserts that an old coordinate is still fresh. A quote
or ranking never authorizes a transfer; writers reread current state.

## Concentrated-liquidity routes and quotes

### `validateCLSwapRoute` — validate a CL path

Concentrated-liquidity (CL) pools use a tick spacing to identify the pool. A tick is a discrete
price boundary, and spacing determines which boundaries may be used.

`validateCLSwapRoute(route, intermediateAssets)` validates one to three contiguous, acyclic
`CLSwapHop`s (`tokenIn`, `tokenOut`, numeric positive `tickSpacing`) and up to 16 explicit
intermediate-token addresses. It returns frozen normalized hops.

### `encodeCLSwapPath` — encode a validated CL path

`encodeCLSwapPath(route): HexData` packs the first token, then each three-byte signed-int24 spacing
and output token. It validates shape and continuity; candidate selection must also validate the
caller's allowlist. Basic tuples and CL paths are separate formats. No atomic mixed router is
assumed.

### `createCLSwapReader` and `CLSwapReader.quote`

Configure a CL pool reader, then quote an explicit route with limits on how much tick data may be
traversed.

`createCLSwapReader({networkId, registry, transport, pools}): CLSwapReader` requires mainnet,
Contracts registry, Core transport and a verified Pools `CLPoolReader`. Its
`quote(input: CLSwapQuoteInput)` takes `route`, `intermediateAssets`, `account`, positive
signed-int256 `amountIn`, bigint `maxAgeBlocks`, optional `blockNumber`, and an explicit
`budget: CLSwapBudget`:

| Budget field      | Per-hop maximum                                          |
| ----------------- | -------------------------------------------------------- |
| `maxSteps`        | Positive integer, at most 256 price steps.               |
| `maxBitmapWords`  | Positive integer, at most 32 distinct bitmap RPC reads.  |
| `maxCrossedTicks` | Positive integer, at most 32 initialized boundary reads. |

### Traversal behavior and failures

A traversal budget bounds the computation and RPC work needed to consume the input across price
ranges.

The reader checks the router generation/factory, coherent verified pools and final chain/hash. It
uses source-exact integer steps, directional bitmap search, tick liquidity changes and fee splits.
Quotes require initial active liquidity and a fully consumed input. Empty intervening ranges can be
crossed within the budget; an exhausted budget or default price limit rejects partial output. No
allowance, wallet funding, Quoter or transaction simulation is required to calculate a quote.
Unknown token behavior remains outside writer compatibility.

### CL quote results

The quote includes its estimated output and the pool state used to calculate it.

`CLSwapQuote` returns the estimate together with its inputs and evidence:

| Fields                                                 | Meaning                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `sourceClass`, `providerId`, `coordinate`, `timestamp` | `dex-execution-quote`, provider, block identity and Unix seconds.      |
| `account`, `router`, `routerNativeBalance`             | Account, resolved execution destination and its native custody.        |
| `route`, `intermediateAssets`, `path`                  | Normalized hops, allowed intermediate assets and encoded CL path.      |
| `amountIn`, `estimatedAmountOut`, `amounts`            | Input, final estimate and per-hop amounts in each token’s base units.  |
| `pools`                                                | Per-pool snapshots and traversal results.                              |
| `inputToken`, `outputToken`                            | `TokenSnapshot` values, with the router as spender.                    |
| `maxAgeBlocks`, `budget`, `writeCompatible`            | Age policy, frozen work limits and private writer token compatibility. |

The quote age is checked before execution. Explicit historical coordinates remain usable for
inspection and reconciliation. The output is an estimate; state can change before a transaction is
included.

### Per-pool traversal detail

Use these fields for diagnostics and settlement checks when you need more than the overall output
estimate.

Each `CLSwapPoolQuote` records one hop:

| Fields                                                                   | Meaning                                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `snapshot`                                                               | Initial verified pool state.                                          |
| `amountIn`, `amountOut`, `feeAmount`                                     | Hop amounts; the fee uses that hop’s input-token units.               |
| `sqrtPriceX96`, `tick`, `liquidity`, `stakedLiquidity`                   | Resulting encoded square-root price, price tick and active liquidity. |
| `globalFee0X128`, `globalFee1X128`                                       | Resulting fixed-point fee growth for each pool token.                 |
| `gaugeFeeBefore0`, `gaugeFeeBefore1`, `gaugeFeeAfter0`, `gaugeFeeAfter1` | Gauge fee accounting before and after traversal.                      |
| `steps`, `bitmapWords`, `crossings`                                      | Numeric work counts and detailed crossed tick boundaries.             |

A `CLSwapCrossing` retains the crossed `tick`, `liquidityGross`, signed `liquidityNet`,
`stakedLiquidityNet`, and fee-growth values `feeOutsideAfter0X128`/`feeOutsideAfter1X128`. Pools
owns their math and scales. Reward/time oracle updates keep their protocol owners; swap
reconciliation verifies price, liquidity, fees and asset outcomes.

Estimate a CL route with explicit work budgets. Supply the account, token addresses and transport;
the spacing and input amount illustrate the request shape:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCLPoolReader } from "@mezo-dev-kit/pools";
import { createCLSwapReader } from "@mezo-dev-kit/swaps/quotes";
import type { RpcTransport } from "@mezo-dev-kit/core";

declare const transport: RpcTransport;
declare const account: `0x${string}`;
declare const tokenIn: `0x${string}`;
declare const tokenOut: `0x${string}`;

const registry = createContractRegistry();

const pools = createCLPoolReader({ networkId: "mezo-mainnet", registry, transport });

const reader = createCLSwapReader({ networkId: "mezo-mainnet", registry, transport, pools });

const quote = await reader.quote({
  route: [{ tokenIn, tokenOut, tickSpacing: 10 }],
  intermediateAssets: [],
  account,
  amountIn: 1000000n,
  maxAgeBlocks: 2n,
  budget: { maxSteps: 64, maxBitmapWords: 8, maxCrossedTicks: 8 },
});

console.log(quote.estimatedAmountOut, quote.writeCompatible);
```

The reader returns a complete output estimate or rejects the quote. `writeCompatible` reports
token-profile compatibility separately from whether a later exact transaction can succeed.

## Bounded read-only candidate comparison

Import `@mezo-dev-kit/swaps/quotes` for the deliberate reader-only entrypoint. It exports
`SwapError`, `SwapErrorCode`, the basic reader, route validator and existing `rankBasicSwapQuotes`,
their types, plus the CL reader, route/path helpers and quote types documented here. It exposes no
writer or execution target resolver. The installed package and root entrypoint still contain
writers; this is not a separately published read-only artifact or a security sandbox.

### `createSwapQuoteReader` — configure candidate comparison

Supply the basic and/or CL reader for the route families your application will compare.

`createSwapQuoteReader(config: SwapQuoteReaderConfig): SwapQuoteReader` composes existing
`BasicSwapReader` and `CLSwapReader` ports. Supply `networkId: "mezo-mainnet"`, Core `transport`
methods `getChainId`, `getBlockNumber`, `getBlock`, `getBlockTimestamp`, and optional `basic` and
`concentratedLiquidity` readers. Use the source-verified factories in this package: the comparator
validates request identity and result consistency but does not independently reproduce arbitrary
injected readers' discovery or math. RPC endpoints, timeouts and cancellation remain
application-owned. Calls are sequential, bounded by candidate count and the existing per-route/CL
budgets; there are no retries, graph search, signer calls or background workers. An application
`AbortError` propagates and stops evaluation; it is not converted into an optional candidate
failure. Other reader failures retain their causes.

### `SwapQuoteReader.quote` — compare supplied candidates

Choose required candidates when a missing result must prevent selection of a best route. Optional
failures remain visible while allowing a partial comparison.

`quote(input: SwapQuoteRequest): Promise<SwapQuoteResult>` requires distinct nonzero
`tokenIn`/`tokenOut`, nonzero `account`, positive bigint `amountIn`, nonnegative bigint
`maxAgeBlocks`, optional bigint `blockNumber`, explicit `eligibility`, and 1–16
`SwapQuoteCandidate`s. Each candidate contains unique `id` (1–64 lowercase ASCII
letters/digits/hyphens, starting alphanumeric), boolean `required`, and explicit
`intermediateAssets`. `family: "basic"` has basic `route` hops; `family: "concentrated-liquidity"`
has CL hops and `budget`. Both use existing 1–3-hop acyclic route checks and must match the
requested pair. Comparing separate families does not construct a mixed-family path.

### Shared freshness and consistency checks

All candidates must describe the same request and blockchain snapshot.

Malformed requests fail before RPC. A request snapshots its inputs, pins every candidate to the same
number/hash/timestamp and verifies the transport chain. The block must be at or behind the initial
head, within `maxAgeBlocks` at both ends; equality is accepted. A reorg, disappearing block,
regressing head, chain change or differing candidate decimals invalidates the comparison. A stale or
future block throws `SwapError("BoundExceeded")`; incoherent identity throws
`SwapError("InconsistentQuote")`. Transport failures during these shared checks propagate; they
cannot become partial success. Explicit historical inspection outside this age policy can use the
individual readers.

### Ranking and result states

Check `state` and `coverage` before using `best`. A null best value is meaningful even when
provisional ranked candidates exist.

`SwapQuoteResult` has `coordinate`, Unix `timestamp`, `observedHead`, `expiresAfterBlock`,
`rankingPolicy: "highest-estimated-output"`, `eligibility`, `candidates`, `ranked` candidate IDs and
nullable `best`. Output ordering is descending bigint output-token base units, then ascending ASCII
candidate ID. `eligibility: "all-quotes"` compares display estimates even for quote-only assets.
`"writer-compatible"` excludes quotes whose existing writer profile is false. Neither establishes
exact-call simulation or authorizes an execution; `rankBasicSwapQuotes` retains its original
writer-compatible contract.

| Result field or state | Meaning                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete`            | Every supplied candidate produced an eligible quote.                                                                                                          |
| `partial`             | At least one eligible quote exists; only optional candidates failed or were ineligible.                                                                       |
| `incomplete`          | A required candidate failed or was ineligible; `best` is null even if provisional `ranked` candidates exist.                                                  |
| `unavailable`         | No eligible candidate remains and no required failure took precedence; `best` is null.                                                                        |
| `coverage`            | `scope: "provided-candidates-only"`, numeric `requested`, actual reader `attempted`, successful `quoted`, `eligible`, `failed` and `requiredFailures` counts. |
| `priceImpact`         | `{status: "unavailable", reason: "no-validated-marginal-price-reference"}`; no zero-impact assumption or reserve-ratio approximation.                         |
| `gas`                 | `{status: "not-estimated", rankingAdjustment: "none"}`.                                                                                                       |
| `currencyConversion`  | `"none"`; no gas/output-token or fiat conversion is assumed.                                                                                                  |

### Per-candidate fees and failures

Fees retain their input asset and precision. Keep those units when displaying or aggregating them.

Each `SwapQuoteCandidateResult` retains input `id` and `required`. `status: "quoted" | "ineligible"`
includes its family, full existing quote and per-hop `fees`. Every `SwapQuoteFee` contains `pool`,
input `token`, bigint `decimals` and `amount` in that asset's base units. Basic fees reuse the Pools
source-based helper; CL fees come from each traversal. Fees are already reflected in output; do not
subtract them again or sum fees of different assets as one currency. The output incorporates
size/fees but does not isolate numeric marginal impact.

Failed candidates retain `SwapQuoteIssue` with
`code: "ReaderUnavailable" | "QuoteUnavailable" | "InvalidQuote"`, a stable `message`, and optional
upstream `cause` for local diagnosis. Causes can contain private provider details: redact before
logging or presentation. Missing reader, liquidity, tick-budget or provider failures stay visible;
zero, partial and malformed quotes never rank. Candidate results retain request order; a best
evaluated estimate is not a global optimum, minimum received, USD price or usable execution
preparation. Requote for changed inputs, state or freshness policy. Qualified review and numeric
marginal-impact requirements remain separate from private implementation.

Compare a required basic route with an optional CL route. Supply the token pair and positive input
amount; choose real route parameters from pool discovery:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createBasicPoolReader, createCLPoolReader } from "@mezo-dev-kit/pools";
import {
  createBasicSwapReader,
  createCLSwapReader,
  createSwapQuoteReader,
} from "@mezo-dev-kit/swaps/quotes";
import type { SwapQuoteRequest } from "@mezo-dev-kit/swaps/quotes";
import type { RpcTransport } from "@mezo-dev-kit/core";

declare const transport: RpcTransport;
declare const account: `0x${string}`;
declare const tokenIn: `0x${string}`;
declare const tokenOut: `0x${string}`;
declare const amountIn: bigint; // Positive input-token base units.

const registry = createContractRegistry();

const config = { networkId: "mezo-mainnet", registry, transport } as const;

const reader = createSwapQuoteReader({
  networkId: config.networkId,
  transport,
  basic: createBasicSwapReader({ ...config, pools: createBasicPoolReader(config) }),
  concentratedLiquidity: createCLSwapReader({ ...config, pools: createCLPoolReader(config) }),
});

const request: SwapQuoteRequest = {
  tokenIn,
  tokenOut,
  account,
  amountIn,
  maxAgeBlocks: 2n,
  eligibility: "all-quotes",
  candidates: [
    {
      id: "basic-stable",
      required: true,
      family: "basic",
      route: [{ tokenIn, tokenOut, stable: true }],
      intermediateAssets: [],
    },
    {
      id: "cl-spacing-10",
      required: false,
      family: "concentrated-liquidity",
      route: [{ tokenIn, tokenOut, tickSpacing: 10 }],
      intermediateAssets: [],
      budget: { maxSteps: 64, maxBitmapWords: 8, maxCrossedTicks: 8 },
    },
  ],
};

const result = await reader.quote(request);

const best = result.best === null ? undefined : result.candidates.find((c) => c.id === result.best);

if (best?.status === "quoted") {
  console.log(best.quote.estimatedAmountOut, best.fees);
}

console.log(result.state, result.coverage, result.priceImpact, result.gas);
```

If the optional CL candidate fails, the result may be `partial`. If the required basic candidate
fails, it is `incomplete` and `best` is null. Inspect coverage and candidate failures alongside the
selected estimate.

## Exact-input writer

### `createBasicSwapWriter` — configure execution

A writer prepares fresh state, simulates the exact call, submits once, and verifies the confirmed
outcome. Approvals are separate transactions.

`createBasicSwapWriter({reader, pools, execution}): BasicSwapWriter` consumes the quote reader, the
same verified pool reader and a configured Core `ExecutionClient`. The account is the sender and
final recipient. The Router receives zero native value. Use Pools' `createBasicPoolTargetResolver`
in Core for the selected pool's explicit token approval targets; use Tokens' `createApprovalWriter`
with a `createTokenReader({transport})` for the separate approval lifecycle.

### Minimum output and deadline

Choose the minimum amount the account may receive and an absolute Unix-second deadline. These two
bounds are included in the Router call.

`BasicSwapBounds` requires positive bigint `amountOutMinimum`, bigint Unix `deadline`, and positive
bigint `maxDeadlineSeconds`. The minimum must not exceed the current estimate. The deadline must be
strictly future and within the caller's maximum horizon. Both minimum output and deadline are
encoded on-chain.

### `prepare`

`quote` is a `BasicSwapQuoteInput`, so preparation reads current values. Returns `PreparedBasicSwap`
after validating compatibility, bounds, account and input balance.

**Call:** `prepare({operationId, quote, bounds})`

### `simulate`

Requires a preparation from this writer and sufficient allowance. Returns Core
`SimulatedTransaction`; decodes exact route amounts and checks output minimums in initial and final
simulation.

**Call:** `simulate(prepared)`

### `submit`

Requires the matching owned simulation. Fresh quote, allowance, balance, deadline,
destination/calldata and age must pass before Core submission. Returns `SubmissionRecord`.

**Call:** `submit(prepared, simulated)`

### `reconcile`

Validates durable intent, confirmed canonical receipt, per-hop gross input/output and fee events,
token transfers, segregated fee payment, reserve/supply/LP changes and wallet deltas. Returns
`{state: 'reconciled', record, receipt, outcome}`.

**Call:** `reconcile(prepared, record)`

### Prepared state and approvals

Preparation exposes any approval needed before the swap can be simulated.

`PreparedBasicSwap` contains `quote`, cloned/frozen `bounds`, Tokens `approval` plan for the exact
input, and Core `transaction`. Confirm each reset/exact approval separately and prepare again. An
allowance transaction's success does not establish swap success. A prepared quote belongs to its
writer instance for simulation/submission; durable reconciliation verifies its complete call
identity.

Execute a basic swap using configured readers and a Core execution client. Supply the route inputs,
persisted unique operation ID and chosen minimum output. This excerpt assumes application consent
before submission:

```ts
import { createBasicSwapWriter } from "@mezo-dev-kit/swaps";
import type { BasicSwapReader, BasicSwapQuoteInput } from "@mezo-dev-kit/swaps";
import type { BasicPoolReader } from "@mezo-dev-kit/pools";
import type { ExecutionClient } from "@mezo-dev-kit/core";

declare const reader: BasicSwapReader;
declare const pools: BasicPoolReader;
declare const execution: ExecutionClient;
declare const quoteInput: BasicSwapQuoteInput;
declare const operationId: string;
declare const minimumOut: bigint;

const writer = createBasicSwapWriter({ reader, pools, execution });

const quote = await reader.quote(quoteInput);

const prepared = await writer.prepare({
  operationId,
  quote: quoteInput,
  bounds: {
    amountOutMinimum: minimumOut,
    deadline: quote.timestamp + 300n,
    maxDeadlineSeconds: 300n,
  },
});

if (prepared.approval.kind !== "sufficient")
  throw new Error("Confirm required approval and prepare again");

// Run after the application's transaction consent; persist and track the returned record.
const simulated = await writer.simulate(prepared);

const record = await writer.submit(prepared, simulated);

const observation = await execution.observe(record);

if (observation.state === "confirmed") {
  console.log(await writer.reconcile(prepared, record));
}
```

Approval must be confirmed before the swap is prepared again. A single observation may be pending;
continue tracking it through Core, and report actual received amounts only after reconciliation.

The [local fork walkthrough](test/fork.ts) includes setup, bounded approval/reset loops and full
protocol reconciliation. Production callers supply atomic Core storage and preserve the JSON-safe
submission record plus domain preparation and bounds (serialize bigint explicitly). Track uncertain
submissions by existing identity; do not blindly prepare another swap. Reorgs/replacements and
receipt failures retain Core's lifecycle distinctions.

### Actual output and reconciliation

Use the reconciled outcome to report what the account received.

`BasicSwapOutcome` contains actual bigint `amountIn`, `amountOut`, each-hop `amounts`, each-hop
input-asset `fees`, and receipt `coordinate`. Reconciliation uses the preceding block and receipt
block. Other activity affecting the same wallet or pool in that block can produce a reconciliation
mismatch requiring investigation. Do not treat a receipt alone as accepted output.

### Swap errors

| Fields                   | Meaning                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `InvalidInput`           | Correct invalid amounts, route shape or required policy fields.                          |
| `UnavailableRoute`       | Inspect missing pools, liquidity and route availability.                                 |
| `InconsistentQuote`      | Resolve inconsistent request, pool or block identity before using the result.            |
| `BoundExceeded`          | Refresh state and reassess the caller’s limits; retain consent for the intended bounds.  |
| `ApprovalRequired`       | Confirm the separate token approval and prepare again.                                   |
| `ReconciliationMismatch` | Preserve the submission record and investigate the actual outcome before another action. |

`SwapError` has `code: SwapErrorCode`: `InvalidInput`, `UnavailableRoute`, `InconsistentQuote`,
`BoundExceeded`, `ApprovalRequired`, or `ReconciliationMismatch`. EVM, Pools, Contracts, transport
and Core errors also propagate. Refresh stale quotes; resolve identity/output mismatches before
retrying. Exported types also include `BasicSwapHop`, `BasicSwapQuoteInput`, `BasicSwapQuote`,
`BasicSwapReader`, `BasicSwapBounds`, `PreparedBasicSwap`, `BasicSwapOutcome`, and
`BasicSwapWriter`.

## CL exact-input writer

### `createCLSwapWriter` — prepare a CL transaction

The CL writer has the same four lifecycle stages, with its own preparation shape and bounds.

`createCLSwapWriter({reader, pools, execution, transport}): CLSwapWriter` provides
`prepare(quoteInput & {operationId, bounds})`, `simulate(prepared)`, `submit(prepared, simulated)`
and `reconcile(prepared, record)`. Preparation selects the latest state; it accepts the quote inputs
except `blockNumber`. `CLSwapBounds` contains positive bigint `minAmountOut`, Unix `deadline`,
positive `maxDeadlineSeconds`, and nonnegative `maxBlockAge`. The output minimum and deadline are
on-chain. Both the original quote TTL and writer age bound apply.

### CL preparation and custody requirements

The prepared call retains its quote, bounds, approval plan and exact transaction.

`PreparedCLSwap` contains `quote`, frozen `bounds`, Tokens `approval` plan, and exact zero-value
`transaction`. Writer assets are MUSD, mUSDC and mUSDT, with each used token generation and
precision verified through Pools. Other CL routes remain quotable without writer compatibility. The
router's native balance must be zero before execution because `refundBTC` would otherwise transfer
unrelated custody. Direct self recipient, sufficient wallet input and explicit deadline/output
bounds are required. Single hops use `exactInputSingle` with the zero default-limit sentinel; the
validated multi-hop encoder uses `exactInput` with the packed path when asset compatibility allows.

### `createCLSwapTargetResolver` — bind token approval

Configure Core’s target resolver with the selected route before composing its separate token
approval.

`createCLSwapTargetResolver({reader, input}): ExecutionTargetResolver` binds an input-token approval
to the selected quote request (without `blockNumber`). It rereads the exact coordinate, writer
assets, factory anchor and input token role. Pass it to Core's `resolveTarget`. Confirm any
exact/reset Tokens approval as a separate transaction and prepare again. No unlimited approval or
native payment is inferred. The initial and final exact simulations must return the current quoted
output and satisfy the minimum. Changed state, budgets, recipient, calldata, identity, allowance or
age reject sending; preparations and simulations must belong to this writer.

### CL outcome and settlement checks

Read the actual output and `boundsSatisfied` after confirmation and reconciliation.

`ReconciledCLSwap` contains `state: "reconciled"`, Core `record`, `receipt`, and
`outcome: CLSwapOutcome`. The outcome has `amountIn`, actual `amountOut`, receipt-block `pools`,
native-base-unit `gasFee`, and `boundsSatisfied`. Recovery verifies persisted identity/calldata
before provider work. It requotes the predecessor block and proves exact Swap events, token
payer/recipient edges, pool balances, final price/tick and active/staked liquidity, crossed
fee-growth boundaries, global/gauge fees, unchanged NFT counts, wallet changes and gas. Intermediate
router custody is verified through its incoming/outgoing transfers. It rechecks the receipt
coordinate after additional fee reads. Other activity in the receipt block can prevent this exact
attribution and requires investigation.

Prepare a CL swap with the input shape described above. The execution client must use the
appropriate target resolver when composing approvals:

```ts
import { createCLSwapWriter, createCLSwapTargetResolver } from "@mezo-dev-kit/swaps";
import type { CLSwapReader, CLSwapQuoteInput } from "@mezo-dev-kit/swaps";
import type { CLPoolReader } from "@mezo-dev-kit/pools";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";

declare const reader: CLSwapReader;
declare const pools: CLPoolReader;
declare const execution: ExecutionClient;
declare const transport: RpcTransport;
declare const input: Omit<CLSwapQuoteInput, "blockNumber">;

const resolveTarget = createCLSwapTargetResolver({ reader, input });

const writer = createCLSwapWriter({ reader, pools, execution, transport });

const quote = await reader.quote(input);

const prepared = await writer.prepare({
  ...input,
  operationId: "application-owned-unique-swap",
  bounds: {
    minAmountOut: (quote.estimatedAmountOut * 99n) / 100n,
    deadline: quote.timestamp + 120n,
    maxDeadlineSeconds: 120n,
    maxBlockAge: 2n,
  },
});

console.log(resolveTarget, prepared.approval, prepared.transaction);
// Application consent, confirmed approvals and re-preparation precede submission.
```

This excerpt creates a preparation only. Its minimum retains 99% of the estimate as an illustrative
policy. `minAmountOut` is the CL field name; the basic writer uses `amountOutMinimum`. Confirm
approvals and obtain consent before continuing the writer lifecycle.

## Separate basic/CL continuation example

[`examples/mixed-recovery.ts`](examples/mixed-recovery.ts) is application code, not a package export
or an atomic router. `prepareMixedSwapContinuation` takes a first-leg writer, validated preparation
and Core submission record; a different second router family with current quote inputs and bounds; a
stable second operation ID; an intermediate token; explicit consent; and persistence callbacks.

It reconciles first-leg inclusion and custody again, requires its bounds to hold, and atomically
persists a JSON-safe checkpoint containing both operation IDs, account/network, receipt hash/block,
intermediate token and actual output amount. A saved checkpoint must match that fresh result. The
second writer receives exactly the realized output in base units, never the old quote or the
wallet's entire balance. A failed second preparation leaves the checkpoint available for inspection,
stopping, or a newly consented re-preparation with current bounds.

`loadSecondSubmission` must read the same durable store Core reserves before sending. An existing
record returns `state: "second-submitted"` and prevents preparation, including when its hash is
null. Reconcile or investigate that record; do not assign another operation ID to evade uncertain
submission. With no saved submission, `state: "ready"` supplies the family, fresh preparation and
checkpoint. Confirm separate Tokens approvals, invoke the helper again, then simulate/submit through
that writer. The helper never calls a wallet.

The application owns validated serialization of prepared values, atomic durable storage, concurrent
intent control and retention of both legs' Core records. Wallet tokens remain fungible: this
checkpoint does not reserve them against other operations. Two transactions carry independent
failure and price exposure; no cross-family atomicity or native BTC/MEZO engine guarantee is
established.
