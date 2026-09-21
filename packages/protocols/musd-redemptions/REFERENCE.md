# MUSD redemptions SDK reference

Use `@mezo-dev-kit/musd-redemptions` to estimate exchanging MUSD for BTC collateral through the
classic TroveManager, inspect the exact simulated output, and prepare a redemption.

A **redemption** consumes eligible borrowing positions from the protocol’s ordered list. It differs
from repaying your own loan. **Hints** identify positions used by the contract’s list operations.
The requested amount can exceed the amount actually redeemed, so inspect attempted, actual, gross,
fee and net amounts separately.

Start with `createRedemptionReader` for a bounded quote. Execution additionally needs an output
simulator capable of tracing the exact call. All MUSD and BTC amounts here use 18-decimal bigint
base units.

See [package scope](README.md) for provider requirements. Borrower repayment belongs to the
[Borrowing package](../musd-borrowing/REFERENCE.md).

On this page:

- [Functions and methods](#functions-and-methods)
- [Public types and results](#public-types-and-results)
- [Examples](#examples)

## Functions and methods

### Calculate redemption amounts

#### `calculateRedemptionLot`

uint256 MUSD base units; returns the smaller of remaining request and debt minus reserve. Rejects
debt below reserve.

**Call:** `calculateRedemptionLot({ remainingRequested, entireDebt, gasCompensation })`

#### `calculateRedemptionCollateral`

MUSD base units and positive protocol USD/BTC price at 18 decimals; returns floor-rounded native BTC
base units.

**Call:** `calculateRedemptionCollateral({ musdLot, price })`

#### `calculateRedemptionFee`

Applies a rate from zero through 1e18 to aggregate actual gross collateral; floors once.

**Call:** `calculateRedemptionFee({ collateralDrawn, redemptionRate })`

#### `calculateRedemptionPartialLimit`

Caps a partial at net debt minus minimum, or zero when there is no capacity. A full redemption uses
the separate lot calculation.

**Call:** `calculateRedemptionPartialLimit({ remainingRequested, netDebt, minimumNetDebt })`

### Read state and request a quote

#### `createRedemptionReader`

Mainnet `networkId`, Contracts `registry`, Core `RpcTransport`; returns `RedemptionReader`.

**Call:** `createRedemptionReader(config)`

#### `reader.read`

Coherent settlement snapshot; at most 64 unique nonzero borrower addresses. Omitting borrowers reads
no position inventory. Omitting block chooses one head.

**Call:** `reader.read({ account, borrowers?, blockNumber? })`

#### `reader.quote`

Validates eligibility and attempted balance, scans up to `maxTailScan` tail entries (1–64), calls
canonical HintHelpers with `maxIterations` (1–64), and obtains partial reinsertion hints with
`trials` (1–1000) and explicit uint256 `seed`. Throws when coverage is exhausted or no redemption is
available.

**Call:** `reader.quote(input)`

### Trace the exact output

#### `createRedemptionTraceSimulator`

Explicit request/transport and provider identity plus timeout, frame/log/depth/byte budgets; returns
`RedemptionOutputSimulator`.

**Call:** `createRedemptionTraceSimulator(config)`

#### `simulator.simulate`

Read-only exact zero-value TroveManager redemption trace, including sender and nonce. Requires one
successful canonical Redemption log and stable chain/hash. Reverted subtrees cannot contribute
events. Returns actual aggregate amounts.

**Call:** `simulator.simulate({ call, coordinate })`

#### `decodeRedemptionAmounts`

Decodes exactly one canonical Redemption event; checks positive actual amount, actual ≤ attempted,
and fee ≤ gross. It does not independently prove receipt success, runtime, or log provenance.

**Call:** `decodeRedemptionAmounts({ logs, contract, coordinate })`

### Prepare and execute a redemption

#### `createRedemptionWriter`

Reader, Core execution client, output simulator and RPC transport.

**Call:** `createRedemptionWriter(config)`

#### `writer.prepare`

Reads a fresh quote, checks explicit positive output minimums/rate limit, and creates zero-value
calldata. No wallet call or approval.

**Call:** `writer.prepare({ operationId, quote, bounds })`

#### `writer.simulate`

Checks exact protocol state and trace output. Core retains the same verifier for final simulation.
Prepared objects and simulations belong to this writer instance.

**Call:** `writer.simulate(prepared)`

#### `writer.submit`

Revalidates fresh bounded quote, balance/rate/age and exact output before Core invokes the selected
wallet. Returns a durable submission record, not completion.

**Call:** `writer.submit(prepared, simulated)`

#### `writer.reconcile`

Core confirmation and canonical receipt verification, predecessor/post-state reads, fee-corrected
native balances, MUSD burns/mints, pool accounting and affected positions. Restored matching
prepared intent and record can be reconciled without re-submitting.

**Call:** `writer.reconcile(prepared, record)`

### Rounding and partial fills

Every financial helper rejects uint256 overflow/underflow and uses integer floor semantics. The
helper quote is an estimate; partial cancellation and iteration limits can leave requested MUSD
unburned. Interest between quote and inclusion also changes a full redemption's exact debt.
`amountMode: "requested"` can retain headroom for a bounded full fill; the account must hold the
entire attempted sum.

### Trace-provider budgets

Trace budgets are explicit positive safe integers: `timeoutMs` ≤ 60000, `maxFrames`/`maxLogs` ≤
4096, `maxDepth` ≤ 64, `maxDataBytes` ≤ 4194304. The adapter's timeout limits waiting; the
application owns cancellation of the underlying request. Unsupported, incomplete, reverted or
oversized traces reject.

## Public types and results

### `RedemptionReaderConfig`, `RedemptionReader`

Mainnet registry/transport configuration and `read`/`quote` methods.

### `RedemptionPosition`

Borrower address, Borrowing's normalized entire position, and separately claimable surplus.

### `RedemptionSnapshot`

Verified `borrowing` snapshot, explicitly requested `positions`, governed redemption
rate/TroveManager burn permission, redeemer and PCV native balances, PCV/GasPool/token supply,
Active/Default Pool collateral/principal/interest, interest numerator/timestamp and accrued system
interest. No completeness claim for all borrowers.

### `RedemptionQuoteInput`

Account, positive requested MUSD, optional `amountMode` (`truncate` default or `requested`),
iteration/tail/trial budgets, seed and optional block.

### `RedemptionQuote`

Snapshot, captured input, attempted and helper-truncated amounts, first/upper/lower addresses,
partial nominal ratio, returned seed and tail entries checked. Candidate positions follow NICR list
order; eligibility is current ICR.

### `RedemptionAmounts`

`attemptedAmount`, `actualAmount`, `grossCollateral`, `collateralFee`, `netCollateral`. MUSD and BTC
use 18-decimal base units; attempted and actual are separate.

### `RedemptionLog`

Address, topics and ABI data. Raw externally supplied logs are not receipt proof.

### `RedemptionTraceInput`, `RedemptionOutputSimulator`, `RedemptionTraceConfig`

Exact Core call/coordinate, asynchronous amount verifier, and explicit trace-provider/budget inputs.
Custom simulators must faithfully execute the exact call at that coordinate.

### `RedemptionBounds`

Positive `minActualAmount`, positive `minNetCollateral`, `maxRedemptionRate` (0–1e18), and
nonnegative `maxBlockAge`. These are preflight policy, not contract-enforced output guarantees.

### `PreparedRedemption`

Captured quote/bounds and exact Core `transaction` intent.

### `RedemptionWriterConfig`, `RedemptionWriter`

Injected reader/execution/simulator/transport and four lifecycle methods.

### `RedemptionOutcome`

Actual amounts, post-state snapshot, native `gasFee`, full/partial borrower lists and
`boundsSatisfied`. False means verified inclusion output fell outside caller policy.

### `ReconciledRedemption`

`state: "reconciled"`, durable record, canonical receipt and outcome.

### `RedemptionError`, `RedemptionErrorCode`

`InvalidInput`, `IdentityMismatch`, `LimitExceeded`, `UnavailableRedemption`,
`SimulationUnavailable`, `SimulationFailed`, `BoundExceeded`, `ReconciliationMismatch`. EVM,
Borrowing, Core and transport errors preserve their owners.

### Settlement limits

Reconciliation refuses missing historical/fee evidence, changed identities, and ambiguous same-block
balance changes. It reports logged affected positions; interest materialization on skipped entries
without events is not a full queue inventory. A hash or successfully traced call does not prove
inclusion.

## Examples

Calculate gross collateral, fee and net collateral for illustrative price and rate inputs. This
example performs no RPC:

```ts
import {
  calculateRedemptionCollateral,
  calculateRedemptionFee,
} from "@mezo-dev-kit/musd-redemptions";

const gross = calculateRedemptionCollateral({
  musdLot: 100n * 10n ** 18n,
  price: 80000n * 10n ** 18n,
});

const fee = calculateRedemptionFee({ collateralDrawn: gross, redemptionRate: 7500000000000000n });

const net = gross - fee; // Example arithmetic only; read the actual protocol rate and price.

void net;
```

`gross` and `net` are BTC base units; `fee` is the difference between them. Obtain the actual price
and governed rate from the protocol before evaluating a real redemption.

Request a bounded redemption quote with an application-supplied Core transport and redeemer account:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createRedemptionReader } from "@mezo-dev-kit/musd-redemptions";

declare const transport: RpcTransport;
declare const account: `0x${string}`;

const reader = createRedemptionReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});

