# Inspect institutional debt and allocate repayment

[inspect-position.ts](inspect-position.ts) shows two independent operations:

- `inspectInstitutionalPosition(registry, transport, positionId)` constructs the
  reader and requests one known position. It returns verified debt/collateral
  and explicit optional-health availability. The requested set is bounded and
  does not claim a complete inventory.
- `allocateRepayment({ principal, totalFees, payment })` demonstrates the pure
  fee-first calculation. For synthetic base-unit values `100n`, `10n`, `50n`,
  the result pays 10 fees and 40 principal, leaving 60 principal. A payment of
  9 is rejected with `payment-below-fees`.

Run the calculation through [foundations.ts](../foundations.ts). The read needs
an application transport and a real position ID; no signer or context object is
required. This package provides no partner repayment writer. The calculation
does not mutate the position or prove custody/backing.

[Package reference](../../packages/protocols/musd-institutional-debt/REFERENCE.md).
