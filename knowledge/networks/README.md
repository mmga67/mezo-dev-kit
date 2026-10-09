# Mezo networks and connections

Connecting to a chain involves two choices: which network to use, and which
provider will answer requests. A chain ID identifies the network; an RPC endpoint
is a provider's connection to it. Knowing the chain ID does not establish which
requests a provider can answer.

This directory records chain identities, published Mezo endpoints, and the
requests used to check them. It covers Mezo Mainnet, Mezo Testnet, Ethereum
Mainnet, and Base Mainnet; the Ethereum and Base identities do not select an RPC
provider for you.

## Choose a network and connection

- **Identify the chain:** the [network reference](generated/reference.md#networks)
  lists identifiers, native currency units, and recorded network capabilities.
- **Choose a Mezo provider:** [endpoint observations](generated/reference.md#published-rpc-endpoints)
  show which connections were checked, when, and with what limits.
- **Configure an application:** use the [Chains SDK](../../packages/chains/README.md)
  for typed identities and [connection setup](../../examples/SETUP.md) to supply
  your selected provider.

## What an endpoint check tells you

A successful request establishes the result for that provider at the recorded
time. It does not establish continuous availability, historical-data access,
subscriptions, batching, or methods that were not tested. Read the selected
observation's date and limitations before relying on it; provider behavior can
change more quickly than chain identity.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
