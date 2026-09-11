# Swaps SDK reference

Import from `@mezo-dev-kit/swaps`. The [README](README.md) owns the private
mainnet basic-pool scope. [Pools](../protocols/pools/REFERENCE.md) owns discovery,
token compatibility, reserve and LP accounting; [Core](../core/REFERENCE.md)
owns execution and durable records. These amount-specific DEX observations have
source class `dex-execution-quote`; they are not protocol oracle prices.

## Routes and quotes

`validateBasicSwapRoute(route, intermediateAssets): readonly BasicSwapHop[]`
returns frozen lowercase hops. A `BasicSwapHop` has `tokenIn`, `tokenOut` and an
explicit boolean `stable`. Require one to three hops, nonzero distinct assets,
contiguous outputs/inputs and no repeated asset in the route. Each intermediate
must appear in the caller's explicit allowlist (at most 16 entries). Stable and
volatile pools are different paths. There is no automatic route enumeration.

`createBasicSwapReader({networkId, registry, transport, pools}): BasicSwapReader`
requires `networkId: 'mezo-mainnet'`, Contracts registry, Core `RpcTransport`, and
a verified Pools `BasicPoolReader`. `quote(input: BasicSwapQuoteInput)` requires
`route`, `intermediateAssets`, `account`, positive bigint `amountIn`, and
nonnegative bigint `maxAgeBlocks`. Optional bigint `blockNumber` selects a
historical coordinate; otherwise the reader selects one head. Every pool must
have the same block/hash and Router, positive reserves, ordinary reserve/balance
agreement, an unpaused factory and a valid current fee. The source Router's
`getAmountsOut` supplies exact integer hop estimates. Partial/zero responses,
missing pools and chain/hash changes reject the quote.

`BasicSwapQuote` fields:

| Field                                                  | Meaning                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `sourceClass`, `providerId`, `coordinate`, `timestamp` | DEX provenance and block; timestamp is bigint Unix seconds.                                                  |
| `route`, `intermediateAssets`, `account`, `router`     | Validated caller route policy and destination.                                                               |
| `amountIn`, `amounts`, `estimatedAmountOut`            | Bigint base units. `amounts` has one input plus each hop output; each entry uses that hop asset's precision. |
| `maxAgeBlocks`                                         | Caller maximum preparation age checked before submission.                                                    |
| `inputToken`, `outputToken`                            | Tokens snapshots with asset, precision, balances and Router allowance targets.                               |
| `pools`                                                | Verified pool snapshots in route order.                                                                      |
| `writeCompatible`                                      | Every pool's writer token compatibility passed. Initially only MUSD/mUSDC.                                   |

