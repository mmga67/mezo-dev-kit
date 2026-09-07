---
name: mdk-incentives-knowledge
description: Resolve, calculate, verify, or maintain deployment-scoped Mezo veBTC, veMEZO, boost, voting, epoch, gauge, emission, reward, and operation knowledge through the v0.4 incentives module. Use for evidence-backed reads and deterministic rules; all writer capabilities remain unsupported.
---

# Mezo incentives knowledge

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. For maintenance, read
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` and
   `docs/standards/knowledge-management.md`.
3. Read `knowledge/protocols/incentives/README.md` and `index.json`.
4. Load only the lock, boost, pool-voting, validator-voting, gauge/reward,
   emission/splitter, operation, fixture, source, evidence, or review resources
   needed.

## Procedure

1. Resolve network identity through the Networks module.
2. Resolve bounded reusable roles through `incentives-contract-roles`. Treat
   addresses in incentives evidence as dated coordinates and require them to
   agree with the referenced Contracts deployment validity at the indexed
   block. Proposed Contract records remain unsupported pending qualified
   review. Treat dynamic validator gauge and voting-reward children as
   evidence-scoped instances, not static registry identities.
3. Give block-pinned state and matching deployed executable behavior precedence
   over descriptive documentation. Preserve explorer partial/full labels and
   metadata-versus-executable distinctions exactly.
4. Use `incentives-locks`, `incentives-boost`, `incentives-voting`,
   `incentives-gauges-rewards`, and `incentives-emissions` for shared and pool
   rules. Use `incentives-validator-voting-rewards` for the independent
   ValidatorsVoter domain, dynamic gauge lifecycle, allocation, indexing,
   distribution, and claim semantics. Do not reuse PoolsVoter weights or state
   as validator-voting inputs. Use only the unsigned Solidity integer order
   and flooring recorded by the owning resource.
5. Use `incentives-formula-fixtures` for deterministic boundaries,
   `incentives-read-integration` for the representative lock/boost read,
   `incentives-emissions-mainnet` for the bounded emission/splitter
   reconstruction, and `incentives-validator-allocation-fixtures` plus
   `incentives-validator-allocation-mainnet` for validator formulas and exact
   vote/notification/distribution/claim reconciliation. Settled event amounts
   take precedence over explanatory recomputation. Preserve unavailable
   historical fields as typed unavailable results rather than synthetic zero.
6. Treat `incentives-operations` as state-machine knowledge, not an enabled
   writer. Historical writer evidence cannot establish current preconditions.
7. Before any proposed write, resolve current identities, implementations,
   ownership/approval, allowance, epoch window, gauge graph, reward tokens, and
   governed state; simulate the exact call and define operation-specific
   receipt/post-state reconciliation.
8. On a knowledge change, update candidate/gap disposition, pinned evidence,
   source digest/reference, canonical record, fixture, generated reference, and
   validator together.
9. Run the module's structural, semantic, and drift checks plus network,
   contract, transaction, and troubleshooting consumers.

## Invariants

- Module support remains `none`. incentives evidence review, emission evidence review, and validator evidence review accepted their
  bounded protocol, emission, and validator-allocation scopes plus the two
  reusable validator factory roots; acceptance enables no public capability.
- Exact executable reproduction does not prove authorship, audit coverage, or
  proxy activation history.
- Epoch rollover does not itself erase stored vote allocations.
- veMEZO boost changes virtual veBTC voting power; it does not add locked BTC.
- Rebase and reward branches partition one emission budget; they are not
  additive mints.
- PoolsVoter and ValidatorsVoter maintain independent allocation state; one
  domain's weights must not be consumed or substituted by the other.
- Current live gauge weight, lazily accrued voter claimable, settled
  distribution amount, streamed gauge earnings, and claimed amount are
  distinct states.
- Gauge accounting is not APR, APY, forecast, or user yield.

## Stop conditions

Stop when a required role is absent from the contract-role map, a proposed
contract identity would be treated as supported, the requested operation lacks
fresh current simulation, the deployed
graph/source/evidence conflicts, an evidence window is stale for the risk, a
candidate or analytics assumption would be promoted, a new dependency is
required, or support/architecture scope would change.
