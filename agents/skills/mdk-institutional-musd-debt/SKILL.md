---
name: mdk-institutional-musd-debt
description: Resolve institutional MUSD Enclave custody, positions, pledges, repayment, health and fees. Evidence and calculations; no writers.
---

# Institutional MUSD debt knowledge

## Use when

Use this skill for Enclave roles and custody, exact target-selector allowlists,
executor/batch behavior, triparty UTXOs, debt-manager positions, pledged veBTC,
institutional interest/originator fees, repayment, health thresholds, totals,
or maintenance of `knowledge/protocols/musd/institutional-debt`.

Do not use it for classic trove/TCR behavior, Savings, bridges as routes, pool
liquidity, strategy allocation, product backing ratios, portfolio analytics,
liquidation claims, or transaction writers.

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. For maintenance, read
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` and
   `docs/standards/knowledge-management.md`.
3. Read `knowledge/protocols/musd/institutional-debt/README.md` and resolve the
   module through `index.json`.
4. Load only the architecture, vault, accounting, formula, operation,
   aggregate, fixture, source, evidence, or review resources needed.
5. Load `mdk-musd-knowledge` for shared MUSD terms, `mdk-musd-borrowing` only
   for a classic comparison, `mdk-incentives-knowledge` for veBTC lock
   semantics, and `mdk-transaction-execution` for future lifecycle gates.
6. For authored scripts or runtime code, also load
   `agents/skills/mdk-typescript-development/SKILL.md`.

## Procedure

1. Resolve Mezo Mainnet and the provider capability through Networks.
2. Resolve the exact Enclave/debt-manager Contract identity, proxy activation
   range, implementation generation, and full ABI through Contracts.
3. Select the original or second Enclave generation before interpreting roles,
   bridge authority, generic target exclusions, or selectors. Never merge the
   two live ABI/role models.
4. For execution authority, read the current role membership and exact
   `(target, selector)` pair at one block. ABI presence and historical
   TargetAdded events do not establish current authorization.
5. Keep Enclave assets, veBTC custody, pledged veBTC, position collateral,
   principal, interest, originator fees, minted principal, fee minting, burned
   principal, and fee settlement distinct.
6. Use `institutional-debt-formula-fixtures` with BigInt-compatible integer
   arithmetic. Preserve each written floor and the zero-debt max-uint sentinel.
7. Reconcile any claimed position mutation with the debt-manager call/event
   and post-state. Asset movement or a successful Enclave receipt is
   insufficient.
8. Keep classic troves, ICR/TCR, ActivePool/DefaultPool, Recovery Mode,
   Stability Pool, redemption, and liquidation outside institutional totals.
9. Treat operation records as future gates only. Current writer support is
   `none`; exact fresh simulation and transaction reconciliation remain
   mandatory for any separately approved implementation.
10. On maintenance, update evidence digests, source catalog, canonical record,
    fixtures, generated reference, review files, and validator together.

## Verification

Run all checks declared in the institutional-debt module index, then MUSD,
borrowing, incentives, Contracts, Networks, transactions, troubleshooting,
root structure/catalog, JSON, link, and whitespace checks appropriate to the
change. Test fee rounding, zero debt, repayment below fees, repayment above
principal, exact threshold equality, rate cap boundaries, closed positions,
role denial, unapproved selectors, generation differences, and aggregate
separation.

## Invariants and common failure modes

- institutional debt evidence review accepted the module review and three Contract registry identities;
  protocol support remains proposed and all writers remain unsupported.
- Roles, allowlists, UTXOs, parameters, positions, and totals are block-scoped.
- ABI presence is not executable authorization.
- The second Enclave's AssetsBridge/veBTC generic-target exclusion and separate
  BRIDGE_MANAGER_ROLE must not be projected onto the original generation.
- A closed-by-liquidation enum member is not an implemented liquidation path.
- Executable reproduction proves byte correspondence, not authorship, audit
  coverage, current writer safety, or support.

## Stop conditions

Stop when a deployment generation or ABI is missing/conflicting, the proxy
range cannot be resolved, role/target/position evidence is stale for the risk,
fee rounding or aggregate ownership is ambiguous, an Enclave asset movement
would be treated as debt state without reconciliation, a cross-system metric
would be invented, a writer would be implied, a new dependency is required,
or architecture/support scope would materially change.
