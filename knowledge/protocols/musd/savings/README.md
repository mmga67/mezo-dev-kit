# MUSD Savings knowledge

This module owns the deployment-scoped accounting and integration model for
MUSD Savings (`sMUSD`). It is adjacent to the classic MUSD debt system: a
deposit mints principal receipts one-for-one, while yield is tracked by a
separate index and paid separately. Savings balances never enter troves, TCR,
the Stability Pool, or the redemption queue.

Start with [`generated/reference.md`](generated/reference.md). Qualified Level
3 review accepted the bounded knowledge and current Contract identity under
Savings evidence review; knowledge support remains `proposed`. That knowledge
review does not authorize runtime APIs. The separately reviewed source-alpha
reader and its current boundaries are owned by the
[Savings package documentation](../../../../packages/protocols/musd-savings/README.md)
and [architecture](../../../../ARCHITECTURE.md); writers remain unsupported.
Contracts retains all five observed Savings proxy
implementation generations for coordinate-scoped history and selects the
latest verified generation for present operations.
