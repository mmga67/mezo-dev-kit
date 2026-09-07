# Superseded contract registry schema notes

> Superseded by the v0.4 common schemas, `schema/v1/*.schema.json`, and the
> semantic contract validator during contract schema migration. Retained as migration history;
> do not use this file as the current structural contract.

# Contract Registry And Evidence Record Contract

The machine-readable files in this directory use schema version `1`. The
dependency-free validator in `scripts/validate-contract-knowledge.ts` is the
executable contract until the proposed registry ownership decision is accepted.

## Stable Contract And Deployment IDs

A contract ID names a protocol role independently of network, for example
`musd.trove-manager`. The first deployment normally uses:

```text
<contractId>@<networkId>
```

If the same role is redeployed at a new address on the same network, later
records append a stable `#<deployment-key>` suffix. Consumers do not construct
or select deployment IDs directly; they resolve the contract ID plus network
and block/transaction validity coordinate. The validator rejects overlapping
ranges for the same contract/network pair.

Addresses are properties of deployments, never identifiers used across
networks. Contract records reference network IDs owned by
`knowledge/networks/`.

## Deployment Records

Every deployment contains:

- stable contract/deployment IDs, source and Solidity names, protocol, domains,
  network, environment, and normalized address;
- deployment activation and current-code validity coordinates;
- direct/proxy type and, for proxies, the exact ERC-1967 slots, current admin,
  current implementation, and ordered `Upgraded` event ranges;
- one ABI-catalog reference and an explicit application scope;
- pinned official source artifact path and digest;
- current proxy/implementation code digests at one recorded network block;
- one bidirectionally linked observation;
- status, proposed support/review gates, and limitations.

Validity coordinates use block number plus transaction hash and, for upgrade
events, log index. `effectiveUntilExclusive` points to the next event
coordinate. This avoids pretending that block numbers alone order multiple
changes within the same block.

Historical proxy implementation addresses are evidence only. Only the ABI for
the current implementation is in the promoted catalog.

## ABI Records

Each file under the legacy `abis/` path was a full JSON ABI array. The current
`contract-abis` resource and indexed `artifacts/abis/` files record:

- stable contract ID and repository path;
- entry count and exact file SHA-256;
- canonical and order-insensitive semantic ABI digests;
- pinned official source and both network-specific deployment-artifact digests.

Untracked ABI files are invalid. ABI fragments are not accepted as canonical
snapshots. Future generated bindings must derive from this catalog and carry
the input digest.

## Sources And Evidence

Repository sources pin a full commit, package/version, and license. Official
documentation sources pin the exact commit, path, and content digest. Every
deployment artifact has its own digest in `sourceArtifacts`.

The observation set records:

- one fixed recent block and verified chain ID per network;
- deployment receipt or an explicit official-explorer fallback;
- current code and implementation code digests;
- ERC-1967 slot results and complete observed `Upgraded` histories;
- fully verified explorer source metadata;
- semantic equality of the explorer ABI and official full artifact ABI;
- equality of explorer deployed bytecode and RPC code.

Mezo testnet's public RPC omitted some historical receipts and blocks during the
recorded run. Those observations name the explorer fallback explicitly. No
missing RPC result is treated as success by itself.

Some official Hardhat deployment artifacts retain zero placeholders where
constructor/immutable values occur in runtime bytecode. Such comparisons are
recorded separately. Promotion still requires the fully verified explorer
deployed bytecode to match RPC exactly and the explorer ABI to match the pinned
official artifact.

## Status And Review

- `verified-current` means all automated evidence checks passed for the stated
  observation block and current code version.
- `verified-superseded` plus `supportStatus: historical` closes a deployment
  range without making its old address a current support target.
- `proposed` means the deployment/ABI is not a released MDK support promise.
- `pending-qualified-review` is the required Level 3 human review gate.
- `reviewAfter` expires volatile current-state evidence.

Candidates with partial verification, missing builds, absent chain ownership,
or unclear product intent remain in `candidates.md`; headings or official docs
alone do not promote them.
