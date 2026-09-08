# MUSD Savings SDK reference

Import from `@mezo-dev-kit/musd-savings`. This private workspace package reads
Savings positions and calculates indexed yield. See
[setup](../../../docs/reference/sdk.md) and the [package contract](README.md).
Classic MUSD borrowing belongs to a separate domain.

## Functions and reader method

| API                                   | Input → result                                                                       | Behavior                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `createSavingsReader(config)`         | `SavingsReaderConfig → SavingsReader`                                                | Configure a reader with `networkId`, public `registry`, `transport`, and `codec`. |
| `reader.read(input)`                  | `{ account, blockNumber? }` → promise of `Readonly<SavingsSnapshot>`                 | Read one account at an explicit bigint block or a head selected once.             |
| `calculateSavingsYield(input)`        | `SavingsYieldInput → Readonly<SavingsYield>`                                         | Separate stored, newly indexed, and total claimable yield.                        |
| `calculateSavingsDistribution(input)` | `{ amount, pendingYield, totalSupply, yieldIndex }` → `{ pendingYield, yieldIndex }` | Calculate the next index and buffered yield without sending a transaction.        |
| `error.toJSON()`                      | none → `{ code, field }`                                                             | Serialize a `SavingsReadError`.                                                   |

`account` is required. The current reader accepts `mezo-mainnet` and a
supported Savings deployment generation. The broader `NetworkId` type does
not promise other network implementations.

`SavingsYieldInput` requires bigint `balance` (sMUSD receipts), `yieldIndex`,
`supplyYieldIndex` (the account index), and `storedClaimableYield` (MUSD).
`SavingsYield` returns `storedClaimable`, `indexedUnclaimed`, and `claimable`,
each a `SavingsAmount<"MUSD">` with `unit` and `baseUnits`.

Distribution arguments are bigint: `amount` and `pendingYield` are MUSD base
units; `totalSupply` is sMUSD receipt base units; `yieldIndex` is the protocol's
index. Zero supply buffers the incoming amount. With nonzero supply a ratio
that rounds to zero throws `AmountTooSmall`. Pure helpers use checked uint256
intermediate arithmetic and the deployed floor order. A zero receipt balance
skips index subtraction; a positive balance with a larger account index fails.

## Adapter contract

`SavingsReadTransport` implements Core's `id`, `getChainId`, `getBlockNumber`,
and `getBlock`, plus the following methods (sync or async):

| Method                | Request / response                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `read(request)`       | `ReadCoordinate` plus `address`, `data`; raw return value. No `contractId` is required for discovered roles. |
| `getCode(request)`    | Coordinate plus `address`; runtime hex bytes.                                                                |
| `getStorage(request)` | Coordinate plus `address`, `slot`; storage word.                                                             |

`SavingsReadCodec.encodeRead(call)` receives `abi`, `functionName`, and address
`args`; it returns real EVM calldata. `decodeRead({ ...call, data })` returns
one scalar. Integers must decode to bigint and addresses to valid strings.
Every call, code read, and storage read must honor the same coordinate.

Runtime hashing uses Node crypto. No production ABI/RPC adapter, browser
bundle certification, wallet, retry, timeout, or cancellation policy is
provided. The application supplies those integrations and I/O policies.

## Example: inspect principal and yield

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { parseUserAddress } from "@mezo-dev-kit/evm";
import { createSavingsReader } from "@mezo-dev-kit/musd-savings";
import type { SavingsReadCodec, SavingsReadTransport } from "@mezo-dev-kit/musd-savings";

export async function readSavings(
  transport: SavingsReadTransport,
  codec: SavingsReadCodec,
  accountInput: unknown,
  blockNumber?: bigint,
) {
  const reader = createSavingsReader({
    networkId: "mezo-mainnet",
    registry: createContractRegistry(),
    transport,
    codec,
  });
  const snapshot = await reader.read({
    account: parseUserAddress(accountInput),
    ...(blockNumber === undefined ? {} : { blockNumber }),
  });
  const principal = snapshot.beneficialPrincipal;
  const wallet = snapshot.wallet;
  return {
    coordinate: snapshot.coordinate,
    principal: principal.status === "available" ? principal.value : principal.error,
    walletYield: wallet.status === "available" ? wallet.value.yield : wallet.error,
  };
}
```

```ts
import { calculateSavingsDistribution, calculateSavingsYield } from "@mezo-dev-kit/musd-savings";

