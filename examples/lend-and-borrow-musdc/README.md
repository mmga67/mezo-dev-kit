# Supply or borrow mUSDC

mUSDC is the loan asset in the verified BTC/mUSDC market; it is distinct from
MUSD. Start with [supplyMusdc](supply.ts) or [borrowMusdc](borrow.ts). Supply a
[write connection](../SETUP.md), operation ID, mUSDC base units and
`LendingBounds`. Borrowing requires sufficient existing market collateral.
The functions retain separate approval, fresh preparation, simulation, consent
and reconciliation steps.

[lendAndBorrowMusdc](workflow.ts) shows two advanced paths for an empty position.
The supplier deposits assets and later withdraws the actual resulting supply
shares. The borrower supplies collateral, borrows, repays all borrow shares,
then withdraws collateral. Supply shares, borrow shares and collateral amounts
are different quantities; never add or substitute them.

The application supplies `loanAmount` in mUSDC base units and `collateralAmount`
in the market collateral token's base units. The reader verifies market/token
identity. Repaying all borrow shares accounts for accrued interest and upward
asset rounding, so the wallet needs sufficient extra mUSDC. Nothing funds it.

Bounds in the advanced composition are illustrative application policy. Adapt
asset/share caps, price age and borrow headroom to your product. Availability
and reconciled health must be inspected before continuing. An uncertain
submission requires observation, not a retry of the lifecycle.

See the [Lending reference](../../packages/protocols/musdc-lending/REFERENCE.md)
for exact rounding, health, current methods and private release scope.
