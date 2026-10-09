# Lock, voting and claim operations

Inspect the Incentives package README, reference and current exports for the
requested operation and eligible position classes; do not infer capability from
protocol knowledge. Read only the matching operation resource.

- For locks, resolve custody and ownership class before applying ordinary-lock
  procedures. Managed, granted, delegated, voted and boost-linked positions may
  need different operations. Stored checkpoint boost, current boost and
  ownership-change-suppressed weight are separate inputs.
- For votes and fee/incentive claims, select the independent voter domain and
  reward child, then verify code/immutables, epoch bounds, owner recipient,
  history budgets and payout reconciliation.
- For rebase claims, retrieve the cursor budget and minter period from the
  operation owner. Preserve zero-claim cursor advancement and active-lock
  deposit versus expired-lock owner payout; a position eligible for a rebase
  claim is not necessarily eligible for another lock operation.
- For CL gauge operations, use the verified Pools position reader. Distinguish
  stored from newly earned rewards, same-timestamp update behavior, automatic
  withdrawal claims and the intended claim overload. Reconcile actual payment,
  custody and native gas separately from accounting caps.

Pair authored writer work with transaction-execution and testing procedures.
Native-token fork fixtures do not qualify the native chain execution engine.
Use current support and review labels from their owners; this procedure does
not authorize a transaction or release.