const quote = await reader.quote({
  account,
  requestedAmount: 100n * 10n ** 18n,
  maxIterations: 1n,
  maxTailScan: 32,
  trials: 20n,
  seed: 42n,
});

console.log(
  quote.attemptedAmount,
  quote.helperTruncatedAmount,
  quote.snapshot.borrowing.coordinate,
);
```

Compare `attemptedAmount` with `helperTruncatedAmount`: the route through borrower positions can
consume less than requested. The coordinate identifies the snapshot used for these estimates.

Configure exact-output tracing and prepare a redemption. Supply a provider supporting `callTracer`
with logs, a reader, and an execution client with explicit signer and durable storage. Obtain
consent before submission:

```ts
import type { ExecutionClient, RpcRequest, RpcTransport } from "@mezo-dev-kit/core";
import {
  createRedemptionTraceSimulator,
  createRedemptionWriter,
} from "@mezo-dev-kit/musd-redemptions";
import type { RedemptionReader } from "@mezo-dev-kit/musd-redemptions";

declare const request: RpcRequest; // Application-selected node supporting callTracer + withLog.
declare const transport: RpcTransport;
declare const reader: RedemptionReader;
declare const execution: ExecutionClient; // Explicit signer, confirmations, age and durable atomic store.
declare const account: `0x${string}`;

