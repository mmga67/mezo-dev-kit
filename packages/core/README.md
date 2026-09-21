# Core reads and execution

`@mezo-dev-kit/core` coordinates contract reads, explicit transaction execution, and bounded event scans. It checks shared chain and transaction conditions while protocol packages interpret values and outcomes.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the Core client example](../../examples/core/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Choose a client

| Task                                                         | Start with                                               |
| ------------------------------------------------------------ | -------------------------------------------------------- |
| Read several contracts at one block                          | `createCoreReadClient`                                   |
| Prepare, simulate, submit, and track an explicit transaction | `createExecutionClient`                                  |
| Adapt an application-owned RPC request function              | `createRpcTransport` and, for signing, `createRpcSigner` |
| Scan a bounded event range and resume from a checkpoint      | `createEventScanner`                                     |

Applications supply the transport and its timeouts/cancellation policy.
Execution also requires an explicit signer, confirmation policy, and submission
store. The [transport contract](REFERENCE.md#implementing-the-transport) explains
how every request preserves its chain, block number, and hash.

## Handle results explicitly

Required read failures reject the logical read. Optional failures return
`unavailable`; raw values remain `unknown` until the owning protocol decodes
and validates them. Never display an unavailable value as zero.

A transaction hash starts tracking. Receipt confirmation and protocol
reconciliation establish the outcome. [Token approvals](../tokens/README.md)
are separate transactions. Applications retain intent and submission records
for recovery; an uncertain response is not a reason to repeat a whole workflow.

## Scope

Core is a private workspace package. Execution currently supports explicitly
selected EOAs without delegated code; smart-account integration is outside its
API. It selects no provider, stores no credentials, and supplies no wallet UI.
Protocol packages retain their own verification and release boundaries.

[Event scan coverage](REFERENCE.md#bounded-event-scanning) describes the checked
query range. Applications own checkpoint persistence; a complete scan does not
prove a protocol action or cross-chain delivery completed.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/core check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
