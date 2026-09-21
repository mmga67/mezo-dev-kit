# Locks, voting, and gauge rewards

`@mezo-dev-kit/incentives` reads locks and gauges, calculates voting power and rewards, and provides private lock, voting, staking, and claim workflows.

## Start here

Build the workspace with the [SDK setup guide](../../../docs/guides/SDK_DEVELOPMENT.md), then follow [the locks and voting walkthrough](../../../examples/lock-and-vote/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Choose a workflow

| Area                          | Available work                                                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Savings and vault gauges      | Read stake and rewards; stake, unstake, and claim streamed rewards                                                                |
| veBTC and veMEZO locks        | Read ownership and lock state; create, increase, extend, make permanent, return to timed, or withdraw an ordinary self-owned lock |
| Voting and rewards            | Bounded pool, validator, and boost voting; vote/reset, fee/bribe claims, and ordinary veMEZO rebase claims                        |
| Concentrated-liquidity gauges | Read per-NFT rewards and stake ownership; approve, stake, claim, and unstake within the verified position profile                 |

The [API reference](REFERENCE.md) separates each operation's requirements.
CL gauge workflows use an injected verified Pools position reader; see the
[liquidity-position walkthrough](../../../examples/manage-cl-position/README.md).
Applications supply Core execution, consent, RPC policy, and durable storage.

## Accounting and scope

Keep principal, voter-directed revenue, ordinary pool fees, and gauge emissions
separate. Gauge custody and a user's beneficial stake are different. Withdrawals
may also settle rewards; reconcile actual transfers rather than accounting caps.

These are private Node implementations with operation support still proposed
or absent pending qualified review. Ordinary lock operations exclude managed,
granted, delegated, and otherwise restricted positions; voting and claims have
their own checks. Local native-token fixtures do not qualify Mezo's native engine.
See [incentives knowledge](../../../knowledge/protocols/incentives/README.md)
for the underlying lock, vote, and reward models.
The [MEZO Gauge reference](../../../knowledge/protocols/incentives/generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives)
also covers third-party voting and remote incentives; this package's voting
workflows currently cover the three domains listed above.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/incentives check
```

See the [contributor guide](../../../CONTRIBUTING.md) for workspace setup and review.
