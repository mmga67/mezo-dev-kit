# Savings source conflict review

Source review dated 2026-10-08; its bounded dispositions were accepted on
2026-10-09. Acceptance preserves the conflict and candidate capture below;
it does not renew accepted evidence or qualify a writer.

## Receipt value and separately accounted yield

The [official Savings page](https://mezo.org/docs/users/mezo-earn/vaults/musd-savings-vault/)
describes yield increasing the MUSD redeemable per sMUSD and transferring with
the receipt. The pinned [documentation snapshot](../artifacts/official-docs-2026-10-08.json)
retains the exact source at documentation commit
`ddbca2cd013092a4c637be69356695945e20bf8b` and its content digest.

The accepted [accounting model](../records/model.json) instead defines equal
principal units and separately indexed MUSD yield. The
[representative withdrawal](../evidence/withdrawal-reconciliation-2026-08-24.json)
at block 11325682 reconciles separate yield payment, receipt burn and principal
payment. The [source reproduction](../evidence/source-reproduction-2026-08-23.json)
establishes the executable generation used by that model.

**Disposition:** the public description conflicts with the accepted deployed
accounting at its recorded coordinates. Preserve principal and yield as
separate quantities in historical explanations and calculations. Do not apply
an ERC-4626 exchange-rate model to that generation or attribute accrued yield
to a transferred receipt without checking the generation's update rules.

The [new generation observation](../artifacts/generation-check-2026-10-08.json)
remains **candidate evidence** under the accepted disposition. At mainnet block 12379131 it
compares the proxy's implementation slot and both complete runtime hashes with
the retained deployment and finds a match, then rechecks the block anchor.
It adds no new historical interval, balance, role, audit or transaction proof.
The existing evidence deadlines and support states remain unchanged.

An implementation upgrade does not explain the discrepancy at those two
observed coordinates. Calling the public page a confirmed current error, or
extending current operation qualification, requires review of the new capture
and the bounded conclusion. No upstream clarification has been received.

## Affected consumers

- The accepted accounting record and deterministic calculation retain their
  recorded generation; no formula change is justified by the page wording.
- The human economic map must identify the deployed-accounting scope when it
  describes principal receipts and separate yield.
- Savings and system skills must retrieve this conflict when comparing product
  prose with executable behavior, and retain the current-read qualification.
- Published fee routing is a separate claim. This capture does not verify PCV
  allocations, the bootstrap loan, current fee splits or gauge settlement.

Resolution owner: `protocols/musd/savings`. Review the candidate before promoting
a new current-generation claim; obtain source clarification or new scoped
deployment evidence if the discrepancy remains material to an operation.
