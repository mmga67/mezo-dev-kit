# Select a network

[select-network.ts](select-network.ts) uses `listNetworks()` for picker values,
`isNetworkId()` to narrow unknown input and `getNetwork()` to resolve its identity.
`selectNetwork(selection, request)` then checks `eth_chainId` through the caller's
RPC port. Selecting Mezo while the endpoint reports Ethereum rejects.

The application supplies the request function and endpoint. Chains supplies no
RPC URL or provider health guarantee. The offline [foundation program](../foundations.ts)
prints the available network identities; the connection check performs one read
when invoked with a real request port.

[Connection guide](../SETUP.md) · [Package reference](../../packages/chains/REFERENCE.md).
