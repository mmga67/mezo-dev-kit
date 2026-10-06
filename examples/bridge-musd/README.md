# Send a bridge transfer and observe delivery

Start with [sendMusd](send.ts) and the [connection guide](../SETUP.md). Supply a
source write connection, a separate destination read transport, a persisted
operation ID, exact quote inputs and a checkpoint persistence callback. Amounts
use source-token base units; native fee caps use source-native units. NTT checks
transport precision and can reject dust rather than silently round it.

The recipe verifies both endpoints, handles a separate exact token approval,
prepares again, simulates, requests consent and reconciles the source operation.
Its checkpoint identifies a source-sent or source-queued result. **A source
receipt is not destination delivery.** Save it even when delivery is pending;
a failed save requires recovery of the existing submission, not another send.

## Observe without a wallet

[observeDelivery](observe-delivery.ts) accepts two read transports, transaction
hashes for the same transfer, optional previous anchors and per-chain confirmation
counts. [parseObservationInput](evidence-input.ts) validates saved JSON. The
observer checks canonical receipts, message identity and destination settlement;
it never sends a transaction.

Coverage is limited to supplied candidates. Missing evidence, source/destination
queues, reverts, ambiguity and completed delivery remain different results.
Historical receipts alone may be insufficient when an endpoint lacks historical
state. Add relevant destination candidates and observe again; do not resend the
source transaction. [workflow.ts](workflow.ts) keeps sending and observation as
separate application calls.

## Recover deliberately

[recoverNtt](recovery.ts) takes an explicit recovery action and evidence. Source
queue cancellation/completion needs the saved queue intent. Destination receive,
completion or execution needs the matching source message and applicable current
state; receiving an attestation additionally needs a valid signed VAA. A matching
message body does not by itself verify guardian signatures.

Configure execution for the chain that will write, set fee/age bounds and request
consent for that exact recovery. Reconcile it, then observe destination delivery.
The cookbook supplies no attestation and does not choose a recovery automatically.

## Native Bridge

[native.ts](native.ts) separately shows current Native source preparation and
read-only delivery observation for the implemented routes. Supply both transports,
the same Mezo provider's client-version reader, explicit amount/fee/gas-reserve
bounds and checkpoint persistence. Native BTC bank authorization requires actual
Mezo native execution; an EVM fixture does not establish it. Withdrawal fees can
change before payout. `governance-recovery-required` is a handoff for review,
not an automatic retry instruction.

See the [Bridges reference](../../packages/bridges/REFERENCE.md) for current route,
generation, provider and private release limits.
