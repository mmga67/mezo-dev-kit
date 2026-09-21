# Transactions and RPC behavior

Understand transaction states, shared client requirements, and recorded Mezo RPC behavior. Use this module to tell submission, confirmation, and protocol completion apart.

## Start here

- [Transaction lifecycle guide](../../../docs/reference/transaction-lifecycle.md): follow an action from preparation through reconciliation.
- [Lifecycle and RPC reference](generated/reference.md): state distinctions, recorded observations, and protocol requirements.
- [Indexing and reconciliation guide](../../../docs/guides/INDEXING_RECONCILIATION.md): bounded scans, checkpoints, reorgs, and partial evidence.
- [Core SDK](../../../packages/core/README.md): current read, execution, and event-scanning APIs.

## Scope and evidence

The lifecycle architecture is accepted. Mezo observations remain bounded by
the methods, provider, network, and time tested and retain their pending qualified
review. They do not promise general Ethereum compatibility or provider reliability.

A transaction hash is not success. Receipt inclusion, the chosen confirmation
policy, and protocol-specific reconciliation must agree. Cross-chain delivery
also needs destination evidence. The [execution baseline](../../../docs/manifest#shared-client-and-transaction-lifecycle)
owns shared rules; this module's records and package APIs have separate scopes.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
