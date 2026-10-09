# Transactions and RPC behavior

A transaction hash identifies a submitted transaction. A receipt shows whether
it was included and how its execution ended. Protocol completion adds another
question: did the intended operation produce the expected changes? Cross-chain
operations also need evidence from the destination.

This directory explains those states, the client behavior needed to follow them,
and what recorded remote procedure call (RPC) requests establish about a
provider. RPC is the interface an application uses to read chain data and submit
transactions.

## Determine what happened

Before submission, prepare and simulate the intended call against the relevant
chain state. Token approval, when needed, is a separate transaction. Its result
must be taken into account when preparing the operation that spends the tokens.

After submission, track the transaction through inclusion and the application's
chosen confirmation policy. Then compare the resulting events and state with
the protocol's expected outcome. This last step is reconciliation. The
[transaction lifecycle guide](../../../docs/reference/transaction-lifecycle.md)
connects these stages; the [Core SDK](../../../packages/core/README.md) documents
the implemented read, execution, and event-scanning APIs.

An unavailable receipt or interrupted request can leave the outcome unknown.
Keep the submission record and investigate the existing transaction before
considering another attempt. The
[indexing and reconciliation guide](../../../docs/guides/INDEXING_RECONCILIATION.md)
explains how incomplete history and chain reorganizations affect that investigation.

## Interpret provider observations

The Mezo observations cover only the methods, provider, network, and time tested.
Their required protocol review is still pending. They do not establish general
Ethereum compatibility or provider reliability; the shared
[evidence and support guide](../../README.md#evidence-review-and-support)
explains the review labels.

Receipt inclusion, the chosen confirmation
policy, and protocol-specific reconciliation must agree. Cross-chain delivery
also needs destination evidence. The [execution baseline](../../../docs/manifest#shared-client-and-transaction-lifecycle)
owns shared rules. Use the Core SDK documentation above for implemented APIs and
their operation requirements.

## Quick links

| Link                                                                                 | What you will find                                                   |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [Transaction lifecycle guide](../../../docs/reference/transaction-lifecycle.md)      | The path from preparation to a reconciled protocol outcome.          |
| [Lifecycle and RPC reference](generated/reference.md)                                | State definitions, provider observations, and protocol requirements. |
| [Core SDK](../../../packages/core/README.md)                                         | Current read, execution, tracking, and event-scanning APIs.          |
| [Indexing and reconciliation](../../../docs/guides/INDEXING_RECONCILIATION.md)       | Scan coverage, chain reorganizations, and uncertain outcomes.        |
| [Execution baseline](../../../docs/manifest#shared-client-and-transaction-lifecycle) | Shared responsibilities for applications and protocol packages.      |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
