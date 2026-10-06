# Inspect an institutional MUSD position

[inspect-position.ts](inspect-position.ts) contains a coherent read recipe and
a separate repayment calculation. Supply the reader's typed registry/transport
inputs and requested position identity to `inspectInstitutionalPosition`.
Preserve availability, coordinate and custody information; this is a read, so
it requires no wallet.

`allocateRepayment` takes principal, total fees and payment in MUSD base units.
It calculates allocation without submitting a repayment or assuming permission
to use partner custody. Read the returned allocation rather than subtracting the
whole payment from principal. Institutional positions and their fee accounting
are distinct from classic MUSD troves.

See the [Institutional Debt reference](../../packages/protocols/musd-institutional-debt/REFERENCE.md)
for current fields, calculations and read-only scope.
