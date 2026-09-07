# Transaction and RPC knowledge

This directory owns verified Mezo-specific execution observations and the
machine-readable requirements established by the accepted MDK core-client and
transaction-lifecycle decisions. Generic EVM design choices live in accepted
ADRs; they are not Mezo protocol facts or an implemented public API. The private
dependency-free proof in `packages/core/` is implementation evidence only.

Start with `index.json`. It resolves stable resource IDs to:

- `transaction-mezo-observations` — verified, bounded Mezo evidence;
- `transaction-state-machine`, `transaction-client-requirements`, and
  `transaction-errors` — accepted architecture semantics;
- `transaction-requirement-matrix` — accepted routing to domain-owned rules;
- `transaction-reference` — generated human reference, never an independent
  source.

Use the transaction skill for agent procedure and the knowledge-management
standard for maintenance. Human reviewers should read the generated reference,
then open only the records or evidence relevant to their decision.

For bounded event scans, checkpoints, backfills, negative evidence, and
materialized reconciliation projections, follow
`docs/guides/INDEXING_RECONCILIATION.md`. Indexed status never overrides this
module's lifecycle or a protocol owner's completion rules.

## Authority boundary

These records are a validated projection of cited evidence, not evidence by
themselves. Current deployed state and version-matched source override prose.
Endpoint observations establish only the methods, provider, and time tested.
They do not establish archive support, reliability, subscriptions, batching
limits on another plan, or full Ethereum compatibility.

No writer may treat a returned transaction hash as success. The action is only
successful after its receipt is included with success, the configured
confirmation policy is met, and protocol-specific reconciliation passes.
Cross-chain delivery requires separate destination evidence.

## Production boundary

This module's v0.4 structure and architecture review are complete, but its
contents make no runtime support promise. ADR-0002 and ADR-0003 accept the
responsibility boundary and lifecycle semantics. Model validation proves that
the state machine is internally coherent, and core execution proof model-tests the private
implementation against all accepted states, transitions, and errors. Neither
accepts a public API or writer. The Mezo observations remain pending qualified
review and must be rechecked after their evidence window.

The public workflow requirement matrix uses record ID
`protocol-workflow-requirements-v1` under the unchanged stable resource
`workflows/transactions:transaction-requirement-matrix`. Its domain requirements
and lifecycle constraints are unchanged by source publication.
