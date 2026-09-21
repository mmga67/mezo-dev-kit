# Pools and liquidity

Understand basic and concentrated-liquidity pools, position ownership, fees, and pool math. Use this module to follow a liquidity position and its relationship to an incentives gauge.

## Start here

- [Pool reference](generated/reference.md): pool types, liquidity, deterministic math, and recorded topology.
- [Concentrated-liquidity mint calls](generated/reference.md#cl-mint-call-semantics): parameter behavior and position boundaries.
- [Pools SDK](../../../packages/protocols/pools/README.md): reads and liquidity workflows.
- [Swaps](../../workflows/swaps/README.md) and [Incentives](../incentives/README.md): route execution and gauge rewards.
- [Retained contract source](../../contracts/README.md#retained-cl-source): inspect a missing implementation detail.

## Scope and evidence

The pool knowledge is supported and reviewed within its recorded scope.
Operation support and private writer review remain separate. Pool, gauge, and
NFT instances are discovered through checked roots; dated observations do not
create static registry identities.

No current official Quoter identity is established. Savings, vault, and lending
deposits are not AMM liquidity. Prices classifies DEX-derived observations;
this module owns reserve, tick, spot, and TWAP mechanics.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
