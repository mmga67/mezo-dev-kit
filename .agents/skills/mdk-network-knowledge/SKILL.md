---
name: mdk-network-knowledge
description: Resolve network identity, Mezo RPC metadata, capability evidence and generated network projections. Use for chain or provider configuration.
---

# Network knowledge

## Purpose

Use and maintain capability-profile network identity, Mezo RPC provider metadata, capability
evidence, and generated `packages/chains` projections without creating duplicate
sources of truth.

## Use When

- Adding or changing a network identity or capability profile.
- Configuring chain IDs, native currency, explorers, or RPC transports.
- Investigating a chain mismatch or provider capability.
- Generating or reviewing `packages/chains` data.
- Verifying network facts needed by contract, protocol, tooling, or template
  work.

## Do Not Use When

- The task concerns contract addresses or ABIs; use the contracts skill and
  registry evidence.
- The task concerns bridge route network IDs or non-EVM destinations; use the
  bridge/protocol workflow guidance as well.
- The task only needs application wallet UX policy; that is not chain knowledge.

## Relevant Repository Areas

- `knowledge/networks/`
- `packages/chains/`
- `docs/manifest`
- `docs/reference/` for future generated reference output

## Canonical Sources

Read in this order:

1. Root `AGENTS.md` and the active task.
2. `knowledge/AGENTS.md` and
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` for maintenance.
3. `knowledge/networks/README.md` and `knowledge/networks/index.json`.
4. Only the logically referenced network, endpoint, source, and evidence records.
5. Accepted architecture/ADRs and `packages/chains` package docs when present.
6. Current official sources identified by resource `network-sources`.

## Procedure

For contributor package usage, use the root-routed capability assessment once,
then consume Chains for supported identity and inject the selected transport.
Verify only the endpoint methods required by the operation; package availability
and endpoint availability are separate. The maintenance steps below apply when
records or projections change, not to every ordinary knowledge read.

1. Classify the change as stable chain identity, volatile endpoint state,
   capability evidence, or generated/runtime projection.
2. Resolve the stable network or endpoint through module/resource/record IDs in
   `knowledge/networks/index.json`; do not retain its physical path as identity.
3. Re-verify any expired or task-sensitive endpoint observation before use.
4. For a new or changed fact, capture an atomic claim, exact scope, pinned
   authoritative source, verification time, limitation, and review date.
5. Keep EVM chain ID, Cosmos chain ID, bridge route ID, and RPC provider identity
   separate.
6. Use `cosmos-evm` only for networks with verified Cosmos fields; plain EVM
   networks must not receive invented Cosmos identifiers or capabilities.
7. Keep newly added Level 3 records `proposed` and
   `pending-qualified-review` until qualified review is recorded.
8. Update the canonical record and bounded evidence first.
9. Run the common structure validator and network semantic validator.
10. Regenerate runtime/docs projections when generation exists; do not hand-edit
    generated values.
11. Apply Level 3 review to chain IDs, currency/unit metadata, or public support
    changes.

## Architecture Rules

- `knowledge/networks/` owns verified source data until an accepted registry ADR
  transfers canonical structured inputs to `packages/chains`.
- Provider endpoints are not chain identity and may have shorter review windows.
- A network identity record may exist without an endpoint record; identity does
  not select a provider or imply operational support.
- A successful endpoint probe establishes only the methods and moment tested.
- Public packages, examples, docs, and skills reference or derive from canonical
  records; they do not maintain independent values.
- Unsupported or failed endpoints remain explicit when omission would hide a
  current official-source conflict.

## Verification

Run:

```sh
node scripts/validate-knowledge-structure.ts --module networks
node scripts/test-network-profiles.ts
node scripts/validate-network-knowledge.ts
node scripts/generate-network-reference.ts --check
```

For endpoint re-verification, use read-only `eth_chainId` plus only the bounded
methods required by the task. Record target, method, time, response identity,
and block hash/number when a recent block is checked. Never infer uptime,
archive support, batching, subscriptions, or full EVM compatibility from an
unrelated successful call.

## Stop Conditions

Stop and request qualified review when:

- official sources disagree on chain or currency identity;
- a chain ID or native-unit change is proposed;
- a public support promise would be based only on a point-in-time probe;
- the required source cannot be pinned or its provenance is unclear;
- the only way to proceed is to copy values into a second authority;
- a new external dependency is required for validation or generation.

## Common Failure Modes

- Treating the EVM chain ID and Cosmos chain ID as interchangeable.
- Treating an official provider listing as proof of current health.
- Treating a failed probe as proof of permanent unavailability.
- Copying RPC URLs into examples or agent guidance.
- Presenting testnet deployment continuity as a guarantee.
- Calling Mezo “fully EVM compatible” without scoping the exact capability a
  workflow depends on.
