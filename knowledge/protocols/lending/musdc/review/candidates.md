# mUSDC lending candidates

| Candidate | Disposition | Gate |
| --- | --- | --- |
| Morpho | Accepted stable Contract root | Use the accepted bounded deployment and full ABI packet. |
| AdaptiveCurveIrm | Accepted stable Contract root | Use the accepted bounded deployment and full ABI packet. |
| BTC/mUSDC oracle proxy | Accepted market dependency | Use the accepted proxy/ABI packet and consume the accepted Skip feed identity. |
| BTC/mUSDC market | Stable market ID, not a Contract ID | Resolve from exact tuple and `CreateMarket` evidence. |
