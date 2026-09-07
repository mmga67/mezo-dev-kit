# MUSD Redemption Candidate Inventory And Dispositions

| ID | Candidate | Evidence result | Disposition |
| --- | --- | --- | --- |
| REDEEM-C001 | Redemption follows lowest current collateral ratio. | Deployed traversal follows NICR-sorted tail/prev and filters current ICR below MCR; interest can make current ICR order differ. | Promote precise deployed ordering; supersede simplified prose. |
| REDEEM-C002 | Troves below 110% can be redeemed. | Deployed code skips `ICR < MCR`; equality is eligible. | Reject below-threshold claim; promote exact boundary. |
| REDEEM-C003 | A zero iteration cap means zero work. | Deployed source maps zero to uint256 maximum. | Reject; zero means uncapped. |
| REDEEM-C004 | Invalid first hints make the call fail. | Invalid first hint falls back to tail traversal. | Reject; partial NICR staleness has different behavior. |
| REDEEM-C005 | Any stale partial hint reverts the transaction. | It cancels the final partial; earlier full fills settle, while zero total fill reverts. | Promote scoped outcome. |
| REDEEM-C006 | Attempted amount is always burned and delivered. | Only actual filled debt is burned; event distinguishes attempted/actual and remainder stays in wallet. | Reject; promote actual-fill semantics. |
| REDEEM-C007 | Borrowers pay no redemption fee. | No borrower/trove/exemption check exists in the deployed fee path; both networks report 0.75%. | Supersede docs for deployed behavior; retain discrepancy evidence. |
| REDEEM-C008 | Redemption fee is based on requested MUSD. | Deployed fee is floor-rounded from aggregate actual collateral drawn. | Reject; promote formula. |
| REDEEM-C009 | Full redemption gives all remaining collateral to the redeemer. | Price-equivalent collateral goes into gross redemption; remaining collateral becomes borrower surplus. | Reject; promote full outcome. |
| REDEEM-C010 | Partial redemption may leave any positive debt. | It must leave current minNetDebt excluding gas reserve; HintHelpers truncates toward that boundary. | Reject; promote minimum rule. |
| REDEEM-C011 | Explorer function numbers, copied addresses, wallet-address hints, and fixed NICR values are canonical quick mode. | Function order/addresses are volatile and arbitrary partial hints can cancel fill. | Reject as unsafe SDK guidance. |
| REDEEM-C014 | Transaction success is proven by a hash. | Actual fill may be partial; events and post-state are needed. | Reject; promote reconciliation requirements. |

The official redemption guide is useful discovery evidence but embeds addresses,
explorer field numbers, arbitrary quick hints, and gas-size heuristics that are
not canonical interfaces. The fee-waiver statement is stale for the recorded
deployments. No SDK/example or memory record is created in this extraction.
