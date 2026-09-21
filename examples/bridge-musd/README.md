# Bridge MUSD and observe delivery

## Native Bridge transfers

[Native source and delivery](native.ts) composes the private Native reader,
Tokens approvals, Core execution and current delivery observer. It covers USDC
from Ethereum to Mezo and BTC from Mezo to Ethereum. Supply both RPC transports,
a source connection with durable storage, the same Mezo provider's
`web3_clientVersion` reader, explicit amount/fee-estimate/gas-reserve bounds and
a checkpoint callback. Call `sendNative` only for an intended source transfer;
`observeNative` is independently read-only.

The Mezo side needs native execution: an EVM fork alone does not implement BTC
bank authorization. Current withdrawal fees are estimates and can change before
payout. `governance-recovery-required` is a terminal SDK handoff, not a retry
instruction. Use the existing historical observer for retained old generations.
This example adds no Native CLI command and was verified without a live send.

## Read the focused operation

Start with [Send and checkpoint MUSD](send.ts) beside the [connection guide](../SETUP.md).
Pass the source connection, a separate destination transport, NttTransferQuoteInput and a persistence callback. Amounts use source-token units and native fees use source-native units. The returned checkpoint records source settlement; delivery observation and recovery are separate functions below.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[observe-delivery.ts](observe-delivery.ts) is the independent observation example:
it takes two read transports, transaction evidence and per-chain confirmation
counts. It needs no signer, submission store or ExampleRuntime.

[Setup](../README.md#build-and-run) · [Source workflow](workflow.ts) · [Recovery](recovery.ts) · [Observer](observe.ts) · [SDK](../../packages/bridges/REFERENCE.md)

## Execute the source transfer

Choose an Ethereum RPC for independent destination reads. The source uses the
verified local Mezo fork from the shared setup:

```sh
export MDK_DESTINATION_RPC_URL='https://YOUR_ETHEREUM_RPC'
MDK_RUN_ID=bridge-01 pnpm --filter @mezo-dev-kit/examples bridge-musd --mode fork
```

The route is `wormhole-ntt-musd-mezo-to-ethereum`. The recipe funds 20 MUSD
locally, quotes a transfer of 10 MUSD to the selected account on Ethereum,
checks both managers/transceivers and capacities, approves the source manager,
then simulates, submits and reconciles the source transaction. It explicitly
allows a source queue and caps the native fee at 0.001 BTC. NTT transport
precision can reject amounts with dust; do not round a user's amount silently.

Expected source output is `source-sent` with its sequence, digest and message,
or `source-queued` with its sequence. The source hash and outcome are saved in
`local/examples/<run-id>/bridge.json`. Both are distinct from destination
completion. This is manual Wormhole publication; the example does not promise
a relayer or a delivery time.

No guardian observes this private fork's new transfer, so its initial observer
has an empty destination candidate set and reports pending/queued delivery.
That is the expected result. It does not fabricate a completed transfer from
unrelated historical receipts.

## Observe an existing transfer

With the same RPC variables, omit `--input` to use the canonical dated
[NTT transfer record](../../knowledge/workflows/bridges/evidence/musd-ntt-mainnet-2026-08-18.json).
The example loads that record's hashes directly; it does not maintain a second
copy. `--variant native` selects the dated
[Native outbound record](../../knowledge/workflows/bridges/evidence/native-mainnet-2026-08-18.json).

```sh
pnpm --filter @mezo-dev-kit/examples bridge-musd --mode observe --output /tmp/ntt-observation.json
pnpm --filter @mezo-dev-kit/examples bridge-musd --mode observe --variant native --output /tmp/native-observation.json
# Restart with the saved hashes and canonical anchors:
pnpm --filter @mezo-dev-kit/examples bridge-musd --mode observe --input /tmp/ntt-observation.json --output /tmp/ntt-observation-resumed.json
```

These observations concern those historical transfers, independently of the
new source-fork run above. An archive/provider failure remains an incomplete
observation even when the retained evidence recorded completion.
Native verification also reads historical code and storage: a provider that
returns old receipts may still lack the state required to prove delivery.

For a historical transfer, configure the actual Mezo and Ethereum RPCs and
create a JSON input containing hashes from **the same transfer**:

```json
{
  "sourceTransactionHash": "0x<64 hexadecimal characters>",
  "destinationTransactionHashes": ["0x<64 hexadecimal characters>"],
  "expectedDigest": "0x<64 hexadecimal characters>"
}
```

`expectedDigest` is optional when the source contains exactly one matching
message. Replace the placeholders with real evidence; they intentionally fail
validation. Supply at most 32 destination candidates.

```sh
pnpm --filter @mezo-dev-kit/examples bridge-musd --mode observe \
  --input /ABSOLUTE/PATH/receipts.json --output /ABSOLUTE/PATH/observation.json
```

The observer checks canonical receipts, independent 12-confirmation policies,
digest matching and destination redemption. It reports provided-receipts-only
coverage. Missing evidence, source queue, destination queue, reverted receipts,
ambiguity and completed delivery remain distinct outcomes. Run it again with
new candidates to resume observation; it never repeats the source transfer.
Applications can also call `observeNtt` with previous receipt anchors to detect
changes relative to earlier observations.

The same command with `--variant native` demonstrates the historical Native BTC
Mezo→Ethereum observer. Omit `expectedDigest` for that input. Native observation
uses transfer tuples and settlement proof instead of NTT messages. The CLI
variant observes historical transfers. The separate [Native example](native.ts)
provides current source preparation and execution for the two initial routes.

## Supply recovery evidence explicitly

`recoverNtt` is a complete typed preparation/simulation/submission/reconciliation
composition for callers configuring a local source or destination execution
client. Its `NttRecoveryConfig` supplies both transports and the execution
client for the chain that will write. Its `NttRecoveryInput` selects exactly
one action:

| Action                | Required saved evidence                                             | Writes on   |
| --------------------- | ------------------------------------------------------------------- | ----------- |
| `cancel-outbound`     | Queue sequence, amount, recipient, refund recipient                 | Source      |
| `complete-outbound`   | Same queue intent, now eligible to release                          | Source      |
| `receive-attestation` | Source transaction hash, exact message, valid signed VAA            | Destination |
| `complete-inbound`    | Source transaction hash and message for an eligible inbound queue   | Destination |
| `execute-approved`    | Source transaction hash and message already approved on destination | Destination |

All also require operation ID, selected account and a native-fee cap. Pass
addresses, hashes and VAA bytes through EVM parsers at your input boundary.
The writer verifies queue eligibility, message identity and current state;
exact transceiver simulation checks attestation acceptance. Matching the VAA
body alone does not verify guardian signatures. Reconcile the recovery, then
observe the matching destination receipt. A local source run does not supply
a valid new guardian attestation, so the CLI does not invent one or invoke a
destination recovery automatically.