// Synthetic accounting inputs, not a live position or yield forecast.
export const buffered = calculateSavingsDistribution({
  amount: 5n,
  pendingYield: 2n,
  totalSupply: 0n,
  yieldIndex: 0n,
}); // { pendingYield: 7n, yieldIndex: 0n }

export const emptyWalletYield = calculateSavingsYield({
  balance: 0n,
  yieldIndex: 0n,
  supplyYieldIndex: 0n,
  storedClaimableYield: 7n,
}); // claimable.baseUnits === 7n
```

See the [executable example](../../../examples/musd-savings-readonly/README.md)
for deterministic transport/codec composition and failure handling.

## Snapshot fields

| Field                                          | Meaning                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `coordinate`, `account`, `savings`, `evidence` | Block/hash, account/root identity, and input digest/review boundary.                               |
| `global`                                       | Principal supply, pending yield, yield index, and gauge yield claim cap.                           |
| `wallet`                                       | Wallet principal receipts and its stored/indexed/claimable yield.                                  |
| `strategy`, `converter`                        | Discovered, runtime-checked roles and their reverse links.                                         |
| `gauge`                                        | Beneficial stake, custody, total stake, reward-token identity, earnings, and cached voter revenue. |
| `beneficialPrincipal`                          | Wallet receipts plus the account's gauge stake, counted once.                                      |

Optional groups use `SavingsReadValue<T>`: available with `value`, or unavailable
with `{ code, field }`. Gauge `earnedRewards` and `cachedVoterRevenue` have their
own availability. An unavailable value is not zero. Gauge custody may include
donations and must not be added to an account's beneficial principal. Voter
revenue and gauge-token rewards are separate from wallet MUSD yield.

## Errors and public types

`SavingsReadError(code, field, options?)` preserves an optional `cause` and
exposes `code`, `field`, and `toJSON()`. Codes: `InvalidInput`, `InvalidReadValue`,
`UnsupportedNetwork`, `UnsupportedRole`, `TopologyMismatch`,
`InconsistentCoordinate`, `ReadUnavailable`, `ArithmeticOverflow`,
`InvalidIndex`, `AmountTooSmall`. Core and Contracts typed failures may propagate.
Required root failures reject; topology conflicts or a changed coordinate
invalidate the snapshot. Unknown role runtimes are not called through.

Public types: `SavingsAmount`, `SavingsYield`, `SavingsYieldInput`,
`SavingsReadErrorCode`, `SavingsCall`, `SavingsReadCodec`, `SavingsReadTransport`,
`SavingsTransportReadRequest`, `SavingsReaderConfig`, `SavingsReadValue`,
`SavingsWallet`, `SavingsStrategy`, `SavingsConverter`, `SavingsGauge`,
`SavingsSnapshot`, `SavingsReader`. See the [exports](src/index.ts) and
[port/result definitions](src/types.ts).

## Writer

`createSavingsRpcReader({ networkId, registry, transport })` supplies the
existing reader's codec and transport ports using Core's `RpcTransport`.
`createSavingsWriter({ reader, registry, transport, execution })` returns
`SavingsWriter`. This is a private candidate; qualified protocol review remains
required before release. Existing signer-free reader methods remain available.

| Method      | Input → result                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------- |
| `prepare`   | `{ operationId, account, action, bounds }` → `PreparedSavings`.                                   |
| `simulate`  | Owned preparation → Core `SimulatedTransaction`; pending approval rejects.                        |
| `submit`    | Preparation and its simulation → Core `SubmissionRecord`, after fresh state and allowance checks. |
| `reconcile` | Preparation and durable record → `{ state, record, receipt, outcome: SavingsOutcome }`.           |

`SavingsAction` is `{ kind: "deposit" | "withdraw", amount }` or
`{ kind: "claim-yield" }`. Positive `amount` is bigint MUSD/sMUSD base units
(18 decimals, principal receipts are 1:1). `SavingsBounds` requires positive
`maxBlockAge` and `minYield` in MUSD base units. Deposit requires `minYield: 0n`;
withdraw pays principal plus currently claimable wallet yield. A direct yield
claim requires nonzero claimable yield. This is indexed Savings accounting,
not ERC-4626 share conversion.

`PreparedSavings` contains `snapshot`, `action`, `bounds`, token balance and
allowance `token`, explicit `approval`, and exact `transaction`. Deposit may
require a separate MUSD approval. Withdraw/claim do not. A gauge position must
be unstaked through [Incentives](../incentives/REFERENCE.md) before withdrawing
its principal here. Gauge rewards and redirected voter revenue are independent.

```ts
import { createSavingsRpcReader, createSavingsWriter } from "@mezo-dev-kit/musd-savings";
import { createApprovalWriter, createTokenReader } from "@mezo-dev-kit/tokens";
import { getNetwork } from "@mezo-dev-kit/chains";
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import { createExecutionClient, createRpcSigner, createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest, SubmissionStore } from "@mezo-dev-kit/core";
declare const request: RpcRequest;
declare const account: `0x${string}`;
declare const store: SubmissionStore;
const network = getNetwork("mezo-mainnet"),
  registry = createContractRegistry();
