# MUSD redemption knowledge

This v0.4 module owns the accepted, deployment-scoped redemption model,
ordering, hints, formulas, parameters, fixtures, and fixed-block observations.
It resolves shared MUSD, borrowing formulas, contracts, networks, and sources
through stable logical references.

## Current status

The knowledge is `supported` / `accepted` within its declared scope. A public
redemption writer is not implemented or implied. The deployed entrypoint lacks
a minimum-received parameter, so any future writer must enforce quote
freshness, simulation, and user output policy outside the call.

## Human and machine use

Humans start with [`generated/reference.md`](./generated/reference.md) and the
maintained explanation in
[`docs/reference/musd-redemptions.md`](../../../../docs/reference/musd-redemptions.md).
Machines start at [`index.json`](./index.json) and resolve only the model,
formula, parameter, fixture, or evidence resource needed.

## Maintenance

Run:

```bash
node scripts/validate-knowledge-structure.ts --module protocols/musd/redemptions
node scripts/validate-redemption-knowledge.ts
node scripts/generate-musd-reference.ts --check
```
