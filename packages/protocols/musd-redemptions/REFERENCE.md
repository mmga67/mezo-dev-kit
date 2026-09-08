# MUSD redemptions SDK reference

Import from `@mezo-dev-kit/musd-redemptions` after building the private workspace.
The [README](README.md) owns provider, runtime and support requirements. These are
classic TroveManager redemptions; borrower repayment is in Borrowing.

## Functions and methods

| API                                                                                | Inputs and behavior                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calculateRedemptionLot({ remainingRequested, entireDebt, gasCompensation })`      | uint256 MUSD base units; returns the smaller of remaining request and debt minus reserve. Rejects debt below reserve.                                                                                                                                                                                           |
| `calculateRedemptionCollateral({ musdLot, price })`                                | MUSD base units and positive protocol USD/BTC price at 18 decimals; returns floor-rounded native BTC base units.                                                                                                                                                                                                |
| `calculateRedemptionFee({ collateralDrawn, redemptionRate })`                      | Applies a rate from zero through 1e18 to aggregate actual gross collateral; floors once.                                                                                                                                                                                                                        |
| `calculateRedemptionPartialLimit({ remainingRequested, netDebt, minimumNetDebt })` | Caps a partial at net debt minus minimum, or zero when there is no capacity. A full redemption uses the separate lot calculation.                                                                                                                                                                               |
| `createRedemptionReader(config)`                                                   | Mainnet `networkId`, Contracts `registry`, Core `RpcTransport`; returns `RedemptionReader`.                                                                                                                                                                                                                     |
| `reader.read({ account, borrowers?, blockNumber? })`                               | Coherent settlement snapshot; at most 64 unique nonzero borrower addresses. Omitting borrowers reads no position inventory. Omitting block chooses one head.                                                                                                                                                    |
| `reader.quote(input)`                                                              | Validates eligibility and attempted balance, scans up to `maxTailScan` tail entries (1–64), calls canonical HintHelpers with `maxIterations` (1–64), and obtains partial reinsertion hints with `trials` (1–1000) and explicit uint256 `seed`. Throws when coverage is exhausted or no redemption is available. |
| `createRedemptionTraceSimulator(config)`                                           | Explicit request/transport and provider identity plus timeout, frame/log/depth/byte budgets; returns `RedemptionOutputSimulator`.                                                                                                                                                                               |
| `simulator.simulate({ call, coordinate })`                                         | Read-only exact zero-value TroveManager redemption trace, including sender and nonce. Requires one successful canonical Redemption log and stable chain/hash. Reverted subtrees cannot contribute events. Returns actual aggregate amounts.                                                                     |
| `decodeRedemptionAmounts({ logs, contract, coordinate })`                          | Decodes exactly one canonical Redemption event; checks positive actual amount, actual ≤ attempted, and fee ≤ gross. It does not independently prove receipt success, runtime, or log provenance.                                                                                                                |
| `createRedemptionWriter(config)`                                                   | Reader, Core execution client, output simulator and RPC transport.                                                                                                                                                                                                                                              |
| `writer.prepare({ operationId, quote, bounds })`                                   | Reads a fresh quote, checks explicit positive output minimums/rate limit, and creates zero-value calldata. No wallet call or approval.                                                                                                                                                                          |
| `writer.simulate(prepared)`                                                        | Checks exact protocol state and trace output. Core retains the same verifier for final simulation. Prepared objects and simulations belong to this writer instance.                                                                                                                                             |
| `writer.submit(prepared, simulated)`                                               | Revalidates fresh bounded quote, balance/rate/age and exact output before Core invokes the selected wallet. Returns a durable submission record, not completion.                                                                                                                                                |
| `writer.reconcile(prepared, record)`                                               | Core confirmation and canonical receipt verification, predecessor/post-state reads, fee-corrected native balances, MUSD burns/mints, pool accounting and affected positions. Restored matching prepared intent and record can be reconciled without re-submitting.                                              |

Every financial helper rejects uint256 overflow/underflow and uses integer floor
semantics. The helper quote is an estimate; partial cancellation and iteration
limits can leave requested MUSD unburned. Interest between quote and inclusion
also changes a full redemption's exact debt. `amountMode: "requested"` can retain
headroom for a bounded full fill; the account must hold the entire attempted sum.

Trace budgets are explicit positive safe integers: `timeoutMs` ≤ 60000,
`maxFrames`/`maxLogs` ≤ 4096, `maxDepth` ≤ 64, `maxDataBytes` ≤ 4194304.
The adapter's timeout limits waiting; the application owns cancellation of the
underlying request. Unsupported, incomplete, reverted or oversized traces reject.

## Public types and results

| Type                                                                         | Contract                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RedemptionReaderConfig`, `RedemptionReader`                                 | Mainnet registry/transport configuration and `read`/`quote` methods.                                                                                                                                                                                                                                                                      |
| `RedemptionPosition`                                                         | Borrower address, Borrowing's normalized entire position, and separately claimable surplus.                                                                                                                                                                                                                                               |
| `RedemptionSnapshot`                                                         | Verified `borrowing` snapshot, explicitly requested `positions`, governed redemption rate/TroveManager burn permission, redeemer and PCV native balances, PCV/GasPool/token supply, Active/Default Pool collateral/principal/interest, interest numerator/timestamp and accrued system interest. No completeness claim for all borrowers. |
| `RedemptionQuoteInput`                                                       | Account, positive requested MUSD, optional `amountMode` (`truncate` default or `requested`), iteration/tail/trial budgets, seed and optional block.                                                                                                                                                                                       |
| `RedemptionQuote`                                                            | Snapshot, captured input, attempted and helper-truncated amounts, first/upper/lower addresses, partial nominal ratio, returned seed and tail entries checked. Candidate positions follow NICR list order; eligibility is current ICR.                                                                                                     |
| `RedemptionAmounts`                                                          | `attemptedAmount`, `actualAmount`, `grossCollateral`, `collateralFee`, `netCollateral`. MUSD and BTC use 18-decimal base units; attempted and actual are separate.                                                                                                                                                                        |
| `RedemptionLog`                                                              | Address, topics and ABI data. Raw externally supplied logs are not receipt proof.                                                                                                                                                                                                                                                         |
| `RedemptionTraceInput`, `RedemptionOutputSimulator`, `RedemptionTraceConfig` | Exact Core call/coordinate, asynchronous amount verifier, and explicit trace-provider/budget inputs. Custom simulators must faithfully execute the exact call at that coordinate.                                                                                                                                                         |
| `RedemptionBounds`                                                           | Positive `minActualAmount`, positive `minNetCollateral`, `maxRedemptionRate` (0–1e18), and nonnegative `maxBlockAge`. These are preflight policy, not contract-enforced output guarantees.                                                                                                                                                |
| `PreparedRedemption`                                                         | Captured quote/bounds and exact Core `transaction` intent.                                                                                                                                                                                                                                                                                |
| `RedemptionWriterConfig`, `RedemptionWriter`                                 | Injected reader/execution/simulator/transport and four lifecycle methods.                                                                                                                                                                                                                                                                 |
| `RedemptionOutcome`                                                          | Actual amounts, post-state snapshot, native `gasFee`, full/partial borrower lists and `boundsSatisfied`. False means verified inclusion output fell outside caller policy.                                                                                                                                                                |
| `ReconciledRedemption`                                                       | `state: "reconciled"`, durable record, canonical receipt and outcome.                                                                                                                                                                                                                                                                     |
| `RedemptionError`, `RedemptionErrorCode`                                     | `InvalidInput`, `IdentityMismatch`, `LimitExceeded`, `UnavailableRedemption`, `SimulationUnavailable`, `SimulationFailed`, `BoundExceeded`, `ReconciliationMismatch`. EVM, Borrowing, Core and transport errors preserve their owners.                                                                                                    |

