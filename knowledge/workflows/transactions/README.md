# Transactions and RPC behavior

A transaction hash identifies a submitted transaction. A receipt shows whether
it was included and how its execution ended. Protocol completion adds another
question: did the intended operation produce the expected changes? Cross-chain
operations also need evidence from the destination.

This directory explains those states, the client behavior needed to follow them,
and what recorded RPC requests establish about a provider.

## Determine what happened

- [Transaction lifecycle guide](../../../docs/reference/transaction-lifecycle.md): follow an action from preparation through reconciliation.
- [Lifecycle and RPC reference](generated/reference.md): state distinctions, recorded observations, and protocol requirements.
- [Indexing and reconciliation guide](../../../docs/guides/INDEXING_RECONCILIATION.md): scan event history, handle chain reorganizations, and recognize incomplete results.
- [Core SDK](../../../packages/core/README.md): current read, execution, and event-scanning APIs.

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

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
