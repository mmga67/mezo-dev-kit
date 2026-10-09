# Institutional MUSD debt gaps

- institutional debt evidence review qualified Level 3 review accepted the module review and its three
  Contract identities and ABIs; protocol support remains proposed.
- Current roles, allowlists, UTXOs, positions, prices, rates, caps, and totals
  require a fresh block-pinned read before use.
- The [private SDK](../../../../../packages/protocols/musd-institutional-debt/README.md)
  implements bounded position reads and calculations. It has no partner
  transaction writer, event indexer or monitoring service; its qualified
  implementation review and release remain outstanding.
- No deployed liquidation operation was found; the enum member is not a
  supported capability.
- No cross-system product backing, collateralization, solvency, or exposure
  definition is accepted.
- Bridge evidence freshness remains independently owned and does not alter this
  module's accepted review or proposed support boundary.