`rankBasicSwapQuotes(quotes)` accepts 1–64 complete writer-compatible quotes for
the same account, input amount, input/output assets and precisions, age policy,
network, chain and block/hash. It verifies route/pool consistency and sorts
by decreasing output; equal outputs use deterministic route ordering. It throws
on incompatible or incomplete candidates rather than silently mixing requests.
It neither subtracts gas costs nor asserts that an old coordinate is still fresh.
A quote or ranking never authorizes a transfer; writers reread current state.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createBasicPoolReader } from "@mezo-dev-kit/pools";
import { createBasicSwapReader, rankBasicSwapQuotes } from "@mezo-dev-kit/swaps";
declare const transport: RpcTransport;
declare const account: `0x${string}`, musdc: `0x${string}`, musd: `0x${string}`;
const registry = createContractRegistry();
const pools = createBasicPoolReader({ networkId: "mezo-mainnet", registry, transport });
const reader = createBasicSwapReader({ networkId: "mezo-mainnet", registry, transport, pools });
const quote = await reader.quote({
  route: [{ tokenIn: musdc, tokenOut: musd, stable: true }],
  intermediateAssets: [],
  account,
  amountIn: 10n * 10n ** 6n,
  maxAgeBlocks: 2n,
});
console.log(quote.amounts, quote.outputToken.decimals);
if (quote.writeCompatible) console.log(rankBasicSwapQuotes([quote]));
```

## Exact-input writer

`createBasicSwapWriter({reader, pools, execution}): BasicSwapWriter` consumes the
quote reader, the same verified pool reader and a configured Core `ExecutionClient`.
The account is the sender and final recipient. The Router receives zero native
value. Use Pools' `createBasicPoolTargetResolver` in Core for the selected pool's
explicit token approval targets; use Tokens' `createApprovalWriter` with a
`createTokenReader({transport})` for the separate approval lifecycle.

`BasicSwapBounds` requires positive bigint `amountOutMinimum`, bigint Unix
`deadline`, and positive bigint `maxDeadlineSeconds`. The minimum must not exceed
the current estimate. The deadline must be strictly future and within the caller's
maximum horizon. Both minimum output and deadline are encoded on-chain.

| Method                                  | Result and checks                                                                                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare({operationId, quote, bounds})` | `quote` is a `BasicSwapQuoteInput`, so preparation reads current values. Returns `PreparedBasicSwap` after validating compatibility, bounds, account and input balance.                                                                            |
| `simulate(prepared)`                    | Requires a preparation from this writer and sufficient allowance. Returns Core `SimulatedTransaction`; decodes exact route amounts and checks output minimums in initial and final simulation.                                                     |
| `submit(prepared, simulated)`           | Requires the matching owned simulation. Fresh quote, allowance, balance, deadline, destination/calldata and age must pass before Core submission. Returns `SubmissionRecord`.                                                                      |
| `reconcile(prepared, record)`           | Validates durable intent, confirmed canonical receipt, per-hop gross input/output and fee events, token transfers, segregated fee payment, reserve/supply/LP changes and wallet deltas. Returns `{state: 'reconciled', record, receipt, outcome}`. |

`PreparedBasicSwap` contains `quote`, cloned/frozen `bounds`, Tokens `approval`
plan for the exact input, and Core `transaction`. Confirm each reset/exact
approval separately and prepare again. An allowance transaction's success does
not establish swap success. A prepared quote belongs to its writer instance for
simulation/submission; durable reconciliation verifies its complete call identity.

```ts
import { createBasicSwapWriter } from "@mezo-dev-kit/swaps";
import type { BasicSwapReader, BasicSwapQuoteInput } from "@mezo-dev-kit/swaps";
import type { BasicPoolReader } from "@mezo-dev-kit/pools";
import type { ExecutionClient } from "@mezo-dev-kit/core";
declare const reader: BasicSwapReader, pools: BasicPoolReader, execution: ExecutionClient;
declare const quoteInput: BasicSwapQuoteInput;
declare const operationId: string, minimumOut: bigint;
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
if (observation.state === "confirmed") console.log(await writer.reconcile(prepared, record));
```

The [local fork walkthrough](test/fork.ts) includes setup, bounded approval/reset
loops and full protocol reconciliation. Production callers supply atomic Core
storage and preserve the JSON-safe submission record plus domain preparation and
bounds (serialize bigint explicitly). Track uncertain submissions by existing
identity; do not blindly prepare another swap. Reorgs/replacements and receipt
failures retain Core's lifecycle distinctions.

`BasicSwapOutcome` contains actual bigint `amountIn`, `amountOut`, each-hop
`amounts`, each-hop input-asset `fees`, and receipt `coordinate`. Reconciliation
uses the preceding block and receipt block. Other activity affecting the same
wallet or pool in that block can produce a reconciliation mismatch requiring
investigation. Do not treat a receipt alone as accepted output.

`SwapError` has `code: SwapErrorCode`: `InvalidInput`, `UnavailableRoute`,
`InconsistentQuote`, `BoundExceeded`, `ApprovalRequired`, or
`ReconciliationMismatch`. EVM, Pools, Contracts, transport and Core errors also
propagate. Refresh stale quotes; resolve identity/output mismatches before retrying.
Exported types also include `BasicSwapHop`, `BasicSwapQuoteInput`, `BasicSwapQuote`,
`BasicSwapReader`, `BasicSwapBounds`, `PreparedBasicSwap`, `BasicSwapOutcome`, and
`BasicSwapWriter`.

