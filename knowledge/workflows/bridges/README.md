# Bridge routes and delivery

A bridge transfer has work to complete on both its source and destination
chains. Confirming the source transaction is only one step: delivery requires
matching evidence that the intended transfer reached the destination.

This directory explains MUSD transfers through Wormhole Native Token Transfers
(NTT) and routes through the Mezo Native Bridge. Each route identifies its asset,
direction, and representation on the receiving chain. The two bridge systems
use different rules to match source activity to delivery.

## Follow a transfer

- **Understand MUSD NTT:** the [NTT guide](../../../docs/reference/bridges/musd-ntt.md)
  follows messages and matches the same transfer digest on both chains.
- **Understand Native Bridge delivery:** the [Native Bridge guide](../../../docs/reference/bridges/native-bridge.md)
  explains the identifiers and settlement evidence required in each direction,
  including recipient state where needed.
- **Look up a recorded route:** the [bridge reference](generated/reference.md)
  identifies the assets, providers, route candidates, and completion rules covered
  by the retained evidence.
- **Investigate an incomplete transfer:** [indexing and reconciliation](../../../docs/guides/INDEXING_RECONCILIATION.md)
  explains partial scans and uncertain outcomes. Missing evidence alone is not a
  reason to send the funds again.
- **Understand BTC custody and other entry routes:** [Mezo's economic system](../../../docs/architecture/mezo-economic-system-composition.md)
  describes the wider published architecture and token-specific destinations.

## Check the route's limits

The [current asset configuration review](review/gaps.md#native-bridge) records
the SolvBTC/xSolvBTC wind-down notice and the October 6 deposit restrictions.
Historical mappings do not establish current deposit or withdrawal availability.

A source receipt, attestation, successful system transaction, or stored indexer
status alone does not prove delivery. A confirmed Native withdrawal with a failed
recipient payout requires governance recovery; it has no automatic retry.

BSC, Solana, MEZO NTT, Bitcoin delivery, other mappings, and untested directions
remain outside the routes verified by this module. This is a coverage limit,
not a statement that Mezo lacks these bridges. Use the sourced economic-system
explanation for the wider published architecture; do not generalize the MUSD
NTT network set to MEZO or treat a documented destination as a verified SDK route.

## Use bridges in an application

The [Bridges SDK](../../../packages/bridges/README.md) documents private transfer
preparation, NTT recovery, and delivery observers, with their asset and direction
limits. These implementations do not provide supported public routes, a relayer,
or an automatic retry service. Review of recorded transfers does not establish
that a new transfer is ready to send; configuration, fees, and transfer checks
must apply to that operation. See the shared
[evidence and support guide](../../README.md#evidence-review-and-support)
for the meaning of review and support labels in the reference.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
