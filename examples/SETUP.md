# Understand the connections and transaction stages

Start with [setup.ts](setup.ts), then open a focused operation such as
[deposit.ts](save-musd/deposit.ts). You can read and reuse those functions
without following the example CLI.

## What the application supplies

`createConnection` shows the actual MDK construction. Its `Connection` result
is a small type owned by these examples. Each operation destructures its fields
and passes them to public MDK factories; applications can pass those fields
directly without adopting this type.

| Input           | Why it exists                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `networkId`     | Selects network identity and native-asset metadata through Chains.                                         |
| `account`       | Explicit account that the supplied wallet controls.                                                        |
| `readRequest`   | Application RPC access. Takes `{ method, params }` and returns the raw result, rejecting provider errors.  |
| `walletRequest` | Wallet access for account checks and signing. It can differ from the read provider.                        |
| `store`         | Shared operation/nonce reservations and submitted hashes. Use durable atomic storage for restart recovery. |

The application owns endpoint URLs, credentials, timeout and cancellation. See
the example [HTTP adapter](runtime/rpc-request.ts) and
[durable file store](runtime/submission-store.ts) for concrete implementations.
Core's `createMemorySubmissionStore()` is useful in isolated tests or sessions;
its records disappear when the process exits.

The returned fields have distinct responsibilities:

1. `network` and `registry` supply canonical identities and deployments.
2. `transport` wraps the read request with MDK's RPC adapter.
3. `signer` wraps the wallet request for the selected account.
4. `store` is shared by execution clients that use that account.
5. Each operation constructs its reader, Core execution client and writer.

For example, Savings uses `createSavingsRpcReader` to supply its ABI adapter
and `createSavingsWriter` for protocol operations. Borrowing's writer accepts
`{ reader, execution }`; Savings also needs `{ registry, transport }` for its
token and deployment work. Read each factory's explicit construction in the
operation file.

Dynamic pool, market, vault, lock and bridge destinations also need an owning
protocol's target resolver. It lets Core check the discovered address against
the registered root at simulation and submission. The focused examples show
that resolver beside `createExecutionClient`.

## Inputs and results

Focused operations accept a descriptive unique `operationId`, explicit amounts
and the owning package's typed bounds. Amounts are integer base units. Use
[exact conversion](evm/amounts.ts) with precision obtained from the token reader;
the full workflows demonstrate those reads and derive concrete slippage bounds.

The transaction examples use one confirmation for the local fork. Preparation
age comes from the supplied bounds. These are visible application choices:
review them for the environment where you compose these APIs.

## Follow one transaction

| Stage                              | What it establishes                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `reader.read()` / `reader.quote()` | Current state or an estimate at an explicit coordinate.                                             |
| `writer.prepare()`                 | Preconditions, bounds, approvals and the exact intended call. It does not sign or submit.           |
| Token approval, if needed          | A separate confirmed allowance change. Prepare the original action again afterward.                 |
| `writer.simulate()`                | Whether the prepared exact call succeeds under the checks required by that domain.                  |
| `writer.submit()`                  | Revalidation and submission through Core, with intent reserved before the wallet call.              |
| `waitForConfirmation()`            | Example-owned bounded polling over `execution.observe()`; a timeout never triggers resubmission.    |
| `writer.reconcile()`               | Receipt and protocol outcome verification. Inspect actual amounts and any `boundsSatisfied` result. |

Prepared objects belong to the writer that created them. Keep them in that
workflow instance. Persist Core submission records for restart observation;
deserializing a prepared object does not recreate writer ownership. Some bounds
are application policy and some are on-chain call arguments; the domain
reference owns that distinction.

For bridging, source settlement and destination delivery are separate stages.
Persist the source checkpoint before starting delivery observation.

## When the larger examples use a runtime

[ExampleRuntime](runtime/example-runtime.ts) extends `Connection` for the
composed lifecycle demos:

| Extra field                       | Purpose                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `operationId(step)`               | Prefix each operation with a unique run ID.                                                 |
| `createExecution(resolveTarget?)` | Construct a client sharing the signer/store and local confirmation policy.                  |
| `polling`                         | Bound how often to observe and how long to pause. This is separate from confirmation count. |
| `report`                          | Present selected results in the optional CLI.                                               |

The earlier `ctx: WorkflowContext` name described this same example-owned
environment. The current name makes its ownership explicit. It is not the
changing transaction state: `prepared`, `simulated`, `submitted` and `outcome`
are separate values.

[local-fork.ts](runtime/local-fork.ts) calls the same `createConnection` after
verifying Anvil and the source parent. It supplies local funding, mining and
cleanup through the runner. Those mechanics are useful when running the
demonstrations; they are independent of learning the package constructors.