const transport = createRpcTransport({ id: "application", request });
const execution = createExecutionClient({
  network,
  registry,
  transport,
  signer: createRpcSigner({ account, request }),
  store,
  maxBlockAge: 5n,
  confirmations: 2n,
});
const reader = createSavingsRpcReader({ networkId: network.id, registry, transport });
const writer = createSavingsWriter({ reader, registry, transport, execution });
const prepared = await writer.prepare({
  operationId: "unique-savings-deposit",
  account,
  action: { kind: "deposit", amount: 100n * 10n ** 18n },
  bounds: { maxBlockAge: 5n, minYield: 0n },
});
if (prepared.approval.kind !== "sufficient") {
  const approvals = createApprovalWriter({
    reader: createTokenReader({ transport }),
    transport,
    execution,
  });
  const approval = await approvals.prepare({
    ...prepared.token,
    operationId: "unique-approval",
    amount: prepared.approval.amount,
    expectedAllowance: prepared.token.allowance,
  });
  const record = await approvals.submit(approval, await approvals.simulate(approval));
  console.log(await execution.observe(record));
  // Persist, observe until confirmed, reconcile the approval, then prepare again.
  // A reset-to-zero requires another fresh approval before the deposit.
} else {
  const record = await writer.submit(prepared, await writer.simulate(prepared));
  console.log(await execution.observe(record));
  // Persist record, await confirmation through execution.observe, then:
  // const result = await writer.reconcile(prepared, record);
}
```

`SavingsOutcome` reports action `kind`, `principal`, actual `yieldPaid`,
`boundsSatisfied`, and receipt-block `snapshot`. Reconciliation checks protocol
events, MUSD principal/yield transfers, sMUSD mint/burn and wallet ownership.
Bounds are client preflight checks; the contract does not enforce a minimum
yield argument. Receipt-block state includes other transactions in that block.

Use [Core recovery](../../core/REFERENCE.md) for pending, uncertain, reverted,
replaced and reorged records. Never repeat a whole approval/deposit sequence
after a lost wallet response. New simulations need this instance's preparation;
reconciliation accepts restored exact intent and a durable record. The
[local fork example](test/fork.ts) exercises approval, deposit, withdrawal,
yield and gauge flows; its native reward-token fixture is explicitly labelled.

`SavingsWriteError` exposes `code: SavingsWriteErrorCode`: `InvalidInput`,
`UnavailableState`, `InsufficientBalance`, `ApprovalRequired`, `StaleState`,
`ReconciliationMismatch`. Required role/state absence rejects preparation.
EVM, Contracts, Tokens and Core errors may propagate. Public writer types are
`SavingsAction`, `SavingsBounds`, `PreparedSavings`, `SavingsOutcome`,
`SavingsWriteErrorCode`, and `SavingsWriter`.
