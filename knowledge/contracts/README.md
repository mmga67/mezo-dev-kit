# Mezo contracts and deployments

A contract address identifies a deployment on a particular network. Its ABI
describes the interface used to call it and decode events. For upgradeable
contracts, the implementation and matching interface can change while the proxy
address stays the same, so the block or version matters too.

This directory connects deployment identities, interface files, implementation
history, and the evidence behind them. The Contracts SDK derives its registry
data from these records.

## Resolve a deployment or interface

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

## Match the interface to the operation

Select the network and block when resolving a deployment. A historical interface
helps decode activity from its recorded period; it may not describe the contract
you would call today. Pools, gauges, and vaults created or selected dynamically
must be checked through their factory or contract relationships.

The [historical interface catalog](records/historical-abi-bindings.json) records
the escrow interfaces and implementation periods used to check earlier
incentives observations. These retained interfaces do not become additional
current SDK interfaces. Use the deployment reference for the applicable
implementation history and observation dates.

Checking a contract's identity and source does not establish that a protocol
operation or bridge route is supported. The SDK documentation above describes
registry use; the relevant protocol package owns operation availability. The
[contract evidence rules](../../docs/manifest#contract-identity-and-provenance)
explain how identities and sources are established.

For MUSD NTT event decoding, use the corrected manager interface. The retained
[event correction](artifacts/ntt-transfer-event-abi-review-2026-10-07.json)
explains why the original TypeChain export's `TransferSent` layout is incorrect;
that export must not be selected as a historical deployment interface.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