const simulator = createRedemptionTraceSimulator({
  request,
  transport,
  providerId: "application-node",
  timeoutMs: 30000,
  maxFrames: 1024,
  maxLogs: 512,
  maxDepth: 32,
  maxDataBytes: 1048576,
});

const writer = createRedemptionWriter({ reader, execution, simulator, transport });

const prepared = await writer.prepare({
  operationId: "user-redemption-unique-id",
  quote: {
    account,
    requestedAmount: 100n * 10n ** 18n,
    maxIterations: 1n,
    maxTailScan: 32,
    trials: 20n,
    seed: 42n,
  },
  bounds: {
    minActualAmount: 99n * 10n ** 18n,
    minNetCollateral: 1000000000000000n,
    maxRedemptionRate: 10000000000000000n,
    maxBlockAge: 2n,
  },
});

const simulated = await writer.simulate(prepared);

const record = await writer.submit(prepared, simulated);

const observation = await execution.observe(record);

if (observation.state === "confirmed") {
  const result = await writer.reconcile(prepared, observation.record);

  console.log(result.outcome.amounts, result.outcome.boundsSatisfied);
}
```

After confirmation, inspect actual amounts and `boundsSatisfied`. The bounds are client policy
rather than contract-enforced output arguments. A single `observe` call may still be pending and
requires continued application tracking.

The explicit minimums above are illustrative application policy. Real inputs come from the user's
decision and the fresh quote/trace. Do not automatically resubmit a failed, uncertain or
insufficient-output operation.

### Trace output requirements

Geth marks a call frame's empty `output` as optional; omission is accepted for this void operation,
while explicit null or nonempty output is rejected. See
[Geth's callTracer implementation](https://github.com/ethereum/go-ethereum/blob/master/eth/tracers/native/call.go)
and
[built-in tracer documentation](https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers).
The successful canonical Redemption event remains mandatory.

### Queue-work and provider limits

Tail/iteration/trial budgets bound SDK queue work. SortedTroves' internal `findInsertPosition`
search has no explicit iteration parameter; applications must also bound RPC execution time/gas.
Exhausting that provider budget is an unavailable quote, never permission to invent insertion hints.
