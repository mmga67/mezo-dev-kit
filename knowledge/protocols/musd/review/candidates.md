# MUSD Candidate Inventory And Dispositions

This review records discrepancies and scope decisions established from pinned
official documentation, version-matched source, deployed observations, and the
current MDK architecture. Canonical records—not this ledger—own promoted facts.

| ID | Candidate claim | Authoritative check | Disposition | Owner / reason |
| --- | --- | --- | --- | --- |
| MUSD-C012 | The GasPool source comment's numeric reserve amount is current. | The comment says 50 MUSD, while the same pinned build's `LiquityBase` constant and current official fee documentation say 200 MUSD. | Conflicting / do not promote | implementation review owns and reviews the exact current gas-compensation rule; the component role remains verified. |
| MUSD-C013 | PCV fees always go to one permanently named product. | Current PCV source exposes governed MUSD/BTC recipients and a split, and invokes recipient interfaces. | Superseded | Model the configurable-recipient boundary and resolve current recipients from live state when needed. |
| MUSD-C014 | Recovery Mode behavior can be inferred from upstream Liquity behavior. | Current source exposes Recovery Mode state, while official developer docs say there are no special Recovery Mode liquidations. | Retain partial / defer | implementation review owns exact affected operations; analogy is not evidence. |
| MUSD-C015 | Broad backing copy defines a precise equality between token supply and classic trove debt. | Current source includes PCV bootstrap issuance and system interest minting; classic TCR has a narrower contract definition. | Reject as technical invariant | Keep product positioning separate from precise accounting records. |
| MUSD-C016 | Current fees, interest bounds, minimum debt, thresholds, compensation, recipients, and splits are timeless constants. | Current source distinguishes compile-time constants, initialized values, governed delayed state, direct governance setters, and deployment bindings. | Defer exact values | `model.json` owns parameter classification; consuming workflows perform block-pinned reads. |
| MUSD-C017 | Classic troves accept an ERC-20 collateral-token argument. | Current borrower functions are payable and ActivePool accounts native currency. | Reject | Canonical classic-trove collateral is native BTC; bridges and token representations have separate owners. |
| MUSD-C018 | A stated future immutability intention describes current deployment behavior. | Official docs describe an intention, while current registry evidence shows upgradeable proxies. | Retain as intent only | Do not encode a future governance promise as current architecture. |
| MUSD-C019 | Savings, AMM pools, bridge routes, and market pricing are components of the classic debt engine. | Pinned MUSD source and current registry separate these deployments and responsibilities. | Out of scope | Adjacent integrations retain separate domain owners. |

## Conflict And Gap Report

- The numeric GasPool comment is stale relative to its own pinned build.
- PCV documentation uses product-facing recipient labels while the contract is
  governed and interface based.
- The developer guide defines Recovery Mode while current liquidation source
  does not add a separate Recovery Mode liquidation algorithm.
- Broad backing/peg copy is not precise enough to define token-supply or
  collateral equalities.
- Exact governed values require current block-pinned reads when used.
- External oracle binding and operational health require separately reproduced
  evidence before they become troubleshooting knowledge.

## Derived-Artifact Decisions

- Documentation remains a projection of canonical records and does not own
  addresses or current parameter values.
- The MUSD skill routes procedure without copying protocol facts.
- No example or writer is added by these candidate dispositions.
- No shared memory entry is needed because durable results already have
  maintained owners.
