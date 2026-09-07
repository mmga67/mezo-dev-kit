# Mezo pools and liquidity knowledge

This module owns deployment-scoped knowledge for Mezo basic AMM and
concentrated-liquidity pool semantics, deterministic math, root-based dynamic
discovery, position identity, and the boundary with incentives gauges.
Prices classifies pool-derived outputs as `dex-derived-observation` while this
module remains the sole owner of reserve, tick, spot, and TWAP mechanics.

Start with `generated/reference.md`, then resolve the needed resource through
`index.json`. Dynamic pool, gauge, and NFT instances are observations reached
through reviewed roots; they are not stable registry identities merely because
they appear in dated evidence.

## Current boundary

- Knowledge support received qualified Level 3 acceptance under pool evidence review.
- No swap, liquidity, staking, approval, or claim writer is supported.
- The accepted basic Router and PoolFactory remain accepted Contract records.
- Seven CL roots and their full ABIs are accepted Contract records.
- No current official Quoter identity was established; consumers must not
  infer one from an upstream Slipstream deployment.
- Savings, vault, and lending deposits are not normalized as AMM liquidity.

Maintainers follow the knowledge-management standard plus the pools,
Contracts, Networks, incentives, transaction, troubleshooting, and TypeScript
skills applicable to the change.
