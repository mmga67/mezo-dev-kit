# MUSD borrowing SDK reference

Import from `@mezo-dev-kit/musd-borrowing`. This private implementation targets
Mezo mainnet's deployment identity. See [scope and fork limitations](README.md)
and [workspace setup](../../../docs/reference/sdk.md).

## Reader

`createBorrowingReader(config: BorrowingReaderConfig): BorrowingReader` takes
`networkId: "mezo-mainnet"`, a public `ContractRegistry`, and Core's
`RpcTransport`. Use `createRpcTransport({ id, request })` to adapt an
application-owned JSON-RPC request function. No wallet or custom borrowing
codec is required for reads.

| Method         | Input                                      | Result                                                                                                         |
| -------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `reader.read`  | `{ account, blockNumber? }`                | `Promise<BorrowingSnapshot>`; omitted block selects a head. Required failures reject.                          |
| `reader.hints` | `{ snapshot, nominalRatio, trials, seed }` | `Promise<BorrowingHints>` with `upper`, `lower`, and returned `seed`. Trials must be 1–1000; seed is explicit. |

`BorrowingSnapshot` retains `account`, `coordinate` (network/chain/block/hash),
`timestamp`, resolved `contracts`, and `position`. Its system fields are
`price`, `systemCollateral`, `systemDebt`, `tcr`, `recoveryMode`, `troveCount`,
`gasCompensation`, `minimumNetDebt`, `mcr`, `ccr`, `borrowingRate`,
`refinancingFeePercentage`, `offeredAnnualRateBps`, `feeExempt`, `canMint`,
`canBurn`, `musdBalance`, and `surplus`.

`BorrowingPosition` contains `status`, `storedCollateral`, `storedPrincipal`,
`storedInterest`, entire `collateral`, `principal`, `interest`, the three
`pendingCollateral`/`pendingPrincipal`/`pendingInterest` components,
`accruedInterest`, `debt`, `netDebt`, `annualRateBps`,
`lastInterestUpdateTime`, `maxBorrowingCapacity`, `stake`, and `ownerArrayIndex`.
`BorrowerStatus` is `nonexistent`, `active`, `closed-by-owner`,
`closed-by-liquidation`, or `closed-by-redemption`.

The first three `getEntireDebtAndColl` outputs already include pending
redistribution and elapsed interest. The SDK checks their agreement with the
stored tuple; adding those components again is incorrect. Hint NICR uses
principal, including the reserve, and excludes interest.

Debt-increasing adjustments emit zero in the event's interest field even when
materialized interest remains in the position. Close emits zero rate/time while
the closed record retains historical rate, timestamp and capacity. The SDK
handles both source-specific cases; use position status and debt to interpret
closed records, and never reconstruct live debt from the event alone.

## Pure functions

All financial quantities are bigint base units. Native BTC and MUSD use 18
decimals here; price and collateral ratios use 1e18 precision, NICR uses 1e20,
annual rates use basis points, refinance percentage uses integer percent.
Arithmetic follows Solidity uint256 intermediate overflow/underflow and floor
division. The protocol year is 31,556,952 seconds.

| Function                          | Arguments → result                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `calculateCollateralValue`        | `(collateral, price) → bigint`                                                                                                  |
| `calculateCollateralRatio`        | `(collateral, debt, price) → bigint`; zero debt returns uint256 max.                                                            |
| `calculateNominalCollateralRatio` | `(collateral, principal) → bigint`; zero principal returns uint256 max.                                                         |
| `calculateSimpleInterest`         | `(principal, annualRateBps, elapsedSeconds) → bigint`; rate must fit uint16.                                                    |
| `calculateBorrowingFee`           | `(requestedDebt, borrowingRate) → bigint`                                                                                       |
| `calculateRefinancingFee`         | `(netDebt, percentage, borrowingRate) → bigint`; preserves both floors; percentage fits uint8.                                  |
| `calculateBorrowingCapacity`      | `(collateral, price, minimumCollateralRatio) → bigint`; denominator must be positive.                                           |
| `splitDebtPayment`                | `(interestOwed, payment) → { principalAdjustment, interestAdjustment }`; interest first.                                        |
| `calculatePendingReward`          | `(stake, cumulative, snapshot) → bigint`                                                                                        |
| `normalizeBorrowingPosition`      | `({ stored, entire, timestamp, gasCompensation }) → BorrowingPosition`; validates the 9-value Troves and 6-value entire tuples. |
| `forecastBorrowing`               | `(snapshot, action, bounds) → BorrowingForecast`; checks eligibility and caller bounds.                                         |

