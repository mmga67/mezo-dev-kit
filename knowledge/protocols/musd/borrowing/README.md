# MUSD borrowing and collateral

Understand classic MUSD positions, collateral requirements, borrowing interest, refinancing, and liquidation rules. This module includes the formulas and observations behind those rules.

## Start here

- [Borrowing explanation](../../../../docs/reference/musd-borrowing.md): positions, debt, and collateral behavior.
- [Borrowing reference](generated/reference.md): the recorded model, formulas, and parameters.
- [Borrowing SDK](../../../../packages/protocols/musd-borrowing/README.md): reads, calculations, hints, and direct borrower workflows.
- [Institutional debt](../institutional-debt/README.md): the separate Enclave position model.

## Scope and evidence

The knowledge is supported and reviewed within its declared scope. Borrower and
governed values need an explicit block; knowledge acceptance and operation support
are separate. Package docs record the accepted private borrowing implementation
and its release limits.

Institutional positions are not troves and do not enter classic ICR/TCR,
Recovery Mode, Stability Pool, or liquidation accounting. The recorded refinance
discrepancy is intentional: version-matched source and fixed-block evidence take
precedence over conflicting descriptive prose.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