## Bounded read-only candidate comparison

Import `@mezo-dev-kit/swaps/quotes` for the deliberate reader-only entrypoint.
It exports `SwapError`, `SwapErrorCode`, the basic reader, route validator and
existing `rankBasicSwapQuotes`, their types, plus the CL reader, route/path
helpers and quote types documented here. It exposes no writer or execution
target resolver. The installed package and root entrypoint still contain writers;
this is not a separately published read-only artifact or a security sandbox.

`createSwapQuoteReader(config: SwapQuoteReaderConfig): SwapQuoteReader` composes
existing `BasicSwapReader` and `CLSwapReader` ports. Supply `networkId:
"mezo-mainnet"`, Core `transport` methods `getChainId`, `getBlockNumber`,
`getBlock`, `getBlockTimestamp`, and optional `basic` and
`concentratedLiquidity` readers. Use the source-verified factories in this
package: the comparator validates request identity and result consistency but
does not independently reproduce arbitrary injected readers' discovery or math.
RPC endpoints, timeouts and cancellation remain application-owned. Calls are
sequential, bounded by candidate count and the existing per-route/CL budgets;
there are no retries, graph search, signer calls or background workers.

`quote(input: SwapQuoteRequest): Promise<SwapQuoteResult>` requires distinct
nonzero `tokenIn`/`tokenOut`, nonzero `account`, positive bigint `amountIn`,
nonnegative bigint `maxAgeBlocks`, optional bigint `blockNumber`, explicit
`eligibility`, and 1–16 `SwapQuoteCandidate`s. Each candidate contains unique
`id` (1–64 lowercase ASCII letters/digits/hyphens, starting alphanumeric),
boolean `required`, and explicit `intermediateAssets`. `family: "basic"` has
basic `route` hops; `family: "concentrated-liquidity"` has CL hops and `budget`.
Both use existing 1–3-hop acyclic route checks and must match the requested pair.
Comparing separate families does not construct a mixed-family path.

Malformed requests fail before RPC. A request snapshots its inputs, pins every
candidate to the same number/hash/timestamp and verifies the transport chain.
The block must be at or behind the initial head, within `maxAgeBlocks` at both
ends; equality is accepted. A reorg, disappearing block, regressing head, chain
change or differing candidate decimals invalidates the comparison. A stale or
future block throws `SwapError("BoundExceeded")`; incoherent identity throws
`SwapError("InconsistentQuote")`. Transport failures during these shared checks
propagate; they cannot become partial success. Explicit historical inspection
outside this age policy can use the individual readers.

`SwapQuoteResult` has `coordinate`, Unix `timestamp`, `observedHead`,
`expiresAfterBlock`, `rankingPolicy: "highest-estimated-output"`, `eligibility`,
`candidates`, `ranked` candidate IDs and nullable `best`. Output ordering is
descending bigint output-token base units, then ascending ASCII candidate ID.
`eligibility: "all-quotes"` compares display estimates even for quote-only
assets. `"writer-compatible"` excludes quotes whose existing writer profile is
false. Neither establishes exact-call simulation or authorizes an execution;
`rankBasicSwapQuotes` retains its original writer-compatible contract.

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

Each `SwapQuoteCandidateResult` retains input `id` and `required`. `status:
"quoted" | "ineligible"` includes its family, full existing quote and per-hop
`fees`. Every `SwapQuoteFee` contains `pool`, input `token`, bigint `decimals`
and `amount` in that asset's base units. Basic fees reuse the Pools source-based
helper; CL fees come from each traversal. Fees are already reflected in output;
do not subtract them again or sum fees of different assets as one currency.
The output incorporates size/fees but does not isolate numeric marginal impact.

