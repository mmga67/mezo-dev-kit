# Pool and liquidity candidate inventory

| Candidate | Decision | Reason |
| --- | --- | --- |
| Dedicated `protocols/pools` module | Promoted as accepted | Basic and CL mechanisms share pool discovery/liquidity concerns but require an owner distinct from incentives and transactions. pool evidence review received qualified acceptance. |
| Accepted basic Router and PoolFactory | Reference | Contracts already owns accepted identity, activation, ABI, and provenance. |
| Seven documented mainnet CL roots | Promoted as accepted | Official docs, explorer creation identity, full ABI, fixed-block runtime, root relationships, and executable reproduction are pinned and received qualified Level 3 acceptance. |
| Every basic/CL pool and gauge | Evidence only | Instances are factory/voter-derived volatile state; a static supported registry would become stale and violate ownership. |
| Three docs-named basic pools | Evidence only | They are present in the accepted factory at the evidence block but named route/product support is outside this bootstrap. |
| Quoter | Retain as gap | Current official pool documentation publishes no Quoter identity and upstream addresses do not establish Mezo deployment identity. |
| APY/TVL/rebalancing planner | Reject from module | Derived analytics and strategy are not canonical pool state. |
| Savings/vault/lending deposits | Route elsewhere | Their share/debt/collateral semantics are not AMM invariants or liquidity positions. |
| Pool troubleshooting symptoms | Retain as candidates | Empty liquidity, invalid spacing, stale mapping, wrong architecture, unknown depositor, and missing gauge are modeled; promote to troubleshooting only after a concrete symptom is reproduced. |
