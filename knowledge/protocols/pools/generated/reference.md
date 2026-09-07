# Mezo pools and liquidity reference

> Generated from canonical `protocols/pools` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`
- Support: `supported`
- Review: `accepted`
- Evidence block: Mezo Mainnet `11333787` (`0xac14bc00fe3e1ecc7d01e134439593572339773681146ce25dac88889e1648f1`)
- Writers: none
- Quoter: no current official deployment identity established

## Architectures

### basic

- Pool key: `sortedToken0` + `sortedToken1` + `stable` + `factory`
- Position: fungible ERC-20 LP balance and total supply
- Discovery: Sort nonidentical token addresses, preserve the stable flag, resolve getPool(token0, token1, stable), and require factory.isPool(result) at the same block. allPools/PoolCreated may enumerate candidates but do not replace the mapping check.

### concentrated-liquidity

- Pool key: `sortedToken0` + `sortedToken1` + `tickSpacing` + `factory`
- Position: ERC-721 position whose record owns a tick range and uint128 liquidity
- Discovery: Sort nonidentical tokens, validate enabled tick spacing, resolve factory.getPool(token0, token1, tickSpacing), and require factory.isPool(result) plus matching pool factory/token0/token1/tickSpacing reads at one block.
- Gauge discovery: Read pool.gauge as optional. For a nonzero gauge require CLGaugeFactory.isGauge, matching gauge pool/NFT/tokens/tickSpacing, and current incentives-voter liveness before relying on it.

## Liquidity and ownership boundaries

| Dimension | Read | Meaning |
| --- | --- | --- |
| basic-pool-reserves | `Pool.getReserves` | current token0/token1 balances used by the basic invariant |
| basic-lp-supply | `Pool.totalSupply and balanceOf` | fungible LP shares globally and per wallet |
| cl-pool-active-liquidity | `CLPool.liquidity` | aggregate liquidity active at the current tick |
| cl-pool-staked-active-liquidity | `CLPool.stakedLiquidity` | active liquidity attributable to positions currently staked through the pool/gauge accounting |
| cl-position-liquidity | `NonfungiblePositionManager.positions(tokenId).liquidity` | the NFT range's liquidity, whether currently in range or not |
| cl-gauge-stake-set | `CLGauge.stakedValues/stakedLength/stakedContains` | NFT IDs deposited by a specified beneficial depositor |

- Staked ERC-721 owner: While staked, ownerOf(tokenId) is the CLGauge contract. This contract owner is not the beneficial/depositor identity.
- Beneficial depositor: The depositor is the address whose gauge stake set contains tokenId. A known candidate can be verified with stakedContains(depositor, tokenId).
- Unknown depositor: If no depositor coordinate is available, represent beneficialDepositor as null/unknown; do not substitute the gauge address, the pre-stake owner, an NFT approval, or a transaction sender inferred from stale analytics.

## Deterministic math

- Tick range: `-887272` through `887272`
- Q96: `79228162514264337593543950336`
- Minimum sqrt ratio: `4295128739`
- Maximum sqrt ratio: `1461446703485210103287273052203988822378723970342`
- Price rule: token1/token0 = sqrtPriceX96^2 / 2^192 as an exact rational.
- Rounding rule: Position-manager quote math floors received liquidity and principal estimates. Core swap/mint deltas use direction-specific floor or ceil operations; a future writer must match the exact called function rather than reuse a display estimate.

### Fixture coverage

| Fixture | Operation |
| --- | --- |
| `tick-min` | `sqrt-ratio-at-tick` |
| `tick-zero` | `sqrt-ratio-at-tick` |
| `tick-max` | `sqrt-ratio-at-tick` |
| `tick-minus-60` | `sqrt-ratio-at-tick` |
| `tick-plus-60` | `sqrt-ratio-at-tick` |
| `spacing-200-full-range` | `usable-tick-bounds` |
| `readable-but-not-position-aligned` | `tick-boundary-classification` |
| `one-to-one-price` | `raw-price-rational` |
| `inside-range-principal` | `amounts-for-liquidity` |
| `inside-range-liquidity` | `liquidity-for-amounts` |
| `zero-liquidity` | `amounts-for-liquidity` |
| `partial-dynamic-read` | `dynamic-row-classification` |
| `stale-analytics-row` | `dynamic-row-classification` |
| `volatile-invariant` | `basic-volatile-invariant` |
| `stable-normalized-invariant` | `basic-stable-invariant` |

## Fixed-block topology

- Reviewed roots: 11
- Basic pool observations: 33
- CL pool observations: 13
- CL pools without a gauge at the evidence block: 2
- CL roots with exact executable reproduction: 7

These instance counts are dated evidence. Current consumers rediscover through the root factory and gauge relationships.

## Future operation gates

### resolve-dynamic-instance

- Resolve the exact network and accepted/proposed root generation.
- Derive the pool key with sorted, distinct tokens and the architecture-specific stable flag or tick spacing.
- Require a current nonzero factory mapping, factory recognition, bytecode, and matching pool identity reads at one block.
- For gauge actions additionally require current pool.gauge, gauge-factory recognition, matching position manager/pool/tokens/spacing, and voter liveness.

### swap-or-remove-slippage

- A future exact-input swap or liquidity removal must require caller-authorized nonzero minimum output values derived from a fresh quote and explicit slippage policy.
- Zero amountOutMinimum, amountAMin, or amountBMin is prohibited as a silent default.
- CL sqrtPriceLimitX96 must be explicit when the operation policy requires a price boundary; zero may only retain the contract's full-range sentinel when the caller deliberately chose that behavior.
- Use a bounded deadline and reject an already expired deadline before simulation.

### add-or-increase-liquidity

- Validate nonzero desired amounts, strict ordered/aligned tick bounds for CL, initialized state, and a current pool mapping.
- Require caller-authorized nonzero minimum accepted amounts/liquidity based on a fresh quote; do not turn a floor-rounded display estimate into a guarantee.
- Simulate the exact call from the actual sender with current balance, allowance, fee, pause, token behavior, and native-value state.

### approvals

- Default ERC-20 allowance is exact-operation or deliberately bounded; implicit unlimited approval is prohibited.
- Unlimited approval requires an explicit caller choice, trusted current spender identity, risk disclosure, and separate review.
- ERC-721 approval or approval-for-all must be explicit and must not be treated as depositor identity.

### submit-and-reconcile

- Follow the transaction workflow for fresh preflight, fee/value sufficiency, signing, submission, replacement-aware tracking, confirmation, and protocol reconciliation.
- Reconcile pool/gauge/NFT state and token deltas; a successful receipt alone does not prove the intended minimum outcome or beneficial ownership.

## Surface classification

| Class | Owned here | Boundary |
| --- | --- | --- |
| `basic-amm` | yes | factory/token pair/stable flag |
| `concentrated-liquidity-amm` | yes | CL factory/token pair/tick spacing |
| `savings-or-vault` | no | A share-priced or yield-bearing vault has deposit/withdraw/share and strategy semantics, not an AMM invariant or pool key. |
| `lending-or-borrowing` | no | Collateral, debt, interest, liquidation, and redemption positions are credit-protocol state, not AMM liquidity. |
| `analytics-row` | no | TVL/APY/volume/price rows are derived observations and cannot establish a live executable pool, gauge, owner, or route. |

See `review/gaps.md` before relying on any proposed root or operation requirement.
