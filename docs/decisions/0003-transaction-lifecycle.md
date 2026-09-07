# ADR-0003 — Transaction Lifecycle

- Status: Accepted
- Date: 2026-08-18

## Context

A transaction hash proves only that an identity was returned. It does not prove
inclusion, receipt success, confirmation, or the requested protocol outcome.
Approval transactions, replacement, cancellation, timeout, reorgs, and partial
economic fills make a boolean `success` model unsafe.

## Proposed Decision

State-changing MDK workflows use the executable candidate at logical knowledge
resource `workflows/transactions:transaction-state-machine`:

```text
validate → resolve → coherent read/quote → construct → simulate
    → approve when needed → revalidate/resimulate → submit
    → include → confirm → reconcile
```

Approval and action hashes are distinct. Timeout is non-terminal. Replacement
ends the original lifecycle and links a separately tracked successor. Reorg
returns an included/confirmed action to tracking. Only the `reconciled` state is
protocol success.

Each protocol writer must define its volatile quote inputs, exact simulated
call, allowed partial outcomes, expected receipt events, post-state reads, and
mismatch behavior. A cross-chain writer extends reconciliation through provider
message/attestation and destination-delivery evidence.

## Consequences

- Public result types cannot collapse submitted, included, confirmed, and
  reconciled into one state.
- Retry policy is attached to typed errors and operation phase; non-idempotent
  writes are never blindly repeated.
- User interfaces may derive simpler labels, but they cannot replace the
  lifecycle or claim success early.
- Domain evidence gaps block that writer even if core execution support exists.

## Decision Acceptance Gate

Architecture and security review must accept or revise the state model.
Acceptance establishes transaction semantics only; it does not release a
writer or claim that a public lifecycle API exists.

## Implementation and Release Gate

Model tests must cover every transition. Before release, a supported protocol
vertical slice must exercise validation failure, simulation revert, approval
failure, successful inclusion, replacement, cancellation, timeout, reorg,
failed receipt, and reconciliation mismatch without mainnet writes.

## Acceptance

Accepted by the human maintainer on 2026-08-21 after the architecture decision
was separated from the implementation/release proof. The accepted lifecycle
does not create writer support; each implementation still requires the
model/vertical-slice tests and protocol-specific reconciliation defined above.

## Implementation status

core execution proof implements the accepted 18-state/26-transition model in a private
TypeScript core proof and tests its inventory directly against the canonical
transaction record. Fake injected ports cover validation/chain mismatch,
simulation revert versus provider failure, approval failure transitions,
one-time submission, inclusion, confirmation, replacement, cancellation,
timeout, reorg, failed receipt, and reconciliation mismatch without a live
write. Public and protocol-specific release gates remain open.
