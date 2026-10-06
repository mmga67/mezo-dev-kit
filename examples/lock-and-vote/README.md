# Create a lock, vote and withdraw later

Start with [createBtcLock](create-lock.ts). Supply a [write connection](../SETUP.md),
operation ID, token base units, duration in seconds and `LockBounds`. A lock creates
an NFT whose observed power and eligibility depend on current contract state.
The recipe separately approves the exact amount, prepares again, simulates,
requests consent and returns the reconciled token ID.

[workflow.ts](workflow.ts) shows later actions instead of changing chain time:

1. `voteWithLock` takes the saved token ID, caller-selected targets/weights and
   `VotingBounds`. Preparation verifies current ownership, power, liveness and
   epoch eligibility. A newly created lock may not yet be eligible.
2. Call the same recipe with a `reset` action when current epoch rules permit it.
   Reset bounds use an empty allocation list.
3. Call `withdrawExpiredLock` after actual expiry and any required reset, supplying
   current `LockBounds`. It does not wait for expiry or bypass eligibility checks.

Treat these as separate user decisions over time. Do not infer current voting
mechanics from an old example or assume that creating a lock makes an immediate
vote valid. Read current state and preserve its block coordinate.

[claims.ts](claims.ts) covers selected voting rewards and veMEZO rebase claims.
They are separate accounting paths. Keep reward-token order beside minimum
amounts and retain bounded epoch/cursor coverage; one claim may not cover all
history. Each transaction requests consent and returns a reconciled outcome.

See the [Incentives reference](../../packages/protocols/incentives/REFERENCE.md)
for exact units, action requirements and private release scope.
