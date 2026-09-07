# Mezo contract knowledge

This module is the canonical MDK bootstrap input for contract identities,
network deployments, current full ABIs, proxy histories, source provenance,
and bounded deployment evidence. It is structurally migrated to the accepted
knowledge-module v0.4 contract.

## Current status

The catalog contains 58 contract IDs, 86 deployments, and 58 full ABI records.
Of those, all 58 ABIs and 85 current deployments are supported; one superseded
Assets Bridge deployment remains historical. oracle re-verification accepted the
post-upgrade Pyth ABI and its two current deployment generations for bounded
registry-only support.
The original 21 contract IDs, 42 Mezo deployments, and 21 ABIs were accepted by
contract registry review/contract schema migration. registry provenance review subsequently accepted nine additional identities,
thirteen deployments, and nine ABIs for the bounded incentives and bridge
registry scope. emission evidence review, pool evidence review, institutional debt evidence review, and oracle evidence review accepted twenty
additional identities, twenty-two deployments, and twenty ABIs. The six
economic-system additions were accepted separately: Savings evidence review accepted the
Savings identity, lending evidence review accepted the Morpho, IRM, and oracle identities, and
vault evidence review accepted the vault adapter and wrapper identities. validator evidence review accepted
the two validator factory identities, and bridge evidence review accepted the current
generation-6 Assets Bridge deployment while retaining generation 5 as
historical provenance. Registry placement does not create
incentives-operation, bridge-route, relayer, quote, writer, public-package, or
product support.

ADR-0001 owns the bootstrap knowledge registry until a separately accepted
public package API supersedes it. Accepted ADR-0005 is implemented in the
registry schema, semantic validator, negative tests, and generated reference.
The accepted bootstrap records retain their
`official-artifact-fully-verified-deployment` classification, while the
accepted incentives and bridge records use their applicable evidence classes
without weakening or relabeling provenance.

The bounded current incentives graph, MUSD NTT and Native Bridge roots, seven
documented mainnet CL roots, three institutional MUSD proxy identities, and
the two oracle roots have accepted registry identities, ABIs, and activation
records. oracle re-verification accepted the current post-upgrade Pyth ABI and implementation
generations without relabeling the active implementations as explorer-verified
or promoting feed liveness.
The Savings root, Morpho/IRM/oracle, USDC-vault market adapter/receipt wrapper,
validator factory roots, and post-v13 Assets Bridge execution generation have
accepted registry records. VaultV2 and VaultGauge remain accepted protocol-role candidates rather
than registry identities because their explorer records omit creation input.
Dynamic pools/gauges,
testnet CL roots, bridged-token identities, and other deferred surfaces remain
review candidates. Filesystem placement and registry lifecycle never imply
protocol or workflow support.

## Human use

Savings reader review adds the proposed `savings-dynamic-read-interfaces` resource and full
explorer source/ABI snapshots under `artifacts/dynamic-interfaces/`. These
exact-runtime templates serve root-discovered Savings roles; they add no
static IDs, deployment records, or supported entries to the ABI catalog.
The Savings projection check validates their bytes and bounded view surfaces.
Qualified review remains pending for this additional scope.

For a readable registry snapshot, open
[`generated/reference.md`](./generated/reference.md). It is generated from the
indexed deployment, ABI, source, and observation resources and must not be
edited manually.

For exact machine-readable data:

1. open [`index.json`](./index.json);
2. resolve stable resources such as `contract-deployments`, `contract-abis`,
   `contract-sources`, or a specific `abi.<contract-id>`;
3. select a deployment by contract ID, network ID, and validity coordinate;
4. check support, review, verification time, review date, scope, and
   limitations;
5. follow source and evidence references when protocol-sensitive use requires
   proof or re-verification.

Addresses belong to deployment records. Full ABI arrays are immutable
`artifacts/` resolved through the ABI catalog. Other domains reference stable
IDs and never own copied addresses, artifact paths, or ABI digests.

For a proxy used at the present evidence coordinate, resolve the latest
verified open implementation generation and its current ABI. Historical
generations remain in closed, non-overlapping ranges for replay and audit; a
historical request must supply its coordinate and must not inherit the latest
ABI by default.

## Maintenance

Follow the repository
[`knowledge-management standard`](../../docs/standards/knowledge-management.md).
Canonical catalogs are under `records/`, pinned provenance under `sources/`,
bounded observations under `evidence/`, raw full ABIs under `artifacts/`,
executable structural schemas under `schema/`, and candidates/history under
`review/`.

Run from the repository root:

```bash
node scripts/validate-knowledge-structure.ts --module contracts
node scripts/test-contract-provenance.ts
node scripts/validate-contract-knowledge.ts
node scripts/generate-contract-reference.ts --check
```

The evidence importer is retained for reproducibility. It requires temporary
checkouts at the exact official commits plus read-only network access and
regenerates point-in-time evidence. Do not run it as routine formatting work:
every result requires digest, deployment, freshness, and qualified review.
New ABI records must declare an intended network scope and a non-empty
network/version-scoped artifact list. A provenance class never falls back to a
weaker class when evidence is absent.

## Network-scoped reader acceptance

mainnet evidence refresh appends a complete mainnet oracle re-verification while preserving
the August 27 observations and the unresolved testnet freshness deadline.
`node scripts/validate-contract-knowledge.ts --network mezo-mainnet` checks
current evidence freshness for mainnet deployments and retains shared
structural/provenance validation. The unscoped command still checks all
current envelopes and remains blocked by current-state oracle verification. See the
[refresh guide](../../docs/guides/oracle-evidence-refresh.md) for capture, import,
and the mainnet reader acceptance command.

## Lending and vault reader candidates

`lending-mainnet-runtime-bytes` retains historical code bytes checked against
accepted deployment digests for reader regression fixtures. It does not extend
source or deployment freshness. `vault-dynamic-read-interfaces` retains full
source/ABI snapshots for the vault reader; source, compiler settings, ABIs, and
runtime bytes match the accepted source-reproduction generation. The profile
catalog retains proposed protocol support and received bounded reader/interface
acceptance on 2026-09-07.
VaultV2 and VaultGauge remain runtime roles, with no static registry identity.
Package projections are checked by the root generation gate.