Reconciliation refuses missing historical/fee evidence, changed identities, and
ambiguous same-block balance changes. It reports logged affected positions;
interest materialization on skipped entries without events is not a full queue
inventory. A hash or successfully traced call does not prove inclusion.

## Examples

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
const record = await writer.submit(prepared, await writer.simulate(prepared));
const observation = await execution.observe(record);
if (observation.state === "confirmed") {
  const result = await writer.reconcile(prepared, observation.record);
  console.log(result.outcome.amounts, result.outcome.boundsSatisfied);
}
```

The explicit minimums above are illustrative application policy. Real inputs
come from the user's decision and the fresh quote/trace. Do not automatically
resubmit a failed, uncertain or insufficient-output operation.

Geth marks a call frame's empty `output` as optional; omission is accepted for
this void operation, while explicit null or nonempty output is rejected. See
[Geth's callTracer implementation](https://github.com/ethereum/go-ethereum/blob/master/eth/tracers/native/call.go)
and [built-in tracer documentation](https://geth.ethereum.org/docs/developers/evm-tracing/built-in-tracers).
The successful canonical Redemption event remains mandatory.

Tail/iteration/trial budgets bound SDK queue work. SortedTroves' internal
`findInsertPosition` search has no explicit iteration parameter; applications
must also bound RPC execution time/gas. Exhausting that provider budget is an
unavailable quote, never permission to invent insertion hints.
