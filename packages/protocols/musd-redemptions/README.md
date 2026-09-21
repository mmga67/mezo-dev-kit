# MUSD redemptions

`@mezo-dev-kit/musd-redemptions` discovers bounded redemption queues, prepares hints, verifies simulated outputs, and executes and reconciles classic MUSD redemptions.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the redemption walkthrough](../../../examples/redeem-musd/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Prepare a redemption

The reader composes [Borrowing](../musd-borrowing/README.md) for position and
oracle checks. Quotes distinguish requested, helper-truncated, and attempted
MUSD; bounded queue discovery does not guarantee a fill.

The writer requires an explicit `RedemptionOutputSimulator`. The supplied
trace adapter needs a compatible `debug_traceCall` node with Geth `callTracer`
and logs. An empty successful call is insufficient. See the [API reference](REFERENCE.md)
for trace requirements, iteration limits, and output verification.

Applications supply RPC policy, consent, an explicit signer, gas policy, and
durable submission storage. MUSD is burned under protocol permission, so this
workflow needs no token approval.

## Output bounds and scope

Minimum received amounts are checked before signing and during final simulation.
The contract has no minimum-received argument: inclusion state can change output.
Reconciliation reports actual amounts and `boundsSatisfied`; do not automatically
retry a confirmed transaction that misses those bounds.

This private mainnet Node package remains proposed for protocol support and
requires qualified review before release. Local-fork verification uses a
labelled native-oracle fixture and local funding; it does not qualify Mezo's
native engine. The [redemption model](../../../knowledge/protocols/musd/redemptions/README.md)
explains protocol semantics and evidence.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/musd-redemptions check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