Failed candidates retain `SwapQuoteIssue` with `code: "ReaderUnavailable" |
"QuoteUnavailable" | "InvalidQuote"`, a stable `message`, and optional upstream
`cause` for local diagnosis. Causes can contain private provider details: redact
before logging or presentation. Missing reader, liquidity, tick-budget or
provider failures stay visible; zero, partial and malformed quotes never rank.
Candidate results retain request order; a best evaluated estimate is not a
global optimum, minimum received, USD price or usable execution preparation.
Requote for changed inputs, state or freshness policy. Qualified review and
numeric marginal-impact requirements remain separate from private implementation.

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
declare const request: SwapQuoteRequest;
const registry = createContractRegistry();
const config = { networkId: "mezo-mainnet", registry, transport } as const;
const reader = createSwapQuoteReader({
  networkId: config.networkId,
  transport,
  basic: createBasicSwapReader({ ...config, pools: createBasicPoolReader(config) }),
  concentratedLiquidity: createCLSwapReader({ ...config, pools: createCLPoolReader(config) }),
});
const result = await reader.quote(request);
const best = result.best === null ? undefined : result.candidates.find((c) => c.id === result.best);
if (best?.status === "quoted") console.log(best.quote.estimatedAmountOut, best.fees);
console.log(result.state, result.coverage, result.priceImpact, result.gas);
```

## Concentrated-liquidity routes and quotes

`validateCLSwapRoute(route, intermediateAssets)` validates one to three
contiguous, acyclic `CLSwapHop`s (`tokenIn`, `tokenOut`, numeric positive
`tickSpacing`) and up to 16 explicit intermediate-token addresses. It returns
frozen normalized hops. `encodeCLSwapPath(route): HexData` packs the first token,
then each three-byte signed-int24 spacing and output token. It validates shape
and continuity; candidate selection must also validate the caller's allowlist.
Basic tuples and CL paths are separate formats. No atomic mixed router is assumed.

`createCLSwapReader({networkId, registry, transport, pools}): CLSwapReader` requires
mainnet, Contracts registry, Core transport and a verified Pools `CLPoolReader`.
Its `quote(input: CLSwapQuoteInput)` takes `route`, `intermediateAssets`,
`account`, positive signed-int256 `amountIn`, bigint `maxAgeBlocks`, optional
`blockNumber`, and an explicit `budget: CLSwapBudget`:

| Budget field      | Per-hop maximum                                          |
| ----------------- | -------------------------------------------------------- |
| `maxSteps`        | Positive integer, at most 256 price steps.               |
| `maxBitmapWords`  | Positive integer, at most 32 distinct bitmap RPC reads.  |
| `maxCrossedTicks` | Positive integer, at most 32 initialized boundary reads. |

The reader checks the router generation/factory, coherent verified pools and
final chain/hash. It uses source-exact integer steps, directional bitmap search,
tick liquidity changes and fee splits. Quotes require initial active liquidity
and a fully consumed input. Empty intervening ranges can be crossed within the
budget; an exhausted budget or default price limit rejects partial output.
No allowance, wallet funding, Quoter or transaction simulation is required to
calculate a quote. Unknown token behavior remains outside writer compatibility.

`CLSwapQuote` contains `sourceClass: "dex-execution-quote"`, `providerId`,
`coordinate`, Unix `timestamp`, `account`, resolved `router`,
`routerNativeBalance`, normalized `route`, `intermediateAssets`, packed `path`,
`amountIn`, `estimatedAmountOut`, per-hop `amounts`, `pools`, input/output
`TokenSnapshot`s with the router as spender, `maxAgeBlocks`, frozen `budget`,
and `writeCompatible`. TTL is checked before execution; explicit historical
coordinates remain usable for inspection/reconciliation. Amounts are bigint
base units. A quote is an estimate, not a guaranteed output or oracle price.

Each `CLSwapPoolQuote` contains the initial pool `snapshot`, `amountIn`,
`amountOut`, `feeAmount`, resulting `sqrtPriceX96`, `tick`, `liquidity`,
`stakedLiquidity`, `globalFee0X128`, `globalFee1X128`, `gaugeFeeBefore0`,
`gaugeFeeBefore1`, `gaugeFeeAfter0`, `gaugeFeeAfter1`, numeric `steps`,
`bitmapWords`, and `crossings`. A `CLSwapCrossing` records `tick`,
`liquidityGross`, signed `liquidityNet`, `stakedLiquidityNet`, and
`feeOutsideAfter0X128`/`feeOutsideAfter1X128`. Reward/time oracle updates caused
by a crossing retain their protocol owners; swap reconciliation proves the
swap's price/liquidity/fee and asset outcome.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createCLPoolReader } from "@mezo-dev-kit/pools";
import { createCLSwapReader } from "@mezo-dev-kit/swaps";
import type { RpcTransport } from "@mezo-dev-kit/core";
declare const transport: RpcTransport;
declare const account: `0x${string}`, tokenIn: `0x${string}`, tokenOut: `0x${string}`;
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

## CL exact-input writer

`createCLSwapWriter({reader, pools, execution, transport}): CLSwapWriter` provides
`prepare(quoteInput & {operationId, bounds})`, `simulate(prepared)`,
`submit(prepared, simulated)` and `reconcile(prepared, record)`. Preparation
selects the latest state; it accepts the quote inputs except `blockNumber`.
`CLSwapBounds` contains positive bigint `minAmountOut`, Unix `deadline`, positive
`maxDeadlineSeconds`, and nonnegative `maxBlockAge`. The output minimum and
deadline are on-chain. Both the original quote TTL and writer age bound apply.

`PreparedCLSwap` contains `quote`, frozen `bounds`, Tokens `approval` plan,
and exact zero-value `transaction`. Initial writer assets are MUSD/mUSDC, so
current executable routes have one hop. Other CL routes remain quotable.
The router's native balance must be zero before execution because `refundBTC`
would otherwise transfer unrelated custody. Direct self recipient, sufficient
wallet input and explicit deadline/output bounds are required. Single hops use
`exactInputSingle` with the zero default-limit sentinel; the validated multi-hop
encoder uses `exactInput` with the packed path when asset compatibility allows.

`createCLSwapTargetResolver({reader, input}): ExecutionTargetResolver` binds an
input-token approval to the selected quote request (without `blockNumber`). It
rereads the exact coordinate, writer assets, factory anchor and input token role.
Pass it to Core's `resolveTarget`. Confirm any exact/reset Tokens approval as a
separate transaction and prepare again. No unlimited approval or native payment
is inferred. The initial and final exact simulations must return the current
quoted output and satisfy the minimum. Changed state, budgets, recipient,
calldata, identity, allowance or age reject sending; preparations and simulations
must belong to this writer.

`ReconciledCLSwap` contains `state: "reconciled"`, Core `record`, `receipt`,
and `outcome: CLSwapOutcome`. The outcome has `amountIn`, actual `amountOut`,
receipt-block `pools`, native-base-unit `gasFee`, and `boundsSatisfied`.
Recovery verifies persisted identity/calldata before provider work. It requotes
the predecessor block and proves exact Swap events, token payer/recipient edges,
pool balances, final price/tick and active/staked liquidity, crossed fee-growth
boundaries, global/gauge fees, unchanged NFT counts, wallet changes and gas.
Intermediate router custody is verified through its incoming/outgoing transfers.
It rechecks the receipt coordinate after additional fee reads. Other activity
in the receipt block can prevent this exact attribution and requires investigation.

```ts
import { createCLSwapWriter, createCLSwapTargetResolver } from "@mezo-dev-kit/swaps";
import type { CLSwapReader, CLSwapQuoteInput } from "@mezo-dev-kit/swaps";
import type { CLPoolReader } from "@mezo-dev-kit/pools";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";
declare const reader: CLSwapReader, pools: CLPoolReader;
declare const execution: ExecutionClient, transport: RpcTransport;
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
