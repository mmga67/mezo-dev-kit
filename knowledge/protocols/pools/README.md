# Pools and liquidity

Trading pools hold assets that users exchange and charge fees on swaps. Liquidity
providers hold positions in those pools. Basic pools and concentrated-liquidity
pools represent positions differently, so their balances, liquidity calculations,
and fee accounting must be interpreted using the matching model.

This directory explains those models and what changes when a position is staked
in an incentives gauge. Position ownership, custody, and the user's entitlement
to fees or rewards are separate questions.

## Follow a liquidity position

First identify the pool type. A basic pool issues interchangeable liquidity
provider (LP) tokens that represent shares in the pool. A concentrated-liquidity
(CL) position uses a non-fungible token (NFT) to identify a particular price
range and liquidity amount. The [pool reference](generated/reference.md)
explains their different balances and calculations.

For a concentrated-liquidity position, distinguish the position's liquidity
from the liquidity currently active at the pool's price. Staking adds another
distinction: the gauge may hold the NFT while the depositor retains the
entitlement tracked by the gauge. The contract holding the NFT is therefore
not always the person entitled to its rewards.

Follow principal, trading fees and incentive rewards separately when adding,
reducing or collecting from a position. The
[Pools SDK](../../../packages/protocols/pools/README.md) provides reads,
calculations and liquidity workflows. [Incentives](../incentives/README.md)
owns gauge staking and reward claims; [Swaps](../../workflows/swaps/README.md)
owns route quotes and execution.

For a specific call question, the
[mint-call reference](generated/reference.md#cl-mint-call-semantics) explains
the parameters and existing-pool limits. If a detail still needs source
inspection, follow the [saved contract source](../../contracts/README.md#retained-cl-source).

## Identify the pool before using its state

Discover pools, gauges, and position NFTs through the relevant factory and
contract relationships. A recorded instance shows what was observed at a
particular block; it does not create a permanent list of valid positions.
The SDK documentation above identifies its implemented workflows and the
additional review required before release.

No current official Quoter, a dedicated contract for requesting trade quotes,
has been established in this module.
Savings, vault, and lending deposits use different accounting from trading-pool
liquidity. The pool reference owns reserve, tick, spot-price and time-weighted
price calculations; the Prices module explains how to interpret those values
as price observations.

## Quick links

| Link                                                                  | What you will find                                                   |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Pool reference](generated/reference.md)                              | Pool types, ownership, formulas and observed contract relationships. |
| [CL mint calls](generated/reference.md#cl-mint-call-semantics)        | How mint inputs affect pool creation and position behavior.          |
| [Pools SDK](../../../packages/protocols/pools/README.md)              | Basic and concentrated-liquidity reads and position workflows.       |
| [Incentives](../incentives/README.md)                                 | Gauge custody, staking and reward claims.                            |
| [Swaps](../../workflows/swaps/README.md)                              | Routes, quotes and exchange execution.                               |
| [Saved contract source](../../contracts/README.md#retained-cl-source) | Inspect the code behind recorded concentrated-liquidity contracts.   |
| [Module index](index.json)                                            | Exact math, position, operation, source and evidence records.        |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
