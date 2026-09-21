# Connect and observe execution

Start with [read-balances.ts](read-balances.ts) for a signer-free coherent read:
it constructs `createCoreReadClient`, encodes two MUSD balance calls with the
canonical ABI and returns both decoded balances with their shared block/hash.
Transport failures remain failures; they never become zero balances.

Read [setup.ts](../setup.ts) to see `createRpcTransport` and `createRpcSigner`
connected to separate application request ports. Then read
[observe-submission.ts](observe-submission.ts) for `createExecutionClient`,
validated saved input and one `execution.observe()` call.

Pass the saved JSON record, explicit confirmation/age policies and the domain
target resolver when the transaction uses a discovered destination. The returned
state distinguishes submitted, included, confirmed, uncertain, reverted and
reorged results. Preserve the returned record's inclusion anchor for the next
observation. No branch resubmits a transaction.

[open-position.ts](../borrow-musd/open-position.ts) shows the same Core client
composed with a domain writer. The example
[confirmation helper](../runtime/wait-for-confirmation.ts) supplies bounded polling;
Core's observer performs one observation per call. Domain reconciliation remains
with the protocol writer.

[Connection and lifecycle guide](../SETUP.md) · [Package reference](../../packages/core/REFERENCE.md).
