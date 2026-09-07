# MUSD Redemption Record Contract

Schema version `1` is enforced by
`scripts/validate-redemption-knowledge.ts`. Amounts and fixed-point values are
unsigned decimal strings and use Solidity floor division.

- `model.json` owns eligibility, queue traversal, full/partial outcomes, hints,
  failures, events, and reconciliation.
- `formulas.json` owns redemption-specific pure math and references shared
  borrowing formulas rather than copying them.
- `fixtures.json` owns executable boundary vectors.
- `parameters.json` owns the governed redemption rate observation.
- `candidates.md` owns documentation and source discrepancies.

Canonical records are evidence-backed retrieval surfaces, not independent
proof. Deployed claims must remain traceable to fixed-block state and
version-matched source.
