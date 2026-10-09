# Bridge routes and delivery

Understand MUSD Wormhole NTT and Mezo Native Bridge routes, asset representations, and the evidence needed to establish cross-chain delivery.

## Start here

- [Mezo's economic system](../../../docs/architecture/mezo-economic-system-composition.md): BTC/Threshold custody, Bitcoin and Ethereum entry, other assets, and token-specific Wormhole destinations.
- [MUSD NTT guide](../../../docs/reference/bridges/musd-ntt.md): messages, lifecycle, and delivery evidence.
- [Native Bridge guide](../../../docs/reference/bridges/native-bridge.md): direction-specific settlement rules.
- [Bridge reference](generated/reference.md): recorded route candidates and provider completion rules.
- [Bridges SDK](../../../packages/bridges/README.md): private NTT/Native preparation, NTT recovery and bounded delivery observers.
- [Indexing and reconciliation](../../../docs/guides/INDEXING_RECONCILIATION.md): scans, checkpoints, and partial evidence.

## Scope and evidence

The [current asset configuration review](review/gaps.md#native-bridge) records
the SolvBTC/xSolvBTC wind-down notice and the October 6 deposit restrictions.
Historical mappings do not establish current deposit or withdrawal availability.

The bounded provider/route model has accepted review, but routes remain
evidence-verified and unsupported; module support is `none`. Additional private
NTT preparation and Native source/delivery evidence received maintainer acceptance
as-is on October 7; support remains proposed. The [continuity capture](artifacts/private-scope-reverification-2026-10-07.json)
checks current Native minimums and NTT configuration. Contract history and current
operation readiness are separate.

NTT delivery joins the same digest on both chains. Native delivery joins the
correct direction-specific tuple and settlement evidence, including recipient
post-state where required. A source receipt, attestation, successful system
transaction, or stored indexer status alone does not prove delivery.

The [Native source qualification](evidence/native-transfer-2026-09-15.json) pins
current token/bridge state and source compatibility for the two initial routes.
It documents native BTC approval, inbound mint authority and current withdrawal
fees. A confirmed failed recipient payout requires governance recovery; it has
no automatic retry. These implementation checks do not promote route support.

BSC, Solana, MEZO NTT, Bitcoin delivery, other mappings, and untested directions
remain outside this module's qualified route scope. This is a coverage limit,
not a statement that Mezo lacks these bridges. Use the sourced economic-system
explanation for the wider published architecture; do not generalize the MUSD
NTT network set to MEZO or treat a documented destination as a verified SDK route.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
