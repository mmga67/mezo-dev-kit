# Resolve a contract at a block

[inspectDeployment](resolve-deployment.ts) accepts a contract ID, network ID and
block number. It validates the ID and returns the registry's deployment and
read ABI for that coordinate. It is an offline lookup and needs no wallet.

The block matters: a proxy can use different implementation generations over
time. Keep historical decoding at the historical coordinate. Registry metadata
is not a fresh runtime identity check; execution readers perform the applicable
live checks separately. Use `readAbi` for read encoding and keep ABI digest
metadata distinct from callable entries.

See [coherent reads](../core/README.md) next and the
[Contracts reference](../../packages/contracts/REFERENCE.md) for resolution errors.
