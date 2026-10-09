# Mezo contracts and deployments

This directory helps you find Mezo contract addresses, choose the interfaces
needed to use them, and check the sources behind that information. Start with
the network and the contract you need. If you are investigating an earlier
transaction, you will also need its block number.

## Find a contract and its interface

A **deployment** is a contract at a particular address on a particular network.
The [deployment reference](generated/reference.md#deployments) lists these
addresses, the periods they apply to, and what has been checked for each one.

For pools, gauges, and vaults created or selected by other contracts, also check
the factory that created them or the contract relationships that identify them.
The registry alone does not establish those relationships for every instance.

Once you have the deployment, you need its **ABI** (Application Binary
Interface): the file that tells software how to call the contract's functions
and read the events it emits. The [ABI reference](generated/reference.md#full-abi-artifacts)
links these files and explains where they came from.

To look up a deployment and its interface in code, use the
[Contracts SDK](../../packages/contracts/README.md). Its registry data is generated
from the records in this directory. For operations such as swaps or borrowing,
check the relevant protocol package's documentation as well: a contract's
presence in the registry does not by itself mean the SDK supports that operation.

## Choose the right contract version

An address alone may not tell you which code was running. Some contracts use a
**proxy**, which keeps the same address while forwarding calls to an
implementation that can be upgraded. An upgrade can change the interface too.
Use the [proxy history](generated/reference.md#proxy-implementation-history)
to match the implementation and ABI to the block you are working with.

This matters when reading older activity. For example, the
[historical interface catalog](records/historical-abi-bindings.json) preserves
earlier interfaces for the incentive lock contracts. They help interpret
activity from their recorded periods; they are not additional current SDK
interfaces.

For MUSD bridge events, there is also a known interface correction. The original
TypeChain export for the Native Token Transfers (NTT) manager describes the
`TransferSent` event incorrectly. Use the corrected manager ABI for decoding;
the original export is not a valid historical alternative. The
[event correction record](artifacts/ntt-transfer-event-abi-review-2026-10-07.json)
explains the difference.

<a id="retained-cl-source"></a>

## Read the saved contract source code

The ABI describes how to interact with a contract. If you need to understand
an implementation detail that the references do not explain, you may need its
source code. This repository keeps copies of selected contract sources so you
can inspect them offline; these saved copies are called **retained source**.

For [concentrated liquidity (CL) pools](../protocols/pools/README.md) and their
related contracts, the
[source catalog](sources/pool-source-bundles.json) links the saved code and the
checks connecting it to the recorded deployments. The
[offline source tools](../../scripts/evidence/README.md#source-inspection-and-build-comparison)
let you open a selected file and check that the saved source has not changed
since it was recorded. That check confirms the saved copy; it does not check
the current deployment or renew its review date.

Source is also saved for `ThirdPartyVoter`, the contract used for MEZO Gauge
voting. Its [source record](records/third-party-voter-source.json) connects the
saved code to its deployment, ABI, and build verification. To understand the
voting and rewards themselves, start with the
[incentives explanation](../protocols/incentives/generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives).

## Quick links

Use these shortcuts to return to the contract references and related explanations
introduced above.

| Resource                                                                                                                        | What you will find                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Deployments](generated/reference.md#deployments)                                                                               | Contract addresses by network, the periods they apply to, and their verification scope. |
| [ABI files](generated/reference.md#full-abi-artifacts)                                                                          | Contract interfaces and the sources used to establish them.                             |
| [Contracts SDK](../../packages/contracts/README.md)                                                                             | How to look up deployments and interfaces in code.                                      |
| [Proxy history](generated/reference.md#proxy-implementation-history)                                                            | Implementation changes and the blocks where they apply.                                 |
| [Historical interfaces](records/historical-abi-bindings.json)                                                                   | Earlier incentive lock interfaces for interpreting past activity.                       |
| [MUSD bridge event correction](artifacts/ntt-transfer-event-abi-review-2026-10-07.json)                                         | Why the original NTT manager export cannot correctly decode `TransferSent`.             |
| [Pools and liquidity](../protocols/pools/README.md)                                                                             | How basic and concentrated liquidity pools represent positions.                         |
| [Pool source catalog](sources/pool-source-bundles.json)                                                                         | Saved concentrated liquidity contract code and its verification records.                |
| [Source inspection tools](../../scripts/evidence/README.md#source-inspection-and-build-comparison)                              | How to read saved source files and compare compiled code with deployment evidence.      |
| [ThirdPartyVoter source](records/third-party-voter-source.json)                                                                 | Saved voting contract code, its deployment, ABI, and build verification.                |
| [MEZO Gauge voting and rewards](../protocols/incentives/generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives) | How votes and rewards relate to the ThirdPartyVoter contract.                           |

## Contributing

To update these records, follow the
[knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) and the
[contract evidence rules](../../docs/manifest#contract-identity-and-provenance).
The [module index](index.json) lists the structured records and required checks.
For oracle-specific updates, the
[oracle evidence refresh guide](../../docs/guides/oracle-evidence-refresh.md)
explains how to check mainnet, current testnet state, and historical evidence.
