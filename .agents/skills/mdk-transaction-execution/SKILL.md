---
name: mdk-transaction-execution
description: Design, review, diagnose, or maintain safe MDK EVM reads, simulations, approvals, submissions, tracking, confirmation, and protocol reconciliation using the accepted core-client and lifecycle boundaries plus the v0.4 transaction knowledge module. Public packages and writers still require implementation and release review.
---

# Transaction execution

## Purpose

Design, implement, or review safe MDK reads and writes using explicit clients,
block-coherent evidence, exact-call simulation, typed lifecycle states, and
protocol reconciliation.

## Use When

- Adding or reviewing an RPC read, quote, approval, or contract writer.
- Investigating chain mismatch, provider, simulation, receipt, replacement,
  reorg, timeout, or reconciliation failures.
- Defining a protocol module's execution requirements.
- Extending Core or implementing an adapter over its current public boundary.
- Reviewing bounded event scans, checkpoints, backfills, or materialized
  reconciliation projections; pair with `mdk-indexing-reconciliation`.

## Do Not Use When

- The task only changes a pure deterministic formula.
- A protocol or deployment fact is missing; use the owning knowledge/contract
  skill and stop rather than filling the gap with transaction architecture.
- The request is to submit a live value-bearing transaction without explicit
  authority and an approved test/operational plan.

## Relevant repository areas

- `knowledge/workflows/transactions/`
- `knowledge/networks/`
- `knowledge/contracts/`
- the relevant `knowledge/protocols/` domain
- `docs/decisions/0002-core-client-model.md`
- `docs/decisions/0003-transaction-lifecycle.md`

## Required canonical sources

1. Root and nearest nested `AGENTS.md`, plus the active task.
2. Module `workflows/transactions` and only the relevant indexed resource:
   `transaction-mezo-observations` for evidence, or one of the candidate
   state-machine, client-requirement, error, and matrix resources for design.
3. Network ID/capability and endpoint evidence from `knowledge/networks/`.
4. Deployment/ABI/source evidence from `knowledge/contracts/`.
5. The protocol domain's canonical model and operation requirements.
6. Accepted ADR-0002/0003 and package docs when relevant. The decisions accept
   responsibilities and semantics, not a dependency, public API, or writer.

## Procedure

Use the root-routed capability assessment once to inspect current package
exports and required integrations. A missing public writer does not invalidate
usable Chains, Contracts, or read APIs. Establish the actual signer and history
source when the task needs them; never assume node-managed unlocked accounts.
Apply the following steps only to the operation classes they concern.

1. Classify the operation as pure, read-only, simulation, approval, action, or
   cross-chain reconciliation.
2. Resolve the supported network and assert transport/signer chain identity.
3. Resolve the deployment and ABI by stable ID and validity coordinate.
4. Establish one read block; mark every batch item required or optional.
5. Convert external amounts to validated integer base units.
6. Build a quote with block/deployment coordinates, assumptions, freshness, and
   user bounds.
7. Construct and simulate the exact intended call with sender, value, and
   calldata; preserve decoded revert evidence.
8. If approval is required, resolve the spender/amount, track it separately,
   then reread and resimulate the action.
9. Submit once. On uncertainty, track or rebroadcast identical signed bytes;
   never blindly rebuild and resubmit.
10. Distinguish inclusion, confirmation, and protocol reconciliation. Apply the
    domain's events/post-state and partial-outcome rules.
11. Return structured errors and safe debug context. Do not store secrets or raw
    unbounded logs in knowledge.

## Verification

Run:

```sh
node scripts/validate-transaction-knowledge.ts
```

For implementation work, add model/targeted tests for every reachable state and
the domain's failure boundaries. Use local or approved test environments; do
not make mainnet writes as a verification shortcut.

## Stop conditions

Stop when:

- deployment identity, verified source, ABI, or intended entrypoint is missing;
- chain or provider evidence is stale for the required capability;
- the domain cannot define a successful or allowed partial outcome;
- simulation would differ materially from the submitted call;
- retry would require guessing whether a write was accepted;
- an external dependency, public architecture change, or live value-bearing
  action lacks approval.

## Common failure modes

- Treating a hash or successful receipt as protocol success.
- Mixing reads from different blocks in one quote.
- Replacing optional call failures with zeros.
- Approving the wrong spender or unlimited amount implicitly.
- Assuming provider batching, archive data, or subscriptions from chain ID.
- Reusing approval state without revalidating the action.
- Calling a bridge transfer complete on source-chain confirmation alone.
