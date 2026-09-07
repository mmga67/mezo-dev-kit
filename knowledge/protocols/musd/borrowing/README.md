# MUSD borrowing knowledge

This v0.4 module owns the accepted, version-scoped MUSD position model,
borrowing and liquidation rules, integer formulas, governed-parameter
observations, and deterministic fixtures. Contract identities and ABIs remain
owned by Contracts; shared terminology and sources resolve through the parent
MUSD module.

Institutional EnclaveDebtManager positions are not troves. Their principal,
fees, pledged veBTC, and health model resolve through the separate proposed
`protocols/musd/institutional-debt` module and do not enter classic ICR/TCR,
Recovery Mode, Stability Pool, liquidation, or redemption formulas here.

## Current status

The knowledge is `supported` / `accepted` for its declared source and deployment
scope. Mutable and borrower-specific values must still be read at an explicit
block. Embedded operation capability fields remain separate: accepted knowledge
does not mean MDK ships a public transaction writer.

## Human and machine use

Humans start with [`generated/reference.md`](./generated/reference.md) and the
maintained explanation in
[`docs/reference/musd-borrowing.md`](../../../../docs/reference/musd-borrowing.md).
Machines start at [`index.json`](./index.json) and resolve stable record,
fixture, evidence, and source references.

The recorded refinance discrepancy is intentional: version-matched source and
fixed-block deployment evidence outrank stale descriptive prose. Consult the
indexed discrepancy and evidence rather than maintaining another numeric copy
here.

## Maintenance

Run:

```bash
node scripts/validate-knowledge-structure.ts --module protocols/musd/borrowing
node scripts/validate-borrowing-knowledge.ts
node scripts/generate-musd-reference.ts --check
```
