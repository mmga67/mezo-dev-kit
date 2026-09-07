# ADR-0004 — Capability-profiled external EVM network records

- Status: Accepted
- Date: 2026-08-18

## Context

The initial network knowledge schema was built for Mezo and requires every
network to provide both an EVM chain ID and Mezo/Cosmos-specific fields such as
`cosmosChainId` and `cosmosEvmDenom`. bridge evidence review has verified bridge evidence on
Ethereum and Base, but those external EVM networks cannot truthfully satisfy
the Cosmos-specific shape.

Using empty strings, invented placeholders, or route-local chain identities
would weaken the canonical owner. Copying Ethereum/Base facts into bridge
records would also make the route domain a second network registry.

## Proposed Decision

Network records use a capability profile rather than assuming every EVM
network is Cosmos-backed.

Common fields for the initial EVM scope are:

- stable network ID and environment;
- display name and EVM chain ID;
- native currency name, symbol, and decimals;
- canonical explorer identity;
- explicit EVM and JSON-RPC capabilities;
- evidence, freshness, limitations, and review/support status.

Mezo records additionally use profile `cosmos-evm` and require:

- Cosmos chain ID;
- Cosmos EVM denomination;
- Cosmos SDK, CometBFT, and node-Cosmos-RPC capability fields.

Ethereum/Base records use profile `evm` and must omit—not fake—the
Cosmos-specific fields. The validator rejects Cosmos fields that are required
but missing for `cosmos-evm`, and rejects placeholder Cosmos fields on `evm`.

External network identity requires an authoritative chain specification plus a
fixed RPC `eth_chainId` observation. Endpoint availability remains a separate,
volatile catalog. Adding a network record does not itself publish an MDK route
or choose a default RPC provider.

The initial bridge evidence review extension is bounded to:

- `ethereum-mainnet`;
- `base-mainnet`.

BSC, Solana, and Bitcoin network/program semantics remain outside this
decision until a selected workflow requires them.

## Alternatives

- Put Ethereum/Base identity directly in bridge routes: rejected because it
  creates a second network authority.
- Fill Cosmos fields with `not-applicable` strings: rejected because invalid
  data would pass a structurally misleading schema.
- Model every ecosystem immediately: rejected because it expands beyond the
  evidence-scoped initial EVM routes.

## Consequences

- bridge evidence review can reference canonical Ethereum/Base IDs without weakening Mezo's
  richer Cosmos/EVM record.
- Consumers must branch on declared capabilities rather than field presence or
  chain-name assumptions.
- Existing Mezo records retain all current facts; the schema/validator change
  is additive in meaning but deliberate in structure.
- A later non-EVM record requires a separate profile decision rather than
  stretching this initial model.

## Acceptance Gate

Architecture and network/security review must accept or revise the capability
profile, evidence requirements, and initial external-network scope. Only then
may network registry review add Ethereum/Base canonical records and bridge evidence review replace its
evidence-local network references with registry-owned identities.

## Acceptance

Accepted by the human maintainer on 2026-08-21 without amendment. The approved
implementation scope is limited to capability-profiled `ethereum-mainnet` and
`base-mainnet` records required by the evidence-scoped bridge evidence review routes. It does
not add BSC, Solana, Bitcoin, default providers, or route support.
