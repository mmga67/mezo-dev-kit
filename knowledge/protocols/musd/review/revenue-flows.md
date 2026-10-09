# MUSD revenue allocation review

Evidence dispositions accepted October 9, 2026, for the October 8 source review.
The post-bootstrap destination remains unresolved; acceptance supplies no new
current-state evidence. Resource `musd-revenue-docs-2026-10-08`
retains relevant excerpts of the official fee, architecture and Earn descriptions at commit
`ddbca2cd013092a4c637be69356695945e20bf8b`. This review connects existing
accounting owners and records unresolved destinations; it adds no live ratio,
balance or permission assertion. Each source retains its full-file digest and
pinned URL; excerpt line ranges are explicit. Deployment-address sections are
outside this accounting review and remain with Contracts.

| Origin → destination                                       | Quantity and accounting owner                                                 | Timing, custody and authority boundary                                                                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Borrowing / refinancing / paid interest → PCV              | MUSD fees; `musd-components`, with debt/fee operations owned by Borrowing     | Debt accrual is not receipt of cash. Follow the exact operation and transferred or minted fee amount; principal repayment is not fee revenue.                                                                 |
| Redemption → protocol fee custody                          | BTC-denominated fee; Redemptions owns the collateral deduction and settlement | Distinguish the redeemer's net BTC, deducted fee and reduced loan debt. Do not sum BTC and MUSD quantities.                                                                                                   |
| PCV → bootstrap-loan repayment / governed recipient        | MUSD allocation; `musd-components` and this unresolved review                 | Official sources describe a restricted bootstrap loan and allocation constraints. Current outstanding debt, split, recipient and controlling authority need compatible pinned evidence.                       |
| Protocol BTC revenue → conversion → Savings                | BTC input and MUSD output; `musd-savings-roles`                               | Conversion is an asset exchange with its own execution and output, not another copy of the same revenue. Retained topology does not establish today's conversion amount or schedule.                          |
| Savings → direct receipt holder or gauge-associated voters | MUSD yield; `musd-savings-model` / roles                                      | Receipt custody selects the beneficiary. Deposited principal, indexed yield and gauge redirection are separate quantities. The Savings source-conflict review qualifies the public exchange-rate description. |

## Unresolved post-bootstrap destination

The fee guide says revenue flows to Savings once the bootstrap loan is repaid.
The architecture guide instead describes protocol-owned liquidity in the
StabilityPool after repayment. These statements cannot establish one current
post-repayment destination. Both are retained; `bootstrap-loan-allocation`
remains unqualified pending deployed PCV generation, debt state, recipient,
splitter and authority review. Do not infer that the bootstrap loan has already
been repaid, or copy either description into a current parameter assertion.

Other revenue branches stay with their owners: Pools owns trading-fee custody;
the mUSDC market owns borrower interest; the lending vault owns share/wrapper
yield; Incentives owns allocation, passive-fee claims and emission partitions.
See the [incentive revenue review](../../incentives/review/revenue-flows.md).
