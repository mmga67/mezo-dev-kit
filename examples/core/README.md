# Read consistent state and observe submissions

Start with [readMusdBalances](read-balances.ts). Supply network/registry/transport
from [createReadConnection](../setup.ts) and two validated addresses. Both calls
use one block number and hash, so the returned balances describe the same state.
An unavailable call stops the recipe instead of replacing a missing balance
with zero. Preserve the returned coordinate when displaying or comparing results.

[observeSubmission](observe-submission.ts) validates an application's saved
submission record and asks Core to observe it. It uses execution-client wiring
but never submits another transaction. Retain the updated record and inspect
uncertain, missing or reorged results. Confirmation alone is insufficient:
use the owning domain's reconciliation to establish the protocol outcome.

See [durable storage and recovery](../SETUP.md#compose-actions-and-recover) and
the [Core reference](../../packages/core/REFERENCE.md) for required ports and states.
