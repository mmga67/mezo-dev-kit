# Mezo contracts and deployments

Look up contract deployments, ABI interfaces, proxy generations, and the source evidence behind them. This is the source of the Contracts SDK’s generated registry data.

## Start here

- [Deployment reference](generated/reference.md#deployments): addresses, networks, validity, and review scope.
- [Proxy history](generated/reference.md#proxy-implementation-history): implementation generations and their coordinates.
- [Full ABI artifacts](generated/reference.md#full-abi-artifacts): interfaces and provenance.
- [Contracts SDK](../../packages/contracts/README.md): resolve deployments and interfaces in code.
- [Oracle evidence refresh](../../docs/guides/oracle-evidence-refresh.md): current commands and the distinction between mainnet, current testnet state, and historical evidence.

## Retained CL source

For an implementation detail missing from the call references, use the
[offline source tools](../../scripts/evidence/README.md#source-inspection-and-build-comparison).
The [retained source catalog](sources/pool-source-bundles.json)
links exact bundles and their reproduction evidence. Inspection verifies the
recorded source digest; it does not recapture deployments or renew review dates.

For MEZO Gauge voting, the [retained ThirdPartyVoter source](records/third-party-voter-source.json)
links its full explorer capture to the existing deployment, canonical ABI and
accepted reproduction. The [incentives reference](../protocols/incentives/generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives)
owns its voting and reward explanation.

## Scope and evidence

Select the network and block when resolving a deployment. Current and historical
interfaces are distinct; a historical observation does not establish a current
writer target. Dynamic pool, gauge, and vault roles are verified through their
roots rather than assigned invented registry identities.

Registry acceptance covers the recorded identity and evidence. It does not
establish protocol, route, or operation support. The [contract evidence rules](../../docs/manifest#contract-identity-and-provenance)
define provenance requirements; each indexed record retains its own scope and dates.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
