# USDC Lending Vault candidates

| Candidate | Disposition | Gate |
| --- | --- | --- |
| VaultV2 | Accepted runtime-verified current role; not a Contract root | Qualified review accepted the official-doc, fixed-block topology, complete role-event reconstruction, and exact runtime evidence as a bounded protocol role. Explorer creation input is absent, so no Contract provenance class is fabricated. |
| MorphoMarketV1AdapterV2 | Accepted bounded Contract root | Exact creation/runtime reproduction, full ABI, and one-market reverse-link review passed qualified review. |
| ERC4626VaultAdapter proxy | Accepted current Contract root | Full proxy history, current ABI, executable reproduction, and reverse links passed qualified review. |
| VaultGauge | Accepted runtime-verified PoolsVoter/current-doc role; not a Contract root | Qualified review accepted resolution through the accepted voter/current wrapper and exact runtime evidence. Explorer creation input is absent, so no Contract provenance class is fabricated. |

Qualified review accepted this bounded role disposition on 2026-08-25. A
future Contract promotion still requires a provenance class and evidence that
actually satisfy ADR-0005; protocol-role evidence does not silently weaken the
Contract registry boundary.
