# MUSD borrowing SDK reference

Use `@mezo-dev-kit/musd-borrowing` to inspect a classic MUSD borrowing position, calculate its debt
and collateral ratios, and prepare borrower operations on Mezo mainnet.

A **trove** is a borrower’s collateral and debt position. The **individual collateral ratio (ICR)**
compares its collateral value with its debt; the **total collateral ratio (TCR)** applies to the
whole classic borrowing system. The **nominal collateral ratio (NICR)** is the separate ratio used
to order positions and obtain insertion hints.

Start with `createBorrowingReader` for state, `forecastBorrowing` for a calculation on that state,
or `createBorrowingWriter` for the transaction lifecycle. Native BTC and MUSD amounts use 18-decimal
bigint base units; the calculation section specifies the other scales.

See [package scope and fork limitations](README.md),
[workspace setup](../../../docs/reference/sdk.md), and the
[borrowing walkthrough](../../../examples/borrow-musd/README.md).

On this page:

- [Reader](#reader)
- [Pure functions](#pure-functions)
- [Writer](#writer)
- [Example](#example)
- [Errors and limits](#errors-and-limits)
- [Verification scope](#verification-scope)

## Reader

### `createBorrowingReader` — configure account reads

`createBorrowingReader(config: BorrowingReaderConfig): BorrowingReader` takes
`networkId: "mezo-mainnet"`, a public `ContractRegistry`, and Core's `RpcTransport`. Use
`createRpcTransport({ id, request })` to adapt an application-owned JSON-RPC request function. No
wallet or custom borrowing codec is required for reads.

### `reader.read`

Read one borrower’s position and the system state used to evaluate it.

**Input:** `{ account, blockNumber? }`

**Result:** `Promise<BorrowingSnapshot>`; omitted block selects a head. Required failures reject.

### `reader.hints`

Find neighboring positions for an insertion into the ordered list, using an explicit sampling budget
and seed.

**Input:** `{ snapshot, nominalRatio, trials, seed }`

**Result:** `Promise<BorrowingHints>` with `upper`, `lower`, and returned `seed`. Trials must be
1–1000; seed is explicit.

### Understanding the snapshot

`BorrowingSnapshot` combines the requested position with system inputs:

| Fields                                                              | Meaning                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `account`, `coordinate`, `timestamp`, `contracts`                   | Borrower, network/chain/block/hash, observation time and resolved deployments. |
| `position`                                                          | The normalized borrower position described below.                              |
| `price`, `systemCollateral`, `systemDebt`, `tcr`                    | Protocol price and system-wide collateral/debt accounting.                     |
| `recoveryMode`, `troveCount`, `mcr`, `ccr`                          | System mode, position count and minimum/critical collateral ratios.            |
| `gasCompensation`, `minimumNetDebt`                                 | Debt reserve and minimum net debt used by eligibility checks.                  |
| `borrowingRate`, `refinancingFeePercentage`, `offeredAnnualRateBps` | Current fee and rate inputs, using the scales below.                           |
| `feeExempt`, `canMint`, `canBurn`                                   | Account fee and token-authority observations.                                  |
| `musdBalance`, `surplus`                                            | Wallet MUSD and separately claimable collateral surplus.                       |

### Position debt and status

`BorrowingPosition` keeps stored values separate from the full current amounts:

| Fields                                                       | Meaning                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `status`                                                     | Whether the position exists, is active, or has closed.                      |
| `storedCollateral`, `storedPrincipal`, `storedInterest`      | Values in the stored position record.                                       |
| `collateral`, `principal`, `interest`, `debt`, `netDebt`     | Normalized entire position and debt totals.                                 |
| `pendingCollateral`, `pendingPrincipal`, `pendingInterest`   | Pending redistribution components, already included in the entire position. |
| `accruedInterest`, `annualRateBps`, `lastInterestUpdateTime` | Elapsed interest, annual rate and update time.                              |
| `maxBorrowingCapacity`, `stake`, `ownerArrayIndex`           | Stored capacity and position-accounting identifiers.                        |

`BorrowerStatus` is `nonexistent`, `active`, `closed-by-owner`, `closed-by-liquidation`, or
`closed-by-redemption`.

### Accounting details

The first three `getEntireDebtAndColl` outputs already include pending redistribution and elapsed
interest. The SDK checks their agreement with the stored tuple; adding those components again is
incorrect. Hint NICR uses principal, including the reserve, and excludes interest.

Debt-increasing adjustments emit zero in the event's interest field even when materialized interest
remains in the position. Close emits zero rate/time while the closed record retains historical rate,
timestamp and capacity. The SDK handles both source-specific cases; use position status and debt to
interpret closed records, and never reconstruct live debt from the event alone.

## Pure functions

All financial quantities are bigint base units. Native BTC and MUSD use 18 decimals here; price and
collateral ratios use 1e18 precision, NICR uses 1e20, annual rates use basis points, refinance
percentage uses integer percent. Arithmetic follows Solidity uint256 intermediate overflow/underflow
and floor division. The protocol year is 31,556,952 seconds.

### Collateral value and ratios

#### `calculateCollateralValue`

Value collateral at the supplied protocol price.

**Arguments → result:** `(collateral, price) → bigint`

#### `calculateCollateralRatio`

Compare collateral value with debt at the supplied price.

**Arguments → result:** `(collateral, debt, price) → bigint`; zero debt returns uint256 max.

#### `calculateNominalCollateralRatio`

Calculate the price-independent ratio used for position ordering.

**Arguments → result:** `(collateral, principal) → bigint`; zero principal returns uint256 max.

### Interest and fees

#### `calculateSimpleInterest`

Accrue simple interest for an explicit elapsed duration.

**Arguments → result:** `(principal, annualRateBps, elapsedSeconds) → bigint`; rate must fit uint16.

#### `calculateBorrowingFee`

Calculate the fee on a requested debt increase using the supplied borrowing rate.

**Arguments → result:** `(requestedDebt, borrowingRate) → bigint`

#### `calculateRefinancingFee`

Calculate the refinancing fee while preserving the contract’s two rounding steps.

**Arguments → result:** `(netDebt, percentage, borrowingRate) → bigint`; preserves both floors;
percentage fits uint8.

### Capacity, payments and redistribution

#### `calculateBorrowingCapacity`

Calculate debt capacity for the supplied collateral, price and minimum ratio.

**Arguments → result:** `(collateral, price, minimumCollateralRatio) → bigint`; denominator must be
positive.

#### `splitDebtPayment`

Apply payment to interest first, then return the remaining principal adjustment.

**Arguments → result:** `(interestOwed, payment) → { principalAdjustment, interestAdjustment }`;
interest first.

#### `calculatePendingReward`

Calculate a position’s pending redistribution amount from its stake and cumulative index change.

**Arguments → result:** `(stake, cumulative, snapshot) → bigint`

### Normalize and forecast a position

#### `normalizeBorrowingPosition`

Combine stored and entire-position getter results into a checked position model.

**Arguments → result:** `({ stored, entire, timestamp, gasCompensation }) → BorrowingPosition`;
validates the 9-value Troves and 6-value entire tuples.

#### `forecastBorrowing`

Preview an action against a snapshot and the caller’s bounds without sending a transaction.

**Arguments → result:** `(snapshot, action, bounds) → BorrowingForecast`; checks eligibility and
caller bounds.

### Interpreting a forecast

`BorrowingForecast` returns post-operation `collateral`, `principal`, `interest`, `debt`, `fee`,
`annualRateBps`, `maxBorrowingCapacity`, `icr`, `nicr`, `postTcr`, and `repay`. It describes the
snapshot timestamp, not a guaranteed execution result. Topups retain stored capacity; debt increases
must fit capacity including interest; withdrawals can reduce capacity; refinance recalculates
capacity and takes the offered rate.

## Writer

### `createBorrowingWriter` — prepare borrower actions

`createBorrowingWriter(config: BorrowingWriterConfig): BorrowingWriter` takes `reader` and
`execution: ExecutionClient`. Core's signer is required only for simulation/submission. Pass an
explicit account; it must match the signer.

### `writer.prepare`

Read current state and build the exact transaction intent, including the action’s checks and bounds.

**Input → result:**
`{ operationId, account, action, bounds, trials, seed } → Promise<PreparedBorrowing>`

### `writer.simulate`

Simulate the prepared transaction before requesting submission. Use the preparation created by this
writer.

**Input → result:** `(prepared) → Promise<SimulatedTransaction>`

### `writer.submit`

Submit the matching prepared and simulated operation. Retain the returned record for confirmation
and recovery.

**Input → result:** `(prepared, simulated) → Promise<SubmissionRecord>`; rereads state and checks
the forecast immediately before Core's final exact simulation.

### `writer.reconcile`

Verify the confirmed transaction against the saved intent and protocol outcome.

**Input → result:** `(prepared, record) → Promise<ReconciledBorrowing>`; requires confirmed exact
transaction, borrower event and matching end-of-block state.

### Prepared intent and recovery

`PreparedBorrowing` holds `snapshot`, `action`, `bounds`, `forecast`, `transaction`, and `hints`
(null for close/claim). Prepare and simulate with the same writer instance; foreign or reused
simulations cannot be submitted. Reconciliation can use a restored intent plus Core's validated JSON
resume record, provided the application's intent restoration validates bigint fields.

### Choose an action

| `BorrowingAction.kind` | Additional fields                                                       | Contract method   |
| ---------------------- | ----------------------------------------------------------------------- | ----------------- |
| `open`                 | `collateral`, `borrow`                                                  | `openTrove`       |
| `add-collateral`       | `collateral`                                                            | `addColl`         |
| `withdraw-collateral`  | `collateral`                                                            | `withdrawColl`    |
| `borrow`               | `amount`                                                                | `withdrawMUSD`    |
| `repay`                | `amount`                                                                | `repayMUSD`       |
| `adjust`               | `depositCollateral`, `withdrawCollateral`, `debtChange`, `increaseDebt` | `adjustTrove`     |
| `refinance`            | none                                                                    | `refinance`       |
| `close`                | none                                                                    | `closeTrove`      |
| `claim-surplus`        | none                                                                    | `claimCollateral` |

### Caller bounds and actual outcomes

`BorrowingBounds` requires `maxFee`, `maxAnnualRateBps`, `minCollateralRatio`, and `maxBlockAge`,
all bigint. These are preflight checks: the deployed methods have no equivalent on-chain
max-fee/deadline argument. State may change before inclusion. Reconciliation reports actual `fee`,
`collateralClaimed` (surplus only, otherwise zero), `snapshot`, `kind`, and `boundsSatisfied` in
`BorrowingOutcome`. Inspect this flag even after successful execution. `ReconciledBorrowing` also
includes `state`, `record`, and `receipt`.

Repay and close burn MUSD directly through BorrowerOperations. They need sufficient MUSD and burn
permission, **no ERC-20 approval**. Closing also needs fees/accrued interest beyond the original
minted amount, a remaining other trove, and admissible system ratios. Native BTC collateral needs no
allowance.

## Example

This excerpt opens a position with illustrative collateral, debt and bounds. Supply a bounded RPC
request function, the selected wallet, an atomic durable journal, a unique operation ID and
confirmation handling. Obtain consent for the exact prepared transaction before submitting:

```ts
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createExecutionClient, createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest, SubmissionStore, SubmissionRecord } from "@mezo-dev-kit/core";
import { parseUnitsExact } from "@mezo-dev-kit/evm";
import { createBorrowingReader, createBorrowingWriter } from "@mezo-dev-kit/musd-borrowing";

declare const request: RpcRequest; // Application-owned RPC, with timeout/cancellation.
declare const walletRequest: RpcRequest; // Connected wallet's request method.
declare const journal: SubmissionStore; // Durable atomic intent and nonce reservation.
declare const account: `0x${string}`; // Explicit selected borrower.
declare const operationId: string; // Unique, persisted application intent ID.
declare function waitForConfirmation(record: SubmissionRecord): Promise<void>;

const network = getNetwork("mezo-mainnet");

const registry = createContractRegistry();

const transport = createRpcTransport({ id: "application-rpc", request });

const reader = createBorrowingReader({ networkId: "mezo-mainnet", registry, transport });

const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request: walletRequest }),
  store: journal,
  maxBlockAge: 2n,
  confirmations: 2n,
});

const writer = createBorrowingWriter({ reader, execution });

const prepared = await writer.prepare({
  operationId,
  account,
  action: {
    kind: "open",
    collateral: parseUnitsExact("0.1", 18),
    borrow: parseUnitsExact("2000", 18),
  },
  bounds: {
    maxFee: parseUnitsExact("5", 18),
    maxAnnualRateBps: 1000n,
    minCollateralRatio: parseUnitsExact("2", 18),
    maxBlockAge: 2n,
  },
  trials: 30n,
  seed: 42n,
});

const simulated = await writer.simulate(prepared);

// Present the exact prepared operation for the application's transaction consent.
const record = await writer.submit(prepared, simulated);

await waitForConfirmation(record); // Application polls execution.observe with a bounded policy.

const result = await writer.reconcile(prepared, record);

console.log(result.outcome.snapshot.position, result.outcome.boundsSatisfied);
```

Inspect both the resulting position and `boundsSatisfied`. These contract calls do not encode all
caller bounds, so a confirmed transaction still needs outcome reconciliation. The values above
illustrate the API and are not a recommendation for a borrowing position.

To repay, prepare `{ kind: "repay", amount }`; use `{ kind: "close" }` for full closure. Create a
new persisted operation ID each time. A thrown `SubmissionUncertain` from Core includes its reserved
`record`; recover the hash/nonce with `execution.inspectHash` and observe it instead of
resubmitting.

## Errors and limits

`BorrowingError` carries `BorrowingErrorCode` and a message/cause. Codes are `InvalidInput`,
`InvalidState`, `UnsupportedDeployment`, `IneligibleOperation`, `BoundsExceeded`, `StaleState`, and
`ReconciliationMismatch`.

- Correct input or eligibility failures before preparing again.
- For stale state, obtain a fresh snapshot and re-evaluate the intended action.
- Preserve an included transaction’s record when reconciliation fails; investigate its events and
  state instead of resubmitting it. Underlying EVM, Contracts and Core boundary errors retain their
  own typed identities.

Required read failure, changed runtime/proxy/topology, nonpositive oracle answer, wrong
signer/network, stale preparation, insufficient balance, minimum-debt/capacity violations, and
invalid recovery-mode operations fail explicitly. A successful receipt with missing/conflicting
borrower events or later same-block position changes does not become reconciled. No reader failure
becomes an assumed zero balance or an actionable quote.

## Verification scope

Build the workspace before running the opt-in harness from the repository root.

For the explicit local integration harness, start a fresh Anvil fork using a mainnet RPC URL and an
exact block number, with chain ID from Chains. Then run:

```sh
node packages/protocols/musd-borrowing/test/fork.ts http://127.0.0.1:18545 "$MEZO_READ_RPC"
```

The harness refuses a non-local target or a non-Anvil client. It captures the native oracle's two
read responses at the fork block and installs a labelled response fixture because Anvil cannot
execute Mezo's native precompile. It uses local account impersonation to fund close fees and create
surplus through actual pool entrypoints. Borrowing contract code is unchanged; local fixture state
is reverted afterward. This proves the EVM writer integration with the fixture, not Mezo's native
oracle implementation or redemption execution.
