# MUSD borrowing and collateral

Classic MUSD borrowing records collateral and debt in a position called a trove.
Collateral requirements and liquidation rules determine how that position is
treated as its debt, interest, and collateral value change. Refinancing changes
the borrowing terms under the rules of the deployed contract version.

Use this directory to understand a position, follow its debt calculation, and
find the evidence behind those rules. Institutional debt uses a separate
position model.

## Understand a borrowing position

- [Borrowing explanation](../../../../docs/reference/musd-borrowing.md): positions, debt, and collateral behavior.
- [Borrowing reference](generated/reference.md): the recorded model, formulas, and parameters.
- [Borrowing SDK](../../../../packages/protocols/musd-borrowing/README.md): reads, calculations, hints, and direct borrower workflows.
- [Institutional debt](../institutional-debt/README.md): the separate Enclave position model.

## Applying the rules

Read a borrower's state and the applicable parameters at an explicit block.
The SDK documentation above identifies the private workflows available and
their release limits; a recorded position is not a current borrowing quote.

Institutional positions do not enter classic individual or system collateral
ratios, Recovery Mode, Stability Pool, or liquidation accounting. The borrowing
reference preserves a disagreement about refinancing: contract source and
observations for the specified version take precedence over descriptive prose.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
