# MUSD Borrowing And Liquidation Reference

Status: derived from supported, accepted canonical knowledge.

The machine-readable source is
`knowledge/protocols/musd/borrowing/`. Contract identities and ABIs remain in
`knowledge/contracts/`; this page intentionally contains no addresses or call
signatures.

## Position and debt model

A classic MUSD position is a borrower-address-keyed trove containing native BTC
collateral, principal, materialized interest, an assigned annual interest rate,
stake, lifecycle status, and a stored maximum borrowing capacity. A complete
risk read must also include unmaterialized simple interest and pending
redistributed collateral, principal, and interest.

Net debt excludes the fixed liquidation reserve. Composite debt adds that
reserve and is used when evaluating an opening position. Interest accrues with
integer, floor-rounded simple-interest math over a protocol year of 31,556,952
seconds. Repayment is applied to interest before principal.

Resolve `borrowing-position` for the exact composition and
`borrowing-formulas` with `borrowing-formula-fixtures` for executable integer
rules.

## Safety ratios and modes

The protocol-native health value is collateral ratio: collateral multiplied by
the protocol BTC/USD price, divided by entire debt. Individual collateral ratio
(ICR) applies to one position; total collateral ratio (TCR) applies to the
ActivePool plus DefaultPool system boundary. Recovery Mode is active when TCR
is below the critical collateral ratio.

LTV is only a reciprocal display derivation. At a 110% collateral ratio the
floor-rounded reciprocal is about 90.91%; calling that “90%” is product
rounding, not a protocol threshold. Do not use rounded LTV text to construct a
write.

NICR is different again: it uses collateral and principal, excludes price and
interest, and exists to order SortedTroves. Hints are therefore list-placement
inputs, not proofs of position safety.

## Borrower operations

Normal Mode opens and adjustments must preserve the position ICR threshold and
system TCR threshold. Recovery Mode permits top-ups and repayments, forbids
collateral withdrawal, and admits new/increased debt only under stricter
position-improvement rules. Borrowing fees are waived in Recovery Mode.

Current source also has several easy-to-miss behaviors:

- adding collateral does not increase the stored maximum borrowing capacity;
- withdrawing collateral can only reduce that stored capacity;
- repayment cannot close a trove and must leave the current minimum net debt;
- with the observed token role, close is unavailable in Recovery Mode and must
  preserve system TCR;
- refinance resets the assigned interest rate and borrowing capacity and uses
  the deployed nested fee formula described below.

The full preconditions, state effects, emitted event names, and failure
boundaries are in the `borrowing-operations` resource. Mutable values and
borrower-specific fee exemption must be read at the intended block; the values
in `borrowing-parameters` are evidence snapshots, not constants for an SDK.

## Liquidation

In the pinned implementation, liquidation eligibility is simply current ICR
strictly below MCR. Equality is safe. Recovery Mode does not substitute CCR as
the liquidation threshold and does not select a different liquidation
algorithm.

The liquidator receives the fixed MUSD reserve plus the floor-rounded
collateral compensation. Remaining debt is offset against available
StabilityPool deposits, interest before principal, and a proportional amount
of collateral goes to the pool. Partial coverage is valid; any remainder is
redistributed to active troves through error-corrected per-stake accumulators.

The liquidated position is closed with no collateral surplus, while MUSD
already held in the borrower's wallet is unchanged. See the
`borrowing-liquidations` resource for batch behavior and the exact rejected
inherited assumptions.

## Evidence resolution: refinance fee

The canonical behavior for the recorded deployments comes from the pinned
contract and fixed-block parameter reads: first take the governed percentage of
net debt as the fee base, then apply the borrowing rate to that base. With the
recorded 20% fee-base percentage and 0.1% borrowing rate, the effective
refinance fee is 0.02% of net debt before floor rounding.

The official fee page's 0.1% refinance statement is stale for these deployment
blocks. It is retained as discrepancy evidence, not averaged with or placed
above the deployed fact. This reference and the canonical knowledge records are
also interpretations, not proof by themselves; the cited deployed state and
version-matched source remain the factual basis.

The knowledge in this reference is supported and accepted. The embedded
operation capability values remain proposed because MDK does not yet ship a
public borrowing transaction writer; knowledge acceptance and writer release
are separate gates.
