# ADR-0016 — Protocol writers and discovered destinations

- Status: Accepted for implementation
- Date: 2026-09-08

The maintainer authorized the remaining full-SDK implementation roadmap after
the direct MUSD borrowing milestone. This extends the private execution boundary
to the existing Savings, lending and vault packages and the reusable modules
their workflows require. Qualified protocol review remains required before release.

Core retains exact simulation, intent reservation and receipt coordination.
A prepared transaction may additionally name a protocol-owned target role.
An explicitly injected resolver must derive that role's address from the
registered root at the supplied block, verify the required runtime/topology,
and return it for comparison with the exact destination. Without that resolver,
Core rejects role destinations. The role is preserved in the submission record
for verification after restart. Existing static destinations remain unchanged.
Dynamic roles do not become invented static Contract identities.

Contracts owns generated, curated operation and token-interface projections
from indexed canonical full ABIs and exact-runtime source snapshots. Domain
packages own role discovery, financial preconditions and outcome reconciliation.
EVM extends the existing Ox-backed codec for bounded bytes, tuples and arrays;
old scalar outputs retain their existing types and representation.

Token approvals are separate, explicit transactions. Protocols determine the
asset, spender and required amount. Applications inspect and execute an exact
approval, reconcile it, and prepare the protocol action again using fresh state.
No automatic unlimited approval or multi-step retry is introduced. Financial
bounds remain explicit, with contract-enforced limits distinguished from client
preflight checks. No new external dependency, publication or mainnet write is
authorized by this implementation decision.
