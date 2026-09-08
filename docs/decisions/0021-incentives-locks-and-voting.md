# ADR-0021 — Incentives locks and voting

- Status: Accepted for private implementation under the full-SDK task
- Date: 2026-09-08

Extend `@mezo-dev-kit/incentives` alongside its existing gauge API. The package
owns deterministic lock/boost/epoch/allocation calculations, bounded escrow and
voter state, ordinary self-owned lock operations and independently qualified
voting/reward operations. No new external dependency or parallel ownership layer.
Contracts owns curated operation ABIs and runtime identities; Tokens owns explicit
underlying allowances; Core owns signer, exact simulation and transaction state.

Select veBTC or veMEZO explicitly. Resolve current generation, token, primary and
secondary voters, booster, lock duration storage, ownership, grant/managed state,
vote state and checkpoints at one coordinate. Timed voting power floors the
amount-to-slope division first. Read-time boost and stored checkpoint boost are
separate. Pool, boost and validator voter allocations remain separate domains.

The first lock writer uses normal self-owned NFTs and direct EOA callers. It
excludes grants, managed NFTs, delegated caller execution, split/merge, governance
and custody changes. Underlying approvals are explicit independent transactions;
no operator-wide NFT approval is implied. Native BTC balance reconciliation must
account for the receipt's transaction gas. Protocol/library behavior can be tested
on a local fork with labelled native token fixtures; such fixtures cannot qualify
mezod native execution. Qualified review and release remain separate.

Each operation needs current state, exact simulation, appropriate caller bounds,
and receipt plus post-state verification before it is presented as implemented.
An epoch change does not clear stored votes. A reset and a vote have different
lastVoted effects. No source receipt, ownership assumption or arbitrary reward
address establishes a completed voting/reward outcome.
