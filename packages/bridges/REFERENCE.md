# Bridge SDK reference

Use `@mezo-dev-kit/bridges` to inspect cross-chain delivery evidence, prepare private source
transfers, or perform supported NTT recovery operations. NTT and Native Bridge use separate APIs and
evidence models.

A bridge has two independently observed sides. A confirmed **source transaction** can establish that
tokens were sent or queued. **Destination completion** needs matching, confirmed destination
evidence. Source success alone is not a delivered balance.

| Task                                               | Entry point                                                |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Observe an MUSD NTT transfer                       | `createNttDeliveryObserver`                                |
| Prepare an MUSD NTT source transfer                | `createNttTransferReader`, `createNttTransferWriter`       |
| Complete or cancel an eligible NTT recovery action | `createNttRecoveryWriter`                                  |
| Prepare a current Native source transfer           | `createNativeTransferReader`, `createNativeTransferWriter` |
| Observe a current Native transfer                  | `createNativeCurrentDeliveryObserver`                      |
| Inspect a covered historical Native transfer       | `createNativeDeliveryObserver`                             |

An NTT **digest** identifies a message whose source and destination events must match. Native Bridge
instead matches a **transfer tuple**: sequence, sender, recipient, tokens, amount and target chain.
**Anchors** retain receipt block numbers and hashes so later observations can detect changed
inclusion.

