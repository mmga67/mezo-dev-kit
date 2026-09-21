# Institutional MUSD debt SDK reference

Use `@mezo-dev-kit/musd-institutional-debt` to inspect institutional MUSD positions, calculate debt
and fees, and read Enclave authority and recorded custody inputs. The package supplies read
operations and local calculations.

An **Enclave** is the custody contract associated with a position. A **pledge** links a locked veBTC
token to that position; its locked principal contributes collateral, while its boost is separate. A
recorded **UTXO** identifies a Bitcoin transaction output, but the record alone does not prove that
output is currently unspent.

Start with `createInstitutionalReader` to read explicitly selected position IDs. Global debt comes
from its own accumulators, so it is not the sum of the selected rows. Institutional totals are
separate from classic borrowing’s collateral ratios, Recovery Mode and Stability Pool.

See [package scope](README.md),
[institutional knowledge](../../../knowledge/protocols/musd/institutional-debt/README.md), and
[contract identity](../../contracts/REFERENCE.md).

On this page:

- [Deterministic calculations](#deterministic-calculations)
- [Positions and totals](#positions-and-totals)
- [Enclave authority and recorded UTXOs](#enclave-authority-and-recorded-utxos)
- [Errors and limits](#errors-and-limits)

## Deterministic calculations

All financial inputs/outputs are bigint base units and checked Solidity uint256 unless a narrower
width is stated. MUSD and locked BTC amounts use 18 decimals; annual rates use uint16 basis points.
No helper reads a clock, wallet or RPC.

### `calculateInstitutionalFee`

Floors the checked elapsed × principal × annual rate product over the canonical basis-point/year
denominator. The protocol year is 31,556,952 seconds. Returns newly accrued fee.

**Call:** `calculateInstitutionalFee({elapsedSeconds, principal, rateBps})`

### `calculateInstitutionalPositionDebt`

Reads explicit `asOf`, `lastUpdateTimestamp`, `principal`, `storedInterest`, `storedOriginatorFee`,
`interestRateBps`, `originatorFeeRateBps`. Returns `InstitutionalPositionDebt`. Each fee floors
separately; non-advancing time or zero rate accrues zero. Zero principal returns zero debt, matching
the deployed getter.

**Call:** `calculateInstitutionalPositionDebt(input: InstitutionalDebtInput)`

### `calculateInstitutionalAccrual`

The `InstitutionalAccumulator` numerator is the aggregate sum of principal × rate. Floors elapsed ×
numerator over the canonical denominator. Zero numerator returns zero; a nonzero accumulator with
future update time rejects.

**Call:** `calculateInstitutionalAccrual({numerator, lastUpdateTime, asOf})`

### `calculateInstitutionalOutstandingDebt`

Adds principal to max(stored + combined accrued fees − settled fees, 0). The clamp accounts for
independent aggregate/position floors.

**Call:**
`calculateInstitutionalOutstandingDebt({totalPrincipal, totalFeesStored, accrued, totalFeeSettled})`

### `calculateInstitutionalHealth`

Returns `InstitutionalHealth`: `currentCr`, both thresholds and `belowWarning`/`belowMinimum`. Price
uses deployed 18-decimal BTC/USD scaling; ratio/thresholds use 18 decimals. Equality is not below.
Zero debt returns max uint256, not a finite financial ratio.

**Call:** `calculateInstitutionalHealth({collateral, price, debt, warningCr, minimumCr})`

### `calculateInstitutionalRepayment`

Returns `InstitutionalRepayment`. Rejects payment below all fees or principal overpayment; otherwise
returns fee payment, principal payment and remaining principal. It is a calculation, not a prepared
transaction.

**Call:** `calculateInstitutionalRepayment({principal, totalFees, payment})`

### `isInstitutionalRateWithinCap`

Validates uint16 inputs and compares their widened sum inclusively against the current cap. Returns
boolean.

**Call:**
`isInstitutionalRateWithinCap({interestRateBps, originatorFeeRateBps, maxCombinedRateBps})`

### Debt and repayment results

`InstitutionalPositionDebt` contains `principal`, `newInterest`, `newOriginatorFee`,
`accruedInterest` (stored plus new), `accruedOriginatorFee` and `totalDebt`. Fees are debt until
settled; fee minting is distinct from principal minting/burning. `InstitutionalRepayment` is either
`{accepted: true, feePayment, principalPayment, remainingPrincipal}` or
`{accepted: false, reason: 'payment-below-fees' | 'principal-payment-exceeds-principal'}`.

Accrue interest and originator fees for a synthetic position, then allocate a proposed repayment:

```ts
import {
  calculateInstitutionalPositionDebt,
  calculateInstitutionalRepayment,
} from "@mezo-dev-kit/musd-institutional-debt";

const debt = calculateInstitutionalPositionDebt({
  principal: 1000n * 10n ** 18n,
  storedInterest: 0n,
  storedOriginatorFee: 0n,
  interestRateBps: 100n,
  originatorFeeRateBps: 25n,
  lastUpdateTimestamp: 1000n,
  asOf: 2593000n,
});

const repayment = calculateInstitutionalRepayment({
  principal: debt.principal,
  totalFees: debt.accruedInterest + debt.accruedOriginatorFee,
  payment: 100n * 10n ** 18n,
});

console.log(debt.totalDebt, repayment);
```

Inspect `repayment.accepted` before using the payment breakdown. The calculation requires all fees
to be covered before reducing principal and does not prepare a transaction.

## Positions and totals

### `createInstitutionalReader` — configure verified reads

`createInstitutionalReader(config: InstitutionalReaderConfig): InstitutionalReader` requires
`networkId: 'mezo-mainnet'`, a Contracts registry and Core `RpcTransport`. The application owns RPC
URL, timeout, concurrency and response-byte limits. There is no signer. Each method chooses one
block or accepts bigint `blockNumber`, verifies chain, root/implementation code and proxy slots, and
rechecks the final block hash/chain. Decoded getter responses are limited to 1 MiB.

### `reader.read` — inspect selected positions

`reader.read({positionIds, blockNumber?}): Promise<InstitutionalSnapshot>` accepts 0–16 distinct
bytes32 position IDs. Empty IDs reads only global state. A requested subset is explicitly
`positionCoverage: 'requested-ids-only'`; the reader does not claim to enumerate all positions.
Global debt uses independent accumulators, not the sum of requested rows.

### Snapshot identity and governed parameters

`InstitutionalSnapshot` returns both global observations and the selected rows:

| Fields                                             | Meaning                                                                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `coordinate`, `timestamp`, `providerId`            | Block identity, bigint Unix seconds and provider.                                  |
| `manager`, `musd`, `veBtc`, `priceFeed`, `pcv`     | Verified debt-manager and dependency addresses.                                    |
| `paused`, `mintCap`, `maxCombinedRateBps`          | Current operation, minting and combined-rate parameters.                           |
| `maxPledgedVeBtc`, `minimumMinimumCr`              | Governed pledge-count and minimum-ratio parameters.                                |
| `totals`, `positions`, `price`, `positionCoverage` | Global debt, requested positions, price availability and explicit subset coverage. |

The governed pledge cap must fit the reader’s 20-token per-position budget. A rate above a
subsequently lowered cap remains visible as observed state; the reader does not rewrite the
position.

### Global debt totals

`InstitutionalTotals` uses independent global accumulators:

| Fields                                                      | Meaning                                                |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `totalPrincipal`, `totalMintedDebt`, `totalDebtBurned`      | Principal and its mint/burn conservation counters.     |
| `totalInterestMinted`, `totalOriginatorFeeMinted`           | Fee minting counters, separate from principal minting. |
| `totalFeesStored`, `totalFeeSettled`                        | Stored and settled fee accounting.                     |
| `interest`, `combinedFees`                                  | Interest-only and combined-fee accumulators.           |
| `accruedInterest`, `accruedCombinedFees`, `outstandingDebt` | Accrued global fees and resulting outstanding debt.    |

Principal conservation and exposed aggregate getters are checked independently.

### Position status and pledged collateral

Each `InstitutionalPosition` retains its ID; `InstitutionalPositionStatus` (`nonExistent`, `active`,
`closedByRepayment`, `closedByLiquidation`); `enclave`, `borrower`, `originator`; stored
principal/fee/timestamp/rates/thresholds; computed `debt`; verified `collateral`, `pledges`,
`enclaveRoleGranted` and `health`. The liquidation enum is representable storage, not an implemented
operation. Missing positions remain explicit `nonExistent` rows.

`InstitutionalPledge` preserves `tokenId`, ERC-721 `owner`, mapped `positionId`, nonnegative locked
`amount`, unlock `end`, `isPermanent` and raw `boost`. Only locked principal amount contributes to
collateral; boost is separate. Pledges must match the active position and its Enclave owner.
Duplicate or inconsistent mappings and debt/collateral getter disagreements reject the read.

### Price and health availability

`price` is `{state: 'available', amount, decimals: 18}` or
`{state: 'unavailable', reason: 'price-call-failed' | 'nonpositive-price'}`. Available health is
`{state: 'available', value: InstitutionalHealth}`; unavailable health preserves the price failure
reason. The deployed PriceFeed path supplies the price and the debt-manager health getter must
agree. Price availability does not establish a transaction freshness policy. Optional RPC failure
preserves verified debt/pledges; malformed returned price data rejects.

Read one position using an application-supplied transport and a known position ID:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createInstitutionalReader } from "@mezo-dev-kit/musd-institutional-debt";

declare const transport: RpcTransport;
declare const positionId: `0x${string}`;

const reader = createInstitutionalReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});

const state = await reader.read({ positionIds: [positionId] });

console.log(state.coordinate, state.totals.outstandingDebt);

for (const position of state.positions)
  console.log(position.status, position.debt, position.health);
```

The outstanding debt is the global total. The `positions` array covers only the requested ID, and
each position’s health has its own availability status.

## Enclave authority and recorded UTXOs

### `reader.readEnclave` — inspect authority and recorded UTXOs

`reader.readEnclave({generation, account, targets, maxUtxos?, blockNumber?})` returns
`EnclaveSnapshot`. `EnclaveGeneration` is `original` or `second`. Require a nonzero account and 0–32
distinct `EnclaveTarget` pairs, each with `address` and exact bytes4 `selector`. Query exact current
`isTarget` pairs; `targetCoverage: 'requested-pairs-only'` prevents treating the subset as the whole
allowlist. The second generation excludes generic veBTC/AssetsBridge targets.

### Enclave roles and target permissions

The snapshot includes coordinate/timestamp/provider, generation, Enclave `address`, queried
`account`, `btc`, `veBtc`, `assetsBridge`, `roles`, `targets`, coverage and `utxos`. Each role has
its canonical name, current bytes32 ID and account `granted` boolean. The second generation has a
separate `BRIDGE_MANAGER_ROLE`; the original model does not inherit it. Each target retains
address/selector and `allowed`. These observations do not grant execution consent or establish that
target-specific preconditions pass.

### Opt into bounded UTXO reads

Omit `maxUtxos` to get `{state: 'not-requested'}`. Otherwise supply integer 1–256; the unpaginated
getter must return no more than that count or the method rejects.
`{state: 'recorded', entries: EnclaveUtxo[]}` preserves bytes32 `txHash`, bigint uint32
`outputIndex` and bigint uint64 `outputValueSatoshis`. Duplicate outpoints reject. These are
recorded custody inputs, not Bitcoin unspent-state, cross-chain delivery or off-chain legal/custody
verification.

Inspect the second-generation Enclave for an account and one explicit address/selector pair. Supply
the configured reader and validated inputs:

```ts
import type { InstitutionalReader } from "@mezo-dev-kit/musd-institutional-debt";

declare const reader: InstitutionalReader;
declare const account: `0x${string}`;
declare const target: `0x${string}`;
declare const selector: `0x${string}`;

const enclave = await reader.readEnclave({
  generation: "second",
  account,
  targets: [{ address: target, selector }],
  maxUtxos: 64,
});

console.log(enclave.roles, enclave.targets, enclave.utxos);
```

The returned roles and target permission describe the queried account and pair. The UTXO result is
bounded recorded custody information, not independent Bitcoin unspent-state verification.

## Errors and limits

`InstitutionalDebtError` exposes `code: InstitutionalDebtErrorCode`: `InvalidInput`,
`IdentityMismatch`, `AccountingMismatch`, `LimitExceeded`. EVM validation, Contracts, Core runtime
and required transport errors can propagate. Do not retry an identity/accounting mismatch as an
executable action. The [read-only live probe](test/live.ts) verifies public imports, both
generations, position/aggregate reconciliation, unavailable price and changed runtime.