`BorrowingForecast` returns post-operation `collateral`, `principal`,
`interest`, `debt`, `fee`, `annualRateBps`, `maxBorrowingCapacity`, `icr`,
`nicr`, `postTcr`, and `repay`. It describes the snapshot timestamp, not a
guaranteed execution result. Topups retain stored capacity; debt increases
must fit capacity including interest; withdrawals can reduce capacity;
refinance recalculates capacity and takes the offered rate.

## Writer

`createBorrowingWriter(config: BorrowingWriterConfig): BorrowingWriter` takes
`reader` and `execution: ExecutionClient`. Core's signer is required only for
simulation/submission. Pass an explicit account; it must match the signer.

| Method             | Input → result                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `writer.prepare`   | `{ operationId, account, action, bounds, trials, seed } → Promise<PreparedBorrowing>`                                                        |
| `writer.simulate`  | `(prepared) → Promise<SimulatedTransaction>`                                                                                                 |
| `writer.submit`    | `(prepared, simulated) → Promise<SubmissionRecord>`; rereads state and checks the forecast immediately before Core's final exact simulation. |
| `writer.reconcile` | `(prepared, record) → Promise<ReconciledBorrowing>`; requires confirmed exact transaction, borrower event and matching end-of-block state.   |

`PreparedBorrowing` holds `snapshot`, `action`, `bounds`, `forecast`,
`transaction`, and `hints` (null for close/claim). Prepare and simulate with the
same writer instance; foreign or reused simulations cannot be submitted.
Reconciliation can use a restored intent plus Core's validated JSON resume
record, provided the application's intent restoration validates bigint fields.

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

`BorrowingBounds` requires `maxFee`, `maxAnnualRateBps`,
`minCollateralRatio`, and `maxBlockAge`, all bigint. These are preflight checks:
the deployed methods have no equivalent on-chain max-fee/deadline argument.
State may change before inclusion. Reconciliation reports actual `fee`,
`collateralClaimed` (surplus only, otherwise zero), `snapshot`, `kind`, and
`boundsSatisfied` in `BorrowingOutcome`. Inspect this flag even after successful
execution. `ReconciledBorrowing` also includes `state`, `record`, and `receipt`.

Repay and close burn MUSD directly through BorrowerOperations. They need
sufficient MUSD and burn permission, **no ERC-20 approval**. Closing also needs
fees/accrued interest beyond the original minted amount, a remaining other
trove, and admissible system ratios. Native BTC collateral needs no allowance.

## Example

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

To repay, prepare `{ kind: "repay", amount }`; use `{ kind: "close" }` for full
closure. Create a new persisted operation ID each time. A thrown
`SubmissionUncertain` from Core includes its reserved `record`; recover the
hash/nonce with `execution.inspectHash` and observe it instead of resubmitting.

## Errors and limits

`BorrowingError` carries `BorrowingErrorCode` and a message/cause. Codes are
`InvalidInput`, `InvalidState`, `UnsupportedDeployment`, `IneligibleOperation`,
`BoundsExceeded`, `StaleState`, and `ReconciliationMismatch`. Underlying EVM,
Contracts and Core boundary errors retain their own typed identities.

Required read failure, changed runtime/proxy/topology, nonpositive oracle
answer, wrong signer/network, stale preparation, insufficient balance,
minimum-debt/capacity violations, and invalid recovery-mode operations fail
explicitly. A successful receipt with missing/conflicting borrower events or
later same-block position changes does not become reconciled. No reader
failure becomes an assumed zero balance or an actionable quote.
