# Mezo networks and connections

Connecting to a chain involves two choices: which network to use, and which
provider will answer requests. A chain ID identifies the network. An RPC
(remote procedure call) endpoint is the address an application uses to ask a
provider for chain data or submit a transaction. Knowing the chain ID does not
establish which requests that provider can answer.

This directory records chain identities, published Mezo endpoints, and the
requests used to check them. It covers Mezo Mainnet, Mezo Testnet, Ethereum
Mainnet, and Base Mainnet; the Ethereum and Base identities do not select an RPC
provider for you.

## Choose a network and connection

Start with the [network reference](generated/reference.md#networks) to identify
the chain, its native currency and the capabilities recorded for it. Mezo has
both EVM and Cosmos identifiers; use the identifier required by the interface
you are calling rather than treating them as interchangeable.

Next, choose a provider for that network. The
[endpoint observations](generated/reference.md#published-rpc-endpoints) show
which Mezo connections were checked and which requests succeeded. An application
that needs old state or subscriptions should check those specific capabilities,
as well as whether the provider is available now.

The [Chains SDK](../../packages/chains/README.md) supplies typed network
identities. It makes no network requests and does not choose a provider.
[Connection setup](../../examples/SETUP.md) shows how to supply your selected
connection when using the SDK.

## What an endpoint check tells you

A successful request establishes the result for that provider at the recorded
time. It does not establish continuous availability, historical-data access,
subscriptions, batching, or methods that were not tested. Read the selected
observation's date and limitations before relying on it; provider behavior can
change more quickly than chain identity.

## Quick links

| Link                                                                    | What you will find                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Network identities](generated/reference.md#networks)                   | Chain identifiers, native currencies and recorded capabilities. |
| [Provider observations](generated/reference.md#published-rpc-endpoints) | Published Mezo endpoints, check dates and observed limitations. |
| [Chains SDK](../../packages/chains/README.md)                           | Network lookup and typed identity results.                      |
| [Connection setup](../../examples/SETUP.md)                             | Supply a provider to an application or example.                 |
| [Module index](index.json)                                              | Exact network, endpoint, source and evidence records.           |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
