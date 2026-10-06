# Connect an application to a recipe

Start with [setup.ts](setup.ts). Its types show exactly what the application
supplies; they are cookbook conveniences, not required SDK context containers.
Every SDK factory accepts its individual dependencies.

## Read without a wallet

`createReadConnection({ networkId, readRequest })` returns network metadata,
a contract registry and an RPC transport. `networkId` comes from the application's
network choice. `readRequest` is a function accepting `{ method, params }` and
returning the provider's JSON-RPC **result**, not its response envelope.

Adapt your application's RPC client to the public `RpcRequest` type. The
[HTTP adapter](runtime/rpc-request.ts) illustrates a bounded Node implementation:
it validates envelopes, limits response size, rejects mutation methods and
propagates cancellation. Provider URLs, credentials, timeouts and retries are
application configuration. Never ship a private RPC credential in browser code.

Connection construction does no RPC. The [network recipe](chains/select-network.ts)
checks endpoint identity explicitly; SDK readers also check the chain as they
read. [Coherent balances](core/read-balances.ts) retain one block number and hash
so two values describe the same state. Missing data is an error or an unavailable
result, never an invented zero.

## Add writes deliberately

`createConnection` also requires these application-owned inputs:

| Input           | Where it comes from                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `account`       | The address selected in the connected wallet; validate user input before use.                     |
| `walletRequest` | The wallet's request function, bound to that wallet instance. It owns signing.                    |
| `store`         | A shared `SubmissionStore` with durable, atomic operation and nonce reservations.                 |
| `review`        | Your consent UI: inspect the simulated exact call, resolve on acceptance, reject on cancellation. |

For a typical wallet adapter, forward `({ method, params })` to the connected
wallet's `request({ method, params: [...params] })`. Keep the wallet adapter
separate from the read provider; check their selected chains before prompting.
Do not build a signing port from a read-only HTTP endpoint.

The [file store](runtime/submission-store.ts) is a Node-only illustration with
independent persistence tests. A browser application needs an adapter appropriate
to its storage and concurrent tabs. `createMemorySubmissionStore` is useful in
tests but loses recovery records when the process or page restarts.

## Follow one transaction

Read [open-position.ts](borrow-musd/open-position.ts) alongside its
[read-only preview](borrow-musd/preview-position.ts). Form amounts are decimal
strings; use [exact conversion](evm/amounts.ts) with the selected asset's verified
precision, then pass integer base units and explicit caller bounds.

Preparation reads current identity, state and eligibility. A required
[approval](tokens/approve.ts) is a separate transaction naming an exact spender
and amount. Prepare the protocol action again afterward. Simulation checks the
exact call; `review` asks for consent before submission. Core reserves the
operation and nonce in the supplied store before asking the wallet to send.
Confirmation establishes canonical inclusion under a chosen policy; domain
reconciliation checks what actually happened and whether bounds were satisfied.

Focused recipes have an illustrative polling budget and confirmation policy.
Choose these for your application's requirements. A timeout leaves a saved
submission to inspect, not permission to submit another transaction.

## Compose actions and recover

[createWorkflowConnection](runtime/workflow-connection.ts) adds a persisted intent
ID, execution policy and bounded polling to an existing write connection. The
application creates and stores that intent ID before starting. Each descriptive
step receives its own operation ID; retain it when recovering the same intent.
Use a new intent ID only for a genuinely new user-requested operation.

After interruption, load and validate the saved record and follow
[observeSubmission](core/observe-submission.ts). Observation does not resend.
If a hash is missing, submission can still be uncertain: inspect the wallet and
account nonce before choosing a next action. Reconcile protocol state through
the owning reader/writer; a receipt alone is insufficient. Serialized preparation
objects do not restore a writer instance's internal provenance.

For bridges, persist the source checkpoint and observe destination evidence
independently. For [mixed swaps](swap-tokens/mixed.ts), the first leg's reconciled
output becomes a separate continuation input. If the second submission is
uncertain, observe it before claiming the intermediate balance is still available.
