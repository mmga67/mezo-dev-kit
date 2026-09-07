---
name: mdk-musd-knowledge
description: Resolve, explain, or maintain the supported MUSD system model, terminology, components, units, and parameter ownership through the v0.4 MUSD module. Use for shared MUSD protocol concepts; route borrowing and redemptions to their domain skills.
---

# MUSD knowledge

## Purpose

Use the canonical MUSD system model without treating product copy, governed
values, or familiar Liquity behavior as current protocol truth.

## Use When

- Explaining MUSD terminology or component responsibilities.
- Designing a future framework-independent MUSD protocol module.
- Reading classic trove/system state or choosing the correct aggregate.
- Determining whether a MUSD value is a constant, governed state, deployment
  binding, or derived calculation.
- Preparing borrowing or redemption work that depends on shared MUSD concepts.

## Do Not Use When

- Resolving an address, proxy, ABI, or implementation; use the contracts skill.
- Implementing borrowing/liquidation behavior without loading the borrowing
  domain skill and confirming its capability gates.
- Treating accepted redemption knowledge as an implemented public writer.
- Treating MUSD savings, AMMs, bridges, Enclave debt, analytics pricing, or UI
  read models as part of the classic trove engine without separate evidence.

## Relevant Repository Areas

- `knowledge/protocols/musd/`
- `knowledge/contracts/`
- `knowledge/networks/`
- `docs/reference/musd-system.md`
- `docs/manifest`

## Required Canonical Sources

1. Root and nearest applicable `AGENTS.md`.
2. The active task and its accepted scope.
3. `knowledge/protocols/musd/index.json`.
4. Only the selected terminology/component/model records.
5. Contract and network records referenced by stable IDs.
6. Pinned authoritative evidence from resource `musd-sources` when a claim is
   changed or protocol-sensitive behavior is implemented.

## Procedure

1. Classify the request as shared system knowledge, borrowing, redemption, or
   another MUSD-adjacent domain.
2. Normalize user terms through resource `musd-terminology`; preserve
   distinctions among active, pending, and entire state.
3. Select component roles from `musd-components` and resolve their `musd.*` IDs
   through the Contracts module for the intended network/block.
4. Read `musd-system-model` for the relevant atomic claim, unit, and parameter
   owner.
5. If a value is governed or deployment state, perform a block-pinned read;
   never reuse an initializer, product screenshot, or stale copied constant.
6. Keep deterministic calculations free of RPC, wallet, UI, cache, database,
   and global-state dependencies.
7. Route borrowing/liquidation detail to module `protocols/musd/borrowing` and
   its domain skill, and redemption detail to module
   `protocols/musd/redemptions`. Fail closed if a capability is blocked.
8. For a knowledge change, update the candidate disposition, exact pinned
   evidence, canonical record, derived docs, and validation together.
9. Run `node scripts/validate-musd-knowledge.ts` plus the network and contract
   validators.
10. Require qualified Level 3 review for a changed protocol fact, support
    boundary, or write-path dependency.

## Verification

- Every promoted claim has authoritative evidence.
- Contract IDs exist in the canonical registry on both declared networks.
- Units and block/timestamp context are explicit.
- No address or ABI is duplicated under MUSD protocol knowledge.
- Mutable parameters are read from the selected deployment at an explicit
  block when their value matters.
- Derived docs add no independent protocol fact.

## Stop Conditions

Stop for qualified direction when:

- official docs and version-matched deployed source disagree materially;
- the active implementation or network identity is unresolved or stale;
- a workflow depends on an unreviewed implementation review/implementation review rule;
- an external debt domain must be combined with classic TCR;
- a public package/API decision is required without accepted architecture;
- a new dependency or unverified executable artifact would be required.

## Common Failure Modes

- Equating a broad “backed” product statement with a contract accounting
  equality.
- Treating raw native-currency balances as pool tracked collateral.
- Omitting pending redistributed debt/collateral from an “entire” trove view.
- Using the global offered rate as if it retroactively changed existing troves.
- Calling NICR the borrower-facing risk ratio.
- Copying addresses or ABI fragments into protocol code/docs.
- Treating a market/indexer oracle fallback as the MUSD protocol price.
- Importing inherited Liquity behavior without checking Mezo source.
