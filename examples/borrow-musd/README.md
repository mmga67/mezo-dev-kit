# Borrow and repay MUSD

A trove is a BTC-backed borrowing position. Start with
[previewOpening](preview-position.ts): supply a read connection, account, BTC
collateral, requested MUSD and `BorrowingBounds`. It reads the current governed
minimum debt, fees, price and system mode, then checks the request without a wallet.
An old example amount such as 1,000 MUSD is not a promise of current eligibility.
Explain a failed check to the user; never silently increase their requested debt.

[openPosition](open-position.ts) adds a write connection and a persisted operation
ID. Collateral uses native BTC base units; requested debt and `maxFee` use MUSD
base units. Convert form text using verified asset precision, as explained in
[connections](../SETUP.md). Preparation checks fresh state again and finds bounded
sorted-list hints. Simulation and consent precede submission. The return value
is the reconciled position, including `boundsSatisfied`.

[borrowMusd](workflow.ts) is an advanced open → add collateral → repay → close
composition. Supply every amount and fee/risk bound explicitly. It requires an
initially nonexistent position and requests consent for each transaction. Debt
includes fees and can accrue interest, so closing may need more MUSD than was
originally received. The recipe checks current close funding; it supplies no funds.
Repayment and closure burn MUSD through BorrowerOperations without ERC-20 approval.

A forecast describes the read block, not guaranteed inclusion state. Some fee
and risk limits are preflight policy rather than contract arguments; reconcile
them afterward. Stop and inspect a settled out-of-bounds result. If a later step
fails, recover its saved submission instead of restarting the whole lifecycle.

See the [Borrowing reference](../../packages/protocols/musd-borrowing/REFERENCE.md)
for exact units, eligibility, other actions and private release scope.
