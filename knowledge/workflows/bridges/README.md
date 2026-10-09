# Bridge routes and delivery

A bridge transfer has work to complete on both its source and destination
chains. Confirming the source transaction is only one step: delivery requires
matching evidence that the intended transfer reached the destination.

This directory explains MUSD transfers through Wormhole Native Token Transfers
(NTT) and routes through the Mezo Native Bridge. Each route identifies its asset,
direction, and representation on the receiving chain. The two bridge systems
use different rules to match source activity to delivery.

## Follow a transfer

Start with the asset and direction in the [bridge reference](generated/reference.md).
These determine which bridge handles the transfer, which token the recipient
receives, and what evidence is needed to establish delivery.

For MUSD NTT, the [NTT guide](../../../docs/reference/bridges/musd-ntt.md)
follows a message from its source transaction to the destination. Matching the
message digest, its unique identifier, connects the two sides. The
[Native Bridge guide](../../../docs/reference/bridges/native-bridge.md)
uses identifiers specific to each direction and, where required, checks the
recipient's resulting state.

If the destination evidence is missing, first establish what was actually
observed. An incomplete scan or unavailable history can leave the outcome
unknown. The [indexing and reconciliation guide](../../../docs/guides/INDEXING_RECONCILIATION.md)
explains how to investigate that gap; missing evidence alone is not a reason to
send the funds again.

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

## Quick links

| Link                                                                                     | What you will find                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [MUSD NTT guide](../../../docs/reference/bridges/musd-ntt.md)                            | Transfer messages, matching identifiers, and recovery rules.                     |
| [Native Bridge guide](../../../docs/reference/bridges/native-bridge.md)                  | Direction-specific transfers and recipient settlement.                           |
| [Bridge reference](generated/reference.md)                                               | Recorded assets, route candidates, and delivery requirements.                    |
| [Current asset review](review/gaps.md#native-bridge)                                     | SolvBTC/xSolvBTC restrictions and unresolved configuration questions.            |
| [Bridges SDK](../../../packages/bridges/README.md)                                       | Implemented transfer, recovery, and observation APIs with their limits.          |
| [Indexing and reconciliation](../../../docs/guides/INDEXING_RECONCILIATION.md)           | Investigating missing history and uncertain outcomes.                            |
| [Mezo's economic system](../../../docs/architecture/mezo-economic-system-composition.md) | BTC custody, asset representations, and the wider published bridge architecture. |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
