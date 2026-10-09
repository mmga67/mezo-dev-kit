# Pools and liquidity

Trading pools hold assets that users exchange and charge fees on swaps. Liquidity
providers hold positions in those pools. Basic pools and concentrated-liquidity
pools represent positions differently, so their balances, liquidity calculations,
and fee accounting must be interpreted using the matching model.

This directory explains those models and what changes when a position is staked
in an incentives gauge. Position ownership, custody, and the user's entitlement
to fees or rewards are separate questions.

## Follow a liquidity position

- [Pool reference](generated/reference.md): pool types, liquidity, deterministic math, and recorded topology.
- [Concentrated-liquidity mint calls](generated/reference.md#cl-mint-call-semantics): parameter behavior and position boundaries.
- [Pools SDK](../../../packages/protocols/pools/README.md): reads and liquidity workflows.
- [Swaps](../../workflows/swaps/README.md) and [Incentives](../incentives/README.md): route execution and gauge rewards.
- [Retained contract source](../../contracts/README.md#retained-cl-source): inspect a missing implementation detail.

## Identify the pool before using its state

Discover pools, gauges, and position NFTs through the relevant factory and
contract relationships. A recorded instance shows what was observed at a
particular block; it does not create a permanent list of valid positions.
The SDK documentation above identifies its implemented workflows and the
additional review required before release.

No current official Quoter contract has been established in this module.
Savings, vault, and lending deposits use different accounting from trading-pool
liquidity. The pool reference owns reserve, tick, spot-price and time-weighted
price calculations; the Prices module explains how to interpret those values
as price observations.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