The package remains private source. See [package scope](README.md), the
[bridge walkthrough](../../examples/bridge-musd/README.md), and the
[bridge outcome baseline](../../docs/manifest#events-and-bridge-outcomes).

On this page:

- [Factory and inputs](#factory-and-inputs)
- [Evidence and results](#evidence-and-results)
- [Resume and failures](#resume-and-failures)
- [Native historical observation](#native-historical-observation)
- [Private MUSD NTT source preparation](#private-musd-ntt-source-preparation)
- [Manual NTT recovery](#manual-ntt-recovery)
- [Private Native source preparation](#private-native-source-preparation)
- [Current Native delivery and governance recovery](#current-native-delivery-and-governance-recovery)

## Factory and inputs

### `createNttDeliveryObserver` — configure an NTT observation

Supply independent source and destination transports and confirmation policies. The observer needs
no signer.

`createNttDeliveryObserver(config: NttObserverConfig): NttDeliveryObserver` creates a signer-free
observer. `NttRouteId` recognizes these observation routes:

- `wormhole-ntt-musd-mezo-to-ethereum`
- `wormhole-ntt-musd-ethereum-to-mezo`
- `wormhole-ntt-musd-mezo-to-base`
- `wormhole-ntt-musd-base-to-mezo`

These IDs describe evidence coverage, not supported transfer routes. Supply `sourceTransport`,
`destinationTransport`, `sourceConfirmations` and `destinationConfirmations`. Unknown routes and
invalid/zero confirmation policies are rejected. Counts include the receipt block; application
policy does not guarantee irreversible chain finality.

### NTT transport requirements

Core’s RPC adapter can provide the required receipt and block methods.

`NttObservationTransport` selects only Core's `getChainId`, `getBlockNumber`, `getBlock` and
`getReceipt` methods. Core's `createRpcTransport` satisfies it. Applications own endpoints,
credentials, bounded request sizes/timeouts, cancellation and any bounded read retries; no provider
is selected implicitly.

### `observer.observe` — inspect supplied transaction hashes

Provide the source transaction and any destination candidates your application has discovered. The
observer does not find destination transactions for you.

`NttDeliveryObserver.observe(input: NttObserveInput)` takes a `sourceTransactionHash` and zero to 32
unique `destinationTransactionHashes`, using EVM's validated `Hash32`. Optional `expectedDigest`
selects one unique message when the source transaction sends several on this route. It never
replaces source evidence. Inputs are copied/validated before asynchronous reads.

Observe an NTT transfer using application-supplied RPC request functions, hashes and confirmation
counts:

```ts
import { createNttDeliveryObserver } from "@mezo-dev-kit/bridges";
import { createRpcTransport } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { parseHash32 } from "@mezo-dev-kit/evm";

export async function observeTransfer(input: {
  sourceRequest: RpcRequest;
  destinationRequest: RpcRequest;
  sourceHash: string;
  destinationHashes: readonly string[];
  sourceConfirmations: bigint;
  destinationConfirmations: bigint;
}) {
  const observer = createNttDeliveryObserver({
    routeId: "wormhole-ntt-musd-mezo-to-ethereum",
    sourceTransport: createRpcTransport({
      id: "application-source",
      request: input.sourceRequest,
    }),
    destinationTransport: createRpcTransport({
      id: "application-destination",
      request: input.destinationRequest,
    }),
    sourceConfirmations: input.sourceConfirmations,
    destinationConfirmations: input.destinationConfirmations,
  });

  return observer.observe({
    sourceTransactionHash: parseHash32(input.sourceHash),
    destinationTransactionHashes: input.destinationHashes.map((hash) => parseHash32(hash)),
  });
}
```

The returned state applies only to the receipts supplied to this call. An empty destination list can
establish source progress but cannot prove destination completion.

## Evidence and results

`NttDeliveryObservation` returns route, digest or `null`, source observation, every destination
candidate, issues and `coverage: "provided-receipts-only"`. `completionTransactions` contains
confirmed canonical matching redemptions and is empty unless the overall state is `completed`.

| Overall state        | Meaning                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source-pending`     | Missing source receipt or insufficient confirmations, including an unconfirmed revert.                                                                                                  |
| `source-reverted`    | Source execution reverted and satisfies its confirmation requirement.                                                                                                                   |
| `source-queued`      | One source-manager queue event exists without a unique sent message. That event alone does not identify the requested destination or intended transfer.                                 |
| `message-pending`    | Confirmed source message; the supplied set has no confirmed matching redemption or queue. Missing, reverted, unrelated and underconfirmed candidates do not establish transfer failure. |
| `destination-queued` | A confirmed candidate queued the same digest; no confirmed redemption was found.                                                                                                        |
| `completed`          | Confirmed source send and destination redemption share the same digest; their anchors passed final checks.                                                                              |
| `reorged`            | Source evidence changed, or a destination changed without an independent canonical completion. Reobserve; do not resubmit value.                                                        |
| `ambiguous`          | Invalid, conflicting or unavailable evidence prevents a conclusion. Inspect candidate outcomes and issues.                                                                              |

### Individual receipt results

The overall result preserves every candidate’s evidence, including candidates that did not establish
delivery.

`NttReceiptObservation` separates `missing`, `included`, `confirmed`, `reverted`, `reorged`,
`invalid` and `unavailable`. Each retains hash, optional anchor, observed/required confirmations,
evidence kind, matching digest and optional issue. A reverted candidate can remain underconfirmed.
Evidence kinds are `none`, `sent`, `outbound-queued`, `inbound-queued` and `redeemed`; retained
evidence on a reorged/invalid receipt does not certify current delivery.

### How candidates contribute to completion

A valid matching completion can coexist with unrelated or failed destination candidates.

One independent canonical completion takes precedence over another candidate's revert, absence,
queue or read failure; all candidate outcomes/issues remain visible. Failed source evidence always
prevents completion. Included anchors are rechecked after all candidate reads and both chain
identities are rechecked. Separate chains cannot supply one atomic observation. Later reorgs and
dishonest providers remain outside what these RPC checks prove.

### Message identity checks

Matching message identity is what joins the two chains’ observations.

Source decoding checks registered manager/transceiver identity, destination Wormhole chain and
destination manager. It derives a digest from the strict NTT manager envelope in
`SendTransceiverMessage`, then requires the same digest in a successful registered destination
manager's `TransferRedeemed` event. Inbound queue events use that digest. Receive/attestation status
alone is not delivery and is not assigned a joined state by this API.

The retained TypeChain manager ABI omits digest-only `TransferSent`. This observer uses the correct
transceiver event and pinned source encoding; it does not patch that ABI or qualify its writer
interfaces. See [bridge review gaps](../../knowledge/workflows/bridges/review/gaps.md). Contracts
resolves receipt generations; changed/unavailable registered identities require reassessment.
Current runtime/configuration is not verified.

## Resume and failures

### Persist anchors and reobserve

Retain the previous inclusion coordinates so a later call can detect a reorg or disappearing
receipt.

`NttReceiptAnchor` contains transaction hash, block number and block hash. Pass prior anchors in
`previous.source` and `previous.destinations` to detect changed inclusion, including disappearance
after a block reorg. The source hash must be identical and every prior destination hash must remain
in the candidate set. Duplicate/conflicting anchors are rejected. Anchor collections are scoped to
the observer's route and networks.

Retain hashes and candidate outcomes in application storage. Returned anchors can seed a later
observation. Bigints require an application serialization codec and must be restored as validated
bigint values; the package does not accept a stored JSON completion label as proof. Absence never
authorizes resubmission. Queued source completion, relayer discovery, attestations and recovery
transactions require separate workflows.

### NTT observation failures

Invalid call inputs throw; evidence problems during observation remain visible as issues.

`NttObserverError` exposes `NttObserverErrorCode` and a `stage`. Codes are `InvalidInput`,
`UnknownRoute`, `ChainMismatch`, `TransportFailure`, `InvalidEvidence` and `RegistryUnavailable`.
Invalid configuration/input throws before observation. Read/identity/event problems become
`NttObservationIssue` values containing code, stage and a safe bounded message. Raw provider errors,
credentials and unbounded logs are not returned.

Each receipt allows at most 2,048 logs, four topics per log, 256 KiB data per log and 8 MiB
aggregate data/topics. NTT envelopes must fit the transceiver's 16-bit byte length. Exceeding a
bound is invalid evidence, not partial successful decoding. Candidate reads are sequential; initial
source/destination identity reads may run concurrently.

## Native historical observation

### `createNativeDeliveryObserver` — inspect covered history

Use this observer only for the historical generations and coordinates covered by its evidence
catalog. For current generations, use the current observer below.

`createNativeDeliveryObserver(config: NativeObserverConfig): NativeDeliveryObserver` supports the
two `NativeRouteId` values `mezo-native-usdc-ethereum-to-mezo` and
`mezo-native-btc-mezo-to-ethereum`. It validates historical included direct `bridgeERC20` /
`bridgeOut` calls, both with zero native call value, against their source events. This does not
prepare or authorize a current source transaction.

### Native transport and consensus inputs

Inbound observation additionally needs the raw consensus-block result. An EVM block response cannot
replace it.

`NativeObservationTransport` picks chain, head, block, transaction, receipt, code, storage and read
methods from Core's `RpcTransport`. Supply independent `sourceTransport`, `destinationTransport`,
positive bigint `sourceConfirmations` and `destinationConfirmations`. Inbound additionally needs
`getMezoConsensusBlock(blockNumber)`, returning the raw CometBFT `/block` **result** object
(`block_id`, `block.header`, `block.data.txs`). The caller owns endpoints, credentials,
response-size limits and in-flight cancellation. EVM block counts exclude non-EVM transactions and
cannot substitute for this port.

Observe a historically covered Ethereum-to-Mezo Native transfer. Supply both transports, an inbound
consensus-block reader and candidate hashes:

```ts
import { createNativeDeliveryObserver } from "@mezo-dev-kit/bridges";
import type { NativeObservationTransport } from "@mezo-dev-kit/bridges";
import { parseHash32 } from "@mezo-dev-kit/evm";

declare const ethereum: NativeObservationTransport;
declare const mezo: NativeObservationTransport;
declare const readConsensusBlock: (blockNumber: bigint) => Promise<unknown>;
declare const sourceHash: string;
declare const destinationHashes: readonly string[];

const observer = createNativeDeliveryObserver({
  routeId: "mezo-native-usdc-ethereum-to-mezo",
  sourceTransport: ethereum,
  destinationTransport: mezo,
  sourceConfirmations: 12n,
  destinationConfirmations: 12n,
  getMezoConsensusBlock: readConsensusBlock,
});

const observation = await observer.observe({
  sourceTransactionHash: parseHash32(sourceHash),
  destinationTransactionHashes: destinationHashes.map((hash) => parseHash32(hash)),
});

console.log(observation.state, observation.completionTransactions);
```

`completionTransactions` contains accepted matching delivery evidence only when completion is
established. Use `createNativeCurrentDeliveryObserver` for current generations and supply its
additional client-version callback.

### Native observation inputs and cancellation

Candidate hashes and prior anchors must describe the same intended observation.

`NativeObserveInput` allows at most 32 unique destination hashes, optional `previous.source` /
`previous.destinations` (`NativeReceiptAnchor`) and optional `signal`. Prior anchors must retain the
same hashes and candidate coverage. Cancellation stops subsequent reads and propagates the abort; it
does not turn an in-flight transport into a cancellable one.

### Native result and receipt states

Inspect the transfer tuple and confirmed delivery evidence together.

`NativeDeliveryObservation` returns `routeId`, `state`, the decoded `NativeTransferTuple` or null,
`source`, every `destinations` outcome, `completionTransactions`, and
`coverage: "provided-receipts-and-historical-coordinates-only"`. The tuple contains sequence,
sender, recipient, source/destination token, amount in base units and target chain. It is distinct
from an NTT digest. The states are `source-pending`, `source-reverted`, `message-pending`,
`destination-progress`, `completed`, `reorged`, and `ambiguous`.

Each `NativeReceiptObservation` carries transaction hash, nullable anchor, confirmation counts,
receipt state (`missing`, `included`, `confirmed`, `reverted`, `reorged`, `invalid`, `unavailable`),
proof (`none`, `source-validated`, `payload-accepted`, `attested`, `delivered`), nullable
`settlement` (`gross`, `net`, `fee`), and nullable `NativeObservationIssue`. Only a confirmed source
and confirmed, canonical delivered candidate establish completion. All contributing block anchors,
including inbound parent state, are rechecked. A failed candidate cannot erase another canonical
completion. Future reorgs still require another observation.

### Native observation failures

A missing or unavailable observation does not establish a zero payout or permission to resend.

`NativeObserverError` uses `NativeObserverErrorCode`: `InvalidInput`, `UnknownRoute`,
`ChainMismatch`, `TransportFailure`, `InvalidEvidence`, `RegistryUnavailable`, `DeliveryUnproven`.
Issues contain code, stage and a safe message. Primitive input errors may also come from EVM
validation. Provider failures never become zero balances. Missing evidence does not authorize
retries.

### Historical settlement coverage

The historical observer accepts only the recorded, attributable settlement shapes described here.

Inbound completion is deliberately restricted to one bridge entry in the sole consensus transaction,
exact source/system tuple, mapping at both coordinates, sequence transition and recipient balance
delta. Skipped/failed mints remain incomplete. Outbound requires a preceding matching attestation
and one confirmation in the same receipt, plus exactly one recipient and one fee transfer from the
portal, summing to gross. Confounded batches, separate attestation receipts, overlapping
collector/recipient addresses and other settlement shapes remain unproven. Receipts retain the NTT
log/byte bounds; Native calldata is capped at 128 KiB, parsed batches at 128 entries, and the single
consensus transaction at 2 MiB encoded text.

The separate Contracts catalog currently covers five observed blocks, with exact hashes and proposed
generation evidence. Unknown coordinates fail closed. This is provider-backed historical
observation, not independent consensus or validator-signature verification. Current mappings,
capacity, fees, allowance, Cosmos authorization, exact source simulation and recovery remain
separate requirements. No release, route or writer support is implied.

## Private MUSD NTT source preparation

### `createNttTransferReader` — configure source quotes

Quote both endpoints before preparing a source transaction.

`createNttTransferReader(config: NttTransferReaderConfig): Readonly<NttTransferReader>` uses the
same four `NttRouteId` values and independent `sourceTransport` and `destinationTransport`.
`NttTransferTransport` selects Core RPC chain, block, code, storage, read, native balance and
timestamp methods. No signer is needed for `reader.quote(input: NttTransferQuoteInput)`.

### `NttTransferReader.quote` — amounts, fees and age

Choose the source account, destination recipient, refund recipient and whether source queuing is
acceptable.

The input requires EVM `account`, `recipient`, `refundRecipient`, positive bigint `amount` in source
token base units, explicit boolean `shouldQueue`, bigint `maxNativeFee`, and independent
`maxSourceAgeBlocks` / `maxDestinationAgeBlocks`. Optional `sourceBlockNumber` /
`destinationBlockNumber` must remain within those bounds. Optional `signal` stops subsequent reads
and propagates cancellation; the caller owns in-flight request cancellation and response-size/time
limits. Inputs are copied before asynchronous reads. Zero addresses and protocol custody addresses
as account/recipient are rejected.

### NTT quote results

The quote reports current endpoint state, required fees and whether either side would queue.

`NttTransferQuote` includes immutable source and destination `NttEndpointSnapshot` values with each
chain's coordinate, timestamp, manager, transceiver, token, decimals, locking/burning mode, pause
flags, transceiver index, capacity, queue duration, next sequence and relay configuration. It also
contains source `amount`, `destinationAmount`, uint64 `trimmedAmount`, `trimmedDecimals`, uint72
`packedAmount`, explicit manual `instructions`, native fee/balance, token balance/allowance, both
age bounds, and `sourceWouldQueue` / `destinationWouldQueue`. These are observations, not
reservations. A quote can expose paused endpoints, insufficient balances or a fee above the user
bound; source preparation enforces usability.

### Endpoint and amount checks

Both independently resolved endpoints must agree on the route and token representation.

Runtime and token code must match their canonical projections. Both manager and transceiver peers
must match the independently resolved opposite chain, with one enabled transceiver and threshold
one. Registered history may include removed transceivers. Token precision and mode must match the
indexed MUSD representation. The deployed amount rule rejects dust instead of silently rounding it
away. An amount exceeding uint64 after trimming is rejected. Account native balance covers the
quoted call value only; the wallet and application must also handle gas funding.

### Manual publication and fee policy

Manual publication does not promise that an external relayer will deliver the message.

The private profile explicitly selects manual Wormhole publication. The enabled transceiver's actual
registered index is encoded; no zero-index assumption is made. Its quote reproduces the transfer
path's fee calculation. The manager view quote has an enabled-count/registered-index discrepancy in
the retained generation and cannot replace it. Historical zero fees are not current quotes. Manual
mode does not prevent an external service from delivering a message or imply an SLA.

### `createNttTransferWriter` — prepare, simulate and submit

The writer uses a Core execution client on the source chain.

`createNttTransferWriter({ reader, execution, sourceTransport }): Readonly<NttTransferWriter>`
composes the reader with a source-chain Core `ExecutionClient`. Its methods are:

- `prepare({ operationId, quote }) → Promise<Readonly<PreparedNttTransfer>>`.
- `simulate(prepared) → Promise<Readonly<SimulatedTransaction>>`.
- `submit(prepared, simulated) → Promise<Readonly<SubmissionRecord>>`.
- `reconcile(prepared, record) → Promise` of Core's reconciled source receipt and
  `NttSourceOutcome`.

### NTT approvals

Approve the exact source-token amount in a separate transaction when required.

`PreparedNttTransfer` contains the quote, exact transaction and an `approval` description: token,
manager spender, required amount, current allowance and a `required` flag. Source preparation
requires adequate token/native balances, unpaused endpoints and explicit consent if source capacity
would queue. Simulation requires sufficient allowance. Execute an exact Tokens approval separately,
confirm it, then prepare again. A nonzero existing allowance may need a separate reset according to
Tokens' `planApproval`; no unlimited approval is implied.

Prepare an illustrative one-MUSD NTT transfer with configured source execution and independent
transports. This example chooses no source queuing and a zero native-fee maximum:

```ts
import { createNttTransferReader, createNttTransferWriter } from "@mezo-dev-kit/bridges";
import type { ExecutionClient, RpcTransport } from "@mezo-dev-kit/core";
import type { Address } from "@mezo-dev-kit/evm";

declare const sourceTransport: RpcTransport;
declare const destinationTransport: RpcTransport;
declare const sourceExecution: ExecutionClient;
declare const account: Address;
declare const recipient: Address;

const reader = createNttTransferReader({
  routeId: "wormhole-ntt-musd-mezo-to-ethereum",
  sourceTransport,
  destinationTransport,
});

const writer = createNttTransferWriter({ reader, execution: sourceExecution, sourceTransport });

const prepared = await writer.prepare({
  operationId: "application-owned-ntt-transfer-id",
  quote: {
    account,
    recipient,
    refundRecipient: recipient,
    amount: 1_000_000_000_000_000_000n,
    shouldQueue: false,
    maxNativeFee: 0n,
    maxSourceAgeBlocks: 2n,
    maxDestinationAgeBlocks: 2n,
  },
});

// Confirm any required token approval separately, then prepare again.
if (!prepared.approval.required) {
  await writer.simulate(prepared);
}
```

The example prepares and, when allowance is sufficient, simulates. A nonzero required fee makes this
chosen zero-fee bound unsuitable. Obtain current fees and the user’s bounds before submission, then
track source and destination separately.

This example only prepares and simulates. The application supplies its durable execution store,
chosen fee/freshness bounds, explicit submission decision and subsequent source/destination evidence
handling.

### `createNttTokenTargetResolver` — bind the source-token approval

The resolver verifies the source token and manager independently of the destination quote.

For approval composition, use Tokens' `TokenTarget` with the manager contract ID, actual quoted
token and `targetRole: "ntt-source-token"`. Configure Core with
`createNttTokenTargetResolver({ routeId, sourceTransport }): ExecutionTargetResolver`. It validates
the source manager/runtime, its token getter, representation/code and block anchor, and rejects
another contract, role or network. An approval does not require repeating destination route reads;
source transfer preparation separately revalidates both endpoints after approval confirmation.

### Exact call and submission checks

Token amount and native publication fee occupy different parts of the transaction.

The writer encodes only `transfer(uint256,uint16,bytes32,bytes32,bool,bytes)`. Token amount and
native fee are separate; exact call value is the current fee. Both initial and final Core
simulations repeat the domain checks and decode a uint64 returned sequence. Submission rejects
changed calldata, fee, runtime, allowance or expired source/destination preparation. Core owns nonce
reservation, durable hash storage and duplicate-submission protection. Calls require prepared and
simulated objects from their owning instances.

### Source outcome and destination tracking

Persist the source outcome, then use the delivery observer to establish cross-chain completion.

Source reconciliation checks saved call identity, receipt runtime, token custody and the exact
transceiver message or matching rate-limit/queue tuple. `NttSourceOutcome` is `source-sent` with
sequence, digest and encoded manager message, or `source-queued` with sequence and null
digest/message. Neither means destination completion. Persist source hash, intended fields and
outcome; use `createNttDeliveryObserver` with destination candidates for delivery evidence.

## Manual NTT recovery

### `createNttRecoveryWriter` — choose the remaining action

Select a recovery kind from current evidence and retained intent. Recovery does not start another
ordinary source transfer.

`createNttRecoveryWriter(config: NttRecoveryConfig): Readonly<NttRecoveryWriter>` requires route ID,
both Core `RpcTransport` values, independent positive confirmation counts and independent age
bounds. Supply `sourceExecution` and/or `destinationExecution` for the sides on which transactions
will execute; an unused side needs no signer. The application supplies each transaction's account
and explicitly selects its recovery kind. All kinds require `operationId` and `maxNativeFee`.

`NttRecoveryInput` is a discriminated union:

| Kind                  | Additional input                                                 | Preconditions and exact operation                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cancel-outbound`     | sequence, source amount, recipient, refund recipient             | Existing source queue must match the retained intent and caller/sender; calls `cancelOutboundQueuedTransfer(sequence)` with zero value. Destination RPC is unnecessary.               |
| `complete-outbound`   | same retained source fields                                      | Queue delay elapsed, stored instructions still match, current fee available; calls `completeOutboundQueuedTransfer(sequence)` without another token deposit or approval.              |
| `complete-inbound`    | source transaction hash and encoded manager message              | Same confirmed source digest, exact destination queue amount/recipient and elapsed delay; calls `completeInboundQueuedTransfer(digest)` with zero value.                              |
| `execute-approved`    | source transaction hash and encoded manager message              | Same confirmed source digest, manager-approved and neither executed nor queued; calls `executeMsg` with the bound source manager/message and zero value.                              |
| `receive-attestation` | source transaction hash, encoded manager message and `vaa` bytes | Same confirmed source digest; bounded version-1 VAA body/emitter and full transceiver payload match, VAA unconsumed, message unexecuted; calls `receiveMessage(vaa)` with zero value. |

Queue amounts are checked in the contract's packed representation. Missing queues, wrong senders,
changed recipients, immature timestamps, consumed VAAs and executed messages prevent dependent
calls. Outbound cancellation intentionally reads only the source chain. Other recovery kinds require
current route evidence. The ordinary message is exactly 145 bytes with no additional payload; VAA
input is capped at 64 KiB. VAA body matching does not verify guardian signatures: the actual
transceiver must verify them in initial/final exact simulation and execution. No operator or
relayer-only entrypoint is exposed.

### Recovery lifecycle and results

Use the same preparation, simulation, submission and reconciliation stages for the selected recovery
side.

The recovery writer has `prepare(input)`, `simulate(prepared)`, `submit(prepared, simulated)` and
`reconcile(prepared, record)` methods with the same Core lifecycle. `PreparedNttRecovery` retains
normalized input, exact transaction, source/destination selection, sequence, digest when known,
amount, recipient and a quote when required. `NttRecoveryOutcome` is a source outcome,
`source-cancelled` with sequence/amount, or `destination-progress` with digest and `queued` /
`redeemed` evidence. Cancellation/redemption verifies token settlement. Even redeemed recovery
evidence must be passed through the independent delivery observer to establish cross-chain
completion and preserve prior anchors.

### Recovery after interruption

Preserve the existing operation identity when a submission result is uncertain.

Persist Core submission records and the original recovery context. An uncertain submission requires
`observe` / `inspectHash` and exact-call recovery; it does not permit a new source transfer or a new
operation ID to evade nonce reservation. Prepared/simulated objects are instance-local and are not a
serialization format. After a restart, restore the durable Core store, inspect the saved submission
and reobserve the bridge hashes/anchors. Prepare a new recovery only for the remaining action
justified by those observations. Do not reprepare an already submitted source transfer merely to
recover its receipt; source balance or queue state may already have changed. Writer `reconcile`
requires its original preparation; the independent observer provides the persisted-hash delivery
path. If another party already delivered or completed a queue, reobserve that outcome. Absent
destination evidence alone never authorizes retransferring source tokens.

### NTT preparation and recovery failures

Use the typed code and retained operation state to decide what evidence or input is missing.

`NttTransferError` exposes `NttTransferErrorCode`: `InvalidInput`, `UnknownRoute`, `ChainMismatch`,
`InvalidConfiguration`, `RuntimeMismatch`, `TransportFailure`, `ReorgDetected`, `StaleQuote`,
`AmountHasDust`, `BoundExceeded`, `ApprovalRequired`, `InvalidEvidence`, `RecoveryUnavailable`. EVM
parsing, Contracts registry and Core execution failures retain their owning error types. Error
causes are diagnostic; applications must redact provider details before displaying or storing them.

The indexed qualification remains proposed and pending qualified review. Retained RPC observations,
deterministic component tests and any local fork runs have separate scope. They do not publish a
package, promise relaying or authorize live value-bearing transactions. Native source preparation
uses the separate API below.

## Private Native source preparation

### `createNativeTransferReader` — configure current Native routes

The Native source workflow supports the following two explicitly identified routes.

`createNativeTransferReader(config: NativeTransferReaderConfig)` and
`createNativeTransferWriter(config)` cover exactly:

- `mezo-native-usdc-ethereum-to-mezo`: Ethereum USDC to mapped Mezo mUSDC.
- `mezo-native-btc-mezo-to-ethereum`: Mezo native BTC to Ethereum tBTC.

The factories return `NativeTransferReader` and `NativeTransferWriter`, respectively.

Supply independent `sourceTransport` and `destinationTransport`, plus
`getMezoClientVersion: () => Promise<unknown>` calling `web3_clientVersion` on the same Mezo
provider. `NativeTransferTransport` selects Core's chain, head, block, code, storage, read and
native-balance methods. The recorded client version is checked before and after a quote. This is a
provider assertion, not cryptographic proof of the native engine. A changed version or runtime
requires reassessment.

### `NativeTransferReader.quote` — check amount and fee policy

Use source-token units for the amount, destination-token units for the estimated fee bound and
source-native units for the gas reserve.

`reader.quote(input: NativeTransferQuoteInput)` takes `account`, `recipient`, positive `amount` in
source-token base units, `maxEstimatedDestinationFee` in destination-token units, `sourceGasReserve`
in source-native units, independent `maxSourceAgeBlocks` / `maxDestinationAgeBlocks`, optional
explicit `sourceBlockNumber` / `destinationBlockNumber`, and optional `signal`. Both routes preserve
token precision. Gas reserve is an application-selected balance floor; the signer still owns actual
gas and fee policy.

The reader verifies both bridge and token runtimes, including token proxy slots, decimals, mappings
and balances/allowance. Inbound additionally checks enabled ERC20 minimum, mapped-token mint
authority and blocked module recipients. Outbound checks enabled destination chain, minimum,
available outflow capacity, validator threshold and current destination custody. Zero capacity
blocks a transfer. All coordinates are checked again before returning.

### Native quote result

The quote exposes both endpoint snapshots and the current limits used by preparation.

`NativeTransferQuote` includes anchored `source` / `destination` snapshots
(`NativeEndpointSnapshot`: coordinate, contract ID, bridge, token and decimals), `sourceMinimum`,
nullable `sourceCapacity` / `capacityResetBlock`, token/native balances, allowance, and
`estimatedDestinationFee` / `estimatedDestinationAmount`. The reader rejects violated amount,
balance, capacity, reserve or estimate bounds. Insufficient allowance is returned so the caller can
prepare a separate approval. Bridge-contract recipients are outside this bounded settlement
interface.

### Estimated fee versus actual payout

The estimate cannot cap a future destination fee when the source call has no corresponding on-chain
argument.

The destination fee uses current percentage, recipient exemption, flat fee and collector settings. A
zero collector disables fees; percentage exemption leaves the flat fee in place. Integer rounding
and uint256 overflow match the pinned source. **The outbound source method has no maximum-fee or
minimum-received argument.** `maxEstimatedDestinationFee` is checked during preparation, simulation
and submission; it cannot cap a fee changed before destination payout. The observer reports actual
settlement independently.

### `createNativeTransferWriter` — source execution lifecycle

Use the same source and destination transports and Mezo client-version callback as the reader.

The writer takes the reader, Core `execution`, both transports and the same `getMezoClientVersion`
callback:

- `prepare({ operationId, quote })` returns `PreparedNativeTransfer`: a quote, exact transaction and
  separate `approval` requirement (token, spender, amount, current allowance and required flag).
  Both source calls have `value: 0n`.
- `simulate(prepared)` requires this writer's preparation and sufficient allowance, checks the exact
  return (`true` for BTC `bridgeOut`, empty for `bridgeERC20`) and revalidates both chains.
- `submit(prepared, simulated)` accepts only the matching writer-owned pair, revalidates the
  original anchors and current limits, and submits through Core. Persist Core's record. An uncertain
  submission must retain its reservation; missing delivery never authorizes another source transfer.
- `reconcile(prepared, record)` binds the confirmed source call to the original intent and full
  bridge event tuple. USDC requires actual custody transfer; BTC authorization consumption/burn
  follows the qualified native engine and does not fabricate an ERC20 burn log. Its
  `NativeSourceOutcome` is `source-confirmed` with `NativeTransferTuple`, **not** destination
  completion.

### `createNativeTokenTargetResolver` — separate source approval

Confirm the required approval before preparing the transfer again.

Compose Tokens using `createNativeTokenTargetResolver(config)` and target role
`native-source-token`, with the route's source contract ID. BTC EVM `approve` creates/updates the
native bank authorization; no separate Cosmos signer is needed. Confirm any approval/reset and
prepare again. No approval is hidden in the transfer method.
[The focused example](../../examples/bridge-musd/native.ts) shows this composition and independent
delivery observation.

Preparation/simulation objects are local to the writer instance. After restart, recover the durable
source submission through Core and observe its confirmed hash with the current observer; do not
resubmit to recreate an in-memory object.

### Native preparation failures

Retain Core’s submission identity when execution is uncertain; missing delivery is not evidence that
the source send failed.

`NativeTransferError` exposes `NativeTransferErrorCode`: `InvalidInput`, `UnknownRoute`,
`ChainMismatch`, `RuntimeMismatch`, `InvalidConfiguration`, `TransportFailure`, `ReorgDetected`,
`StaleQuote`, `BoundExceeded`, `ApprovalRequired`, `InvalidEvidence`. EVM, Contracts and Core
failures retain their own error boundaries; Core simulation failures can wrap a Native cause.

## Current Native delivery and governance recovery

### `createNativeCurrentDeliveryObserver` — verify current delivery

Observe current generations with runtime checks at the relevant source and destination coordinates.

`createNativeCurrentDeliveryObserver(config: NativeCurrentObserverConfig)` uses the same two route
IDs, receipt inputs, transports, confirmation policies and optional inbound consensus reader as the
historical observer. It additionally requires `getMezoClientVersion`. It resolves current bridge
generations and token runtime identities at each observed coordinate, including inbound parent
state. Old deployment generations still use `createNativeDeliveryObserver`.

The result has `coverage: "provided-receipts-and-current-runtime-only"`. Inbound retains the
single-entry, sole-consensus-transaction and exact recipient balance-delta requirements. Outbound
accepts the verified contract's confirmation without requiring individual attestation logs:
signature-batch confirmation need not emit those logs. It still requires the full matching tuple and
a uniquely attributable recipient transfer, with either no fee or a matching fee event and transfer.
Multiple withdrawals in one receipt remain unproven. Fee collector and recipient may coincide when
ordered transfers establish both amounts.

### Governance recovery outcome

A proven failed payout has a distinct result from incomplete or missing evidence.

A matching `WithdrawalFailed` after confirmation, with consistent fee settlement and no recipient
payout, yields proof and aggregate state `governance-recovery-required` once both chains satisfy
confirmation policy. `settlement.net` is then zero (amount actually paid); `gross - fee` is the
amount requiring recovery. The tuple identifies sequence, recipient and asset. There is no SDK retry
or governance transaction. Missing payout evidence alone does not establish this outcome. Current
runtime checks, full tuple joins and anchor rechecks also apply to recovery evidence.

The
[Native qualification](../../knowledge/workflows/bridges/evidence/native-transfer-2026-09-15.json)
combines retained real historical transfers, pinned-source compatibility and current read-only
runtime/configuration captures. SDK failure tests and modeled simulation results do not claim fresh
native execution or a new cross-chain transfer. Qualified release review remains required.
