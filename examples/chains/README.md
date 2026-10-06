# Select and verify a network

[selectNetwork](select-network.ts) takes an untrusted network selection and your
application's `RpcRequest` function. `networkChoices` provides values for a picker.
The recipe resolves registry metadata, reads the endpoint's chain ID and rejects
a mismatch before returning the selected network.

Metadata identifies a chain; it does not prove that an endpoint is healthy or
serves that chain today. URLs, credentials and provider policy come from the
application. This recipe needs no wallet. Continue with
[connections](../SETUP.md) or the [Chains reference](../../packages/chains/REFERENCE.md).
