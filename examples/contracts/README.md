# Resolve a deployment

[resolve-deployment.ts](resolve-deployment.ts) validates a contract ID and uses
`createContractRegistry().resolve()` with a network and block number. Inspect
the returned address, deployment ID, proxy implementation and `readAbi`.
`abi` contains provenance/digest metadata; `readAbi` is the callable interface.

For a historical read or event, pass that operation's block. An unknown identity
or unavailable generation rejects. Resolution is metadata lookup; protocol
readers separately verify runtime bytes and live state.

The offline [foundation program](../foundations.ts) includes a concrete MUSD
lookup. [Package reference](../../packages/contracts/REFERENCE.md).
