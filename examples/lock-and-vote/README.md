# Lock BTC and vote on pool incentives

## Read the focused operation

Start with [Create a veBTC lock](create-lock.ts) beside the [connection guide](../SETUP.md).
Pass underlying-token base units, duration in seconds, an operation ID and LockBounds. The function stops after verified lock creation and returns the NFT ID and actual lock forecast. The lifecycle below calls it, then advances the local clock to demonstrate eligible voting and withdrawal.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [SDK](../../packages/protocols/incentives/REFERENCE.md)

```sh
# Set MDK_NATIVE_TOKEN_ARTIFACT first.
MDK_RUN_ID=vote-01 pnpm --filter @mezo-dev-kit/examples lock-and-vote --mode fork
```

Create an ordinary 0.1 BTC lock for 28 days, find a live pool among at most 16
registered targets, allocate its voting power, reset in the next eligible
epoch, and withdraw after expiry. The local runner models both native token
ledgers used by the verified escrow/boost graph and preserves captured escrow
custody. Escrow and voter contracts execute on the fork.
This variant uses zero local gas fees because the fixture's BTC token ledger
is separate from Anvil's native gas balance. It does not test native fee debits.

The injected `advanceTo` callback visibly advances local time. An application
would wait for eligibility instead. Voting has an opening window, newly
created NFTs may have same-block power suppression, and reset also needs an
eligible epoch. The guide's duration is a demonstration input, not a lock-term
recommendation. The on-chain end is rounded by the protocol.

Expected success prints the actual NFT ID, locked amount, rounded end, voting
allocation, reset allocation and final withdrawal. The ordinary-lock writer
rejects managed, delegated, granted, vested or otherwise ineligible NFTs.
Voting power is not an immediately claimable token reward.

## Claim existing rewards

[The separate claim compositions](claims.ts) handle positions that already have
eligible history. `claimVotingRewards` takes the voting domain, NFT ID, target,
`fees` or `bribe`, and an explicit list of at most eight reward tokens. It reads
at most four epochs before choosing a minimum for each token, then simulates,
submits and reconciles actual payments. Zero reward for every selected token
stops before submission.

`claimRebase` takes an eligible veMEZO NFT ID and shows the forecast's payment
destination and cursor progress before claiming. A rebase may increase a lock
instead of paying the wallet. One bounded claim need not cover all history.
Both functions accept the documented ExampleRuntime used by the lifecycle recipe. They are
advanced compositions for caller-supplied eligible state; the empty-account
CLI lifecycle does not manufacture fee/bribe or rebase eligibility.
