# MUSD Savings candidates

| Candidate | Disposition | Gate |
| --- | --- | --- |
| Savings proxy / current `MUSDSavingsRate` implementation | Accepted stable Contract root | Use the current ABI only for the latest verified generation; resolve earlier generations by coordinate without ABI inheritance. |
| Idle strategy | Root-discovered role | Resolve through `strategy()`; do not create a timeless static identity. |
| PCV BTC recipient / YieldConverter | Governed role | Resolve through accepted PCV, then verify proxy and reverse link. |
| VaultGauge | PoolsVoter-discovered role | Resolve through the accepted voter; creation input is absent from explorer evidence. |

Qualified Level 3 review accepted the root-discovered dynamic-role and missing
published audit-mapping limitations for this bounded knowledge scope. Those
limitations still prevent any implied reader, writer, or historical-ABI claim.
