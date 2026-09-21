# Bridge transfers and delivery

`@mezo-dev-kit/bridges` prepares private MUSD NTT and Native Bridge transfers, supports manual NTT recovery, and checks bounded delivery evidence.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the bridge walkthrough](../../examples/bridge-musd/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Choose a workflow

| Need                                                  | API                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| Inspect current NTT configuration, capacity, and fees | `createNttTransferReader`                                  |
| Prepare and execute an ordinary source transfer       | `createNttTransferWriter`                                  |
| Recover an existing queue or attestation operation    | `createNttRecoveryWriter`                                  |
| Join source and destination NTT evidence              | `createNttDeliveryObserver`                                |
| Verify a recorded Native Bridge delivery              | `createNativeDeliveryObserver`                             |
| Prepare USDC into Mezo or BTC out to Ethereum         | `createNativeTransferReader`, `createNativeTransferWriter` |
| Check current Native delivery or failed payout        | `createNativeCurrentDeliveryObserver`                      |

Applications provide both chains' transports, confirmation policies, and
candidate destination receipts. Writers additionally require explicit wallets,
consent, and durable submission storage. The [API reference](REFERENCE.md)
defines route coverage, bounds, and recovery requirements.

## Delivery and scope

A source receipt or attestation alone is not delivery. NTT joins the same message
digest across chains; Native joins its direction-specific tuple and recipient
settlement evidence. The historical Native observer retains its pinned coordinates;
the current observer checks current deployment and token runtimes. A confirmed
withdrawal with a failed recipient payout reports `governance-recovery-required`.
It never causes an automatic resend.

Native source preparation covers Ethereum USDC to Mezo mUSDC and Mezo BTC to
Ethereum tBTC. Approval is separate, including the BTC precompile's native bank
authorization. Destination fees are estimates: the source call cannot enforce
the fee that applies later. See the [Native example](../../examples/bridge-musd/native.ts).

Delivery observation does not establish current fees or transfer readiness.
Recovery preserves the existing sequence/digest and custody; it does not create
a new source transfer to compensate for missing destination evidence.

This is a private implementation. Canonical route/writer support remains absent
pending qualified release review. No relayer, automatic retry, exhaustive history,
or delivery service is provided. See [bridge knowledge](../../knowledge/workflows/bridges/README.md)
for the provider models and evidence.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/bridges check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
