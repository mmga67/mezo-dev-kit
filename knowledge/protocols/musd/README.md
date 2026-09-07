# MUSD protocol knowledge

This v0.4 module is the accepted canonical owner for the shared, version-scoped
MUSD system model, terminology, component roles, units, and parameter
ownership. Deployments and ABIs remain owned by Contracts. Borrowing and
redemptions are separate accepted nested modules because they own distinct
formulas, fixtures, operations, and evidence lifecycles. Institutional debt is
a third, proposed nested module so EnclaveDebtManager positions and pledged
veBTC never contaminate classic trove, ICR/TCR, or Recovery Mode semantics.
MUSD Savings is another proposed nested owner: it keeps 1:1 sMUSD principal
receipts and indexed yield separate from classic debt, TCR, Stability Pool, and
redemptions. The independent BTC/mUSDC market is not a MUSD child and resolves
through `protocols/lending/musdc`.
Provider-neutral feed identity and datum/freshness rules are owned by Prices;
MUSD retains ownership of its configured adapter, freshness, scaling, and
protocol-price semantics.

## Current status

The indexed shared knowledge is `supported` / `accepted` for the pinned MUSD
source generation and the declared Mezo deployments. Governed values and
deployment state are not frozen. Supporting the knowledge does not imply that
MDK currently ships a public MUSD package or transaction writer.

## Human use

Open [`generated/reference.md`](./generated/reference.md) for the deterministic
system inventory and component view. The maintained explanatory guide remains
[`docs/reference/musd-system.md`](../../../docs/reference/musd-system.md).
Neither is an independent fact owner.

## Machine use

Start at [`index.json`](./index.json), resolve a stable resource or record ID,
and load only the required catalog. Follow the source/evidence resources when a
protocol-sensitive decision needs proof. Use the nested module indexes for
borrowing, redemption, institutional Enclave debt, or Savings work.

## Maintenance

Records are under `records/`, pinned provenance under `sources/`, bounded reads
under `evidence/`, structural schemas under `schema/`, candidates and
superseded notes under `review/`, and generated output under `generated/`.

Run:

```bash
node scripts/validate-knowledge-structure.ts --module protocols/musd
node scripts/validate-musd-knowledge.ts
node scripts/generate-musd-reference.ts --check
```
