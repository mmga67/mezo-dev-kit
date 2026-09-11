# Bridge observation SDK reference

Import from `@mezo-dev-kit/bridges`. The package remains private source.
[ADR-0023](../../docs/decisions/0023-ntt-receipt-observation.md) owns its boundary.

## Factory and inputs

`createNttDeliveryObserver(config: NttObserverConfig): NttDeliveryObserver`
creates a signer-free observer. `NttRouteId` recognizes these observation routes:

- `wormhole-ntt-musd-mezo-to-ethereum`
- `wormhole-ntt-musd-ethereum-to-mezo`
- `wormhole-ntt-musd-mezo-to-base`
- `wormhole-ntt-musd-base-to-mezo`

These IDs describe evidence coverage, not supported transfer routes. Supply
`sourceTransport`, `destinationTransport`, `sourceConfirmations` and
`destinationConfirmations`. Unknown routes and invalid/zero confirmation policies
are rejected. Counts include the receipt block; application policy does not
guarantee irreversible chain finality.

`NttObservationTransport` selects only Core's `getChainId`, `getBlockNumber`,
`getBlock` and `getReceipt` methods. Core's `createRpcTransport` satisfies it.
Applications own endpoints, credentials, bounded request sizes/timeouts,
cancellation and any bounded read retries; no provider is selected implicitly.

`NttDeliveryObserver.observe(input: NttObserveInput)` takes a
`sourceTransactionHash` and zero to 32 unique `destinationTransactionHashes`,
using EVM's validated `Hash32`. Optional `expectedDigest` selects one unique
message when the source transaction sends several on this route. It never
replaces source evidence. Inputs are copied/validated before asynchronous reads.

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

## Evidence and results

`NttDeliveryObservation` returns route, digest or `null`, source observation,
every destination candidate, issues and `coverage: "provided-receipts-only"`.
`completionTransactions` contains confirmed canonical matching redemptions and
is empty unless the overall state is `completed`.

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

`NttReceiptObservation` separates `missing`, `included`, `confirmed`, `reverted`,
`reorged`, `invalid` and `unavailable`. Each retains hash, optional anchor,
observed/required confirmations, evidence kind, matching digest and optional
issue. A reverted candidate can remain underconfirmed. Evidence kinds are
`none`, `sent`, `outbound-queued`, `inbound-queued` and `redeemed`; retained
evidence on a reorged/invalid receipt does not certify current delivery.

One independent canonical completion takes precedence over another candidate's
revert, absence, queue or read failure; all candidate outcomes/issues remain
visible. Failed source evidence always prevents completion. Included anchors
are rechecked after all candidate reads and both chain identities are rechecked.
Separate chains cannot supply one atomic observation. Later reorgs and dishonest
providers remain outside what these RPC checks prove.

Source decoding checks registered manager/transceiver identity, destination
Wormhole chain and destination manager. It derives a digest from the strict NTT
manager envelope in `SendTransceiverMessage`, then requires the same digest in a
successful registered destination manager's `TransferRedeemed` event. Inbound
queue events use that digest. Receive/attestation status alone is not delivery
and is not assigned a joined state by this API.

The retained TypeChain manager ABI omits digest-only `TransferSent`. This observer
uses the correct transceiver event and pinned source encoding; it does not patch
that ABI or qualify its writer interfaces. See [bridge review gaps](../../knowledge/workflows/bridges/review/gaps.md).
Contracts resolves receipt generations; changed/unavailable registered identities
require reassessment. Current runtime/configuration is not verified.

## Resume and failures

`NttReceiptAnchor` contains transaction hash, block number and block hash. Pass
prior anchors in `previous.source` and `previous.destinations` to detect changed
inclusion, including disappearance after a block reorg. The source hash must be
identical and every prior destination hash must remain in the candidate set.
Duplicate/conflicting anchors are rejected. Anchor collections are scoped to the
observer's route and networks.

Retain hashes and candidate outcomes in application storage. Returned anchors can
seed a later observation. Bigints require an application serialization codec and
must be restored as validated bigint values; the package does not accept a stored
JSON completion label as proof. Absence never authorizes resubmission. Queued
source completion, relayer discovery, attestations and recovery transactions
require separate workflows.

`NttObserverError` exposes `NttObserverErrorCode` and a `stage`. Codes are
`InvalidInput`, `UnknownRoute`, `ChainMismatch`, `TransportFailure`,
`InvalidEvidence` and `RegistryUnavailable`. Invalid configuration/input throws
before observation. Read/identity/event problems become `NttObservationIssue`
values containing code, stage and a safe bounded message. Raw provider errors,
credentials and unbounded logs are not returned.

Each receipt allows at most 2,048 logs, four topics per log, 256 KiB data per log
and 8 MiB aggregate data/topics. NTT envelopes must fit the transceiver's 16-bit
byte length. Exceeding a bound is invalid evidence, not partial successful
decoding. Candidate reads are sequential; initial source/destination identity
reads may run concurrently.
