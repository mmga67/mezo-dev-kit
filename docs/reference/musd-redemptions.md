# MUSD Redemptions Reference

Status: derived from supported, accepted canonical knowledge.

A redemption burns actual filled MUSD debt in exchange for price-equivalent BTC
collateral, less the governed collateral fee. The machine-readable owner is
`knowledge/protocols/musd/redemptions/`; addresses and ABIs stay in the contract
registry.

## Eligibility and ordering

The call requires TCR at or above MCR, a nonzero attempted amount, and enough
redeemer MUSD for the full attempted amount. Equality with MCR is eligible.

The precise deployed ordering is the SortedTroves tail followed by `getPrev`,
not an independent sort of current ICR. Positions below MCR are skipped using
current ICR. Because the list uses NICR and excludes interest, current ICR order
can diverge after accrual.

Zero maximum iterations means uncapped. A nonzero cap counts visited entries,
including skipped ones.

## Full, partial, and actual fill

Each position supplies at most its entire debt minus gas compensation.
Collateral drawn is `floor(MUSD lot × 1e18 / price)`, and debt reduction pays
interest before principal.

A full fill burns the GasPool reserve, closes the trove as redeemed, and places
remaining collateral in CollSurplusPool for the borrower. A partial fill keeps
the trove active, enforces minimum net debt, updates stake, and reinserts it by
NICR.

If the final partial has stale NICR evidence or would violate minimum debt, that
partial is cancelled. Earlier complete fills still settle. Only actual filled
MUSD is burned; the `Redemption` event distinguishes attempted and actual
amounts.

## Hints and transaction safety

An invalid first hint safely falls back to tail traversal. Partial hints are
different: HintHelpers should be called against fresh state and its truncated
amount should normally drive the request. A state change can cancel the final
partial.

The deployed entrypoint has no minimum-BTC-received or minimum-actual-fill
argument. A future writer therefore needs a fresh block-pinned quote, exact-call
simulation, explicit user fill/slippage policy, receipt-event parsing, and
post-state reconciliation. A transaction hash alone is not success evidence.

## Fee documentation discrepancy

Both recorded deployments report a 0.75% redemption rate. The deployed path
applies it to gross actual collateral drawn for every redeemer and sends the fee
collateral to PCV. It performs no borrower-status or fee-exemption check.

The official statement that borrowers receive a fee waiver is stale for these
deployment blocks. Deployed state and version-matched source are canonical for
what executes; this page and the canonical records are evidence-backed
interpretations, not substitutes for that evidence.

The redemption knowledge is supported and accepted. A public redemption writer
remains outside this module and needs its own capability review because the
deployed entrypoint does not enforce a minimum received amount.
