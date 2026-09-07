# MUSD Borrowing Record Contract

The machine-readable catalogs in this directory use schema version `1`.
`scripts/validate-borrowing-knowledge.ts` is the executable schema.

## Status and scope

Every catalog is `verified-versioned`, `proposed`, and
`pending-qualified-review`. This means its claims match the pinned source and
recorded deployment observations; it is not yet a public support promise.

Each record cites at least one authoritative artifact from `../sources.json`.
Non-canonical artifacts can never be the sole evidence for a promoted record.

Canonical records and derived documentation do not become independent evidence
by being maintained here. A current-deployment claim is grounded in its
block-pinned state/bytecode and version-matched verified source. Conflicting
descriptive documentation is recorded as a discrepancy and cannot override
the behavior executed by that deployment.

## Integers and units

All amount and fixed-point values are unsigned base-10 integer strings so they
round-trip without JavaScript number loss. Formula evaluation uses Solidity
`uint256` semantics and floor division. Inputs that would underflow, divide by
zero outside an explicitly defined zero-debt branch, or overflow `uint256` are
invalid rather than silently clamped.

The primary scales are:

- collateral, MUSD, and BTC/USD price: `1e18`;
- CR, ICR, TCR, and fee rate: `1e18`, where `1e18` is 100%;
- NICR: `1e20`;
- annual interest: integer basis points;
- time: integer seconds, with a protocol year of `31556952` seconds.

## Catalog boundaries

- `position.json` owns debt/collateral composition and lifecycle state.
- `formulas.json` owns deterministic integer formulas.
- `fixtures.json` owns executable boundary vectors.
- `parameters.json` owns versioned parameter definitions and observed values.
- `operations.json` owns borrower actions, preconditions, state effects, and
  events without duplicating ABI signatures.
- `liquidations.json` owns eligibility, offset, redistribution, compensation,
  and borrower outcomes.
- `candidates.md` owns prose/source dispositions and conflicts.

Redemption ordering and execution remain outside this schema and belong to
implementation review.
