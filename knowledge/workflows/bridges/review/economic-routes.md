# Economic bridge and custody review

Evidence dispositions accepted October 9, 2026, for the October 8 source review.
This review describes published architecture
and the limits of the existing deployment evidence; it does not qualify a new
executable route. `bridge-economic-docs-2026-10-08` retains the Mezo pages at
commit `ddbca2cd013092a4c637be69356695945e20bf8b`, with per-file hashes, and a
dated, hashed Threshold description. `economic-relationships` references this
review and the applicable lifecycle owners.

## Stages and completion boundaries

| Stage                   | Asset and custody / supply action                                                                                              | Authority and completion boundary                                                                                                                       | Evidence disposition                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Bitcoin deposit → tBTC  | BTC is held in Threshold-operated tBTC wallets on Bitcoin; tBTC represents backing on Ethereum.                                | Threshold's threshold-signing model governs Bitcoin custody. Bitcoin deposit inclusion alone does not prove tBTC issuance or Mezo delivery.             | Published description; no wallet/reserve attestation or complete inbound trace added here.                   |
| Ethereum tBTC → Mezo    | Ethereum bridge custody holds tBTC; the recipient receives native BTC on Mezo.                                                 | Mezo bridge validation and destination minting are a separate stage. Require the recipient's native balance/supply transition tied to the source event. | Published entry path; existing outbound evidence cannot qualify this direction.                              |
| Ethereum ERC-20 → Mezo  | Source token is locked and mapped representation is issued on Mezo. Each wrapper keeps its own identity.                       | Use the directional mapping and destination token post-state; system execution alone is insufficient.                                                   | Existing Native lifecycle supplies the rule. Wider asset availability remains token- and direction-specific. |
| Mezo BTC → Ethereum     | Native BTC is burned/removed on Mezo; backing tBTC is released to the Ethereum recipient.                                      | Join the complete Native sequence tuple with Ethereum settlement.                                                                                       | Recorded Native lifecycle, restricted to its pinned generations and evidence.                                |
| Ethereum tBTC → Bitcoin | Redeeming the backing representation produces a separate Bitcoin payout.                                                       | Threshold redemption and the actual Bitcoin transaction must be joined to the request.                                                                  | Published path; an Ethereum release is not evidence of the Bitcoin payout.                                   |
| MUSD NTT                | Published design locks MUSD on Mezo and mints on Ethereum/Base; reverse movement burns remote tokens and unlocks Mezo custody. | Resolve the actual manager mode, peer and transceiver configuration; join the NTT digest and destination execution.                                     | Existing MUSD NTT evidence is bounded by its routes and dates. Bridge issuance is not another MUSD loan.     |
| MEZO NTT                | Published design locks on Mezo, mints remotely and reverses through burn/unlock.                                               | MEZO needs its own deployments, supply modes, peers and delivery proof.                                                                                 | Published Ethereum, Base, BSC and Solana routes; no deployment qualification inherited from MUSD.            |

The Enclave triparty mechanism is a separate legally governed custody/pledge
path, described in the developer bridge guide and owned by
`protocols/musd/institutional-debt`. It must not be represented as an ordinary
tBTC deposit followed by an unrestricted borrower balance.

## Wider assets and dated restrictions

The mainnet overview names USDT, USDe, DAI and T alongside USDC and multiple
BTC wrappers. A BTC wrapper is not automatically native BTC or MUSD collateral.
Use `bridge-assets`, the indexed current-configuration capture and the existing
asset-minimum history for the qualified subset. A configured mapping does not
establish both deposit and withdrawal availability. This review adds no new
mapping, minimum, pause value or token address.

The October 8 source snapshot describes supported Bitcoin address forms and
excludes Taproot withdrawal addresses. Treat that as dated product guidance;
transaction preparation must resolve the selected route's current encoding and
availability. The separately advertised Super Bridge is marked forthcoming,
not an enabled route.

## Source conflicts and held claims

- The overview's troubleshooting paragraph says MUSD can only go to Ethereum,
  while its destination table and dedicated MUSD guide include Base. Use the
  dedicated token guide for the published destination set; do not promote the
  broad troubleshooting sentence to an exclusion.
- The overview describes all withdrawals as burns, whereas the dedicated
  MUSD and MEZO guides describe Mezo lock custody. Preserve provider-specific
  supply models and confirm deployed mode before accounting for a transfer.
- The developer bridge overview abstracts direct Bitcoin movement. The user
  deposit guide explicitly describes the intervening tBTC stage. Keep both
  custody layers visible rather than treating the abstraction as proof of a
  direct Bitcoin-to-Mezo mint.
- The Mezo dApp UI and Wormhole Portal expose different destination subsets.
  UI availability is distinct from a published protocol route and from MDK
  operation support.

Acceptance covers the published architecture and the evidence limits above.
Any new current execution claim still requires route-specific evidence and
qualified review. Historical route records, current captures and support labels
are preserved unchanged.
