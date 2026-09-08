---
name: mdk-musd-borrowing
description: Resolve MUSD collateral, borrowing, interest, refinance, positions and liquidation rules. Reads and calculations; writers separately gated.
---

# MUSD borrowing knowledge

## Purpose

Use verified, version-scoped MUSD borrowing and liquidation rules without
copying application assumptions, stale parameter values, or inherited
Liquity behavior into MDK code.

## Use When

- Reading or explaining a classic MUSD trove.
- Computing collateral/debt ratios, interest, fees, capacity, repayment, or
  liquidation splits.
- Designing future pure borrowing types/calculations or block-pinned readers.
- Reviewing open, adjust, repay, close, claim, liquidation, or refinance flows.

## Do Not Use When

- Resolving addresses or ABI fragments; use canonical contract knowledge.
- Implementing redemption selection or execution; use the MUSD redemptions
  skill and module.
- Treating rounded LTV, UI risk classes, product planners, or wallet strategy as
  protocol truth.
- Treating the published 0.1% refinance prose as deployed behavior instead of
  evaluating the pinned nested formula and current parameters.
- Shipping a write path while its embedded capability remains proposed.

## Relevant Repository Areas

For the current private implementation, inspect
`packages/protocols/musd-borrowing/README.md`, `REFERENCE.md`, and its public
exports. The package implements direct borrower preparation/execution using
Core. Distinguish implemented APIs from proposed canonical operation support
and qualified release acceptance. Use the source-backed event caveat in the
position model when reconciling debt increases; do not infer interest from an
event field alone.

- `knowledge/protocols/musd/borrowing/`
- `knowledge/protocols/musd/`
- `knowledge/contracts/`
- `knowledge/networks/`
- `docs/reference/musd-borrowing.md`
- `docs/manifest`

## Required Canonical Sources

1. Root and nearest applicable `AGENTS.md`.
2. Active task and accepted scope.
3. `knowledge/protocols/musd/borrowing/index.json` and only the catalogs needed.
4. Shared MUSD terminology in `knowledge/protocols/musd/`.
5. Registry-owned contract/network identities.
6. Pinned authoritative artifacts from resource
   `protocols/musd:musd-sources` whenever a sensitive rule changes.

## Procedure

1. Classify the request as state read, pure calculation, borrower operation,
   liquidation, or redemption.
2. Fail closed if the relevant catalog is not reviewed or the capability is
   listed in `blockedCapabilities`.
3. Resolve the selected network and stable `musd.*` contract IDs through the
   registries; never copy an address or ABI into protocol knowledge/code.
4. For deployed behavior, give block-pinned state and version-matched verified
   source precedence over descriptive documentation. Retain documentation
   conflicts as discrepancies; do not average them into the fact.
5. Read mutable and borrower-specific inputs at an explicit block. Record the
   block, block timestamp, price provenance, fee-exempt status, and read set.
6. Normalize the position using `borrowing-position`: distinguish stored,
   pending, newly accrued, net, composite, principal, interest, and entire
   values.
7. Apply only formulas from `borrowing-formulas` with unsigned integer floor
   semantics. Reject overflow, underflow, invalid denominator, stale state, and
   rounded-display input.
8. Apply the current mode-specific preconditions in `borrowing-operations` or
   `borrowing-liquidations`. Treat hints as list-placement inputs, not
   validation.
9. Keep pure calculations independent from RPC, wallet, transaction, UI, and
   cache state. Transaction lifecycle belongs to the shared core boundary.
10. On changes, update candidate disposition, pinned evidence, canonical record,
    fixture, derived reference, and validator together.
11. Run the borrowing validator plus its MUSD, contract, and network
    dependencies. Require qualified review for changed facts or capabilities.

## Verification

- `node scripts/validate-borrowing-knowledge.ts`
- `node scripts/validate-musd-knowledge.ts`
- `node scripts/validate-contract-knowledge.ts`
- `node scripts/validate-network-knowledge.ts`

For evidence review, additionally pass the pinned documentation and MUSD source
checkouts to the MUSD validator.

Verify exact threshold equality and one-unit boundaries, zero debt, interest
elapsed time, minimum debt with fee rounding, partial/full StabilityPool offset,
and pending-reward rounding. Re-read governed values before write-path review.

## Stop Conditions

Stop for qualified direction when:

- a requested capability is blocked in the borrowing index;
- deployment identity, bytecode/source matching, or block-pinned state is
  uncertain or internally conflicting for a protocol-sensitive rule;
- required block/timestamp/price/fee-exemption provenance is missing;
- a source migration branch would be generalized to ordinary deployments;
- the change requires a public API, new dependency, or unsupported workflow.

## Common Failure Modes

- Using stored debt while omitting accrued interest or pending redistribution.
- Treating NICR or rounded reciprocal LTV as ICR.
- Treating observed governed values as timeless constants.
- Assuming Recovery Mode uses inherited special liquidation rules.
- Assuming any StabilityPool balance guarantees a full offset.
- Increasing borrowing capacity merely because collateral or price increased.
- Computing minimum requested debt without the mode/exemption-dependent fee.
- Paying principal before interest.
- Copying the stale 0.1% refinance prose instead of evaluating the deployed
  nested fee formula.
