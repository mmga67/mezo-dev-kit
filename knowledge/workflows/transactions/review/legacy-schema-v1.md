# Legacy transaction record notes

This review-only document records the pre-v0.4 shape retained for migration
audit. The current structural contract is indexed under `schema/v1/`; the
semantic validator remains executable authority for cross-record behavior.

The maintained JSON resources use record-kind schema version `1`; this is
separate from knowledge layout version `0.4`.

## Index

`index.json` declares lifecycle state and stable resource IDs. It is the only
machine entry point and resolves role-based physical paths.

## State machine

`transaction-state-machine` defines named lifecycle states and allowed event-driven
transitions. A state declares whether it is terminal, whether an action hash is
required, and its success level. Only `reconciled` is protocol success.
`replaced` and `cancelled` are terminal outcomes for the original action, while
a replacement action is tracked as a separately linked lifecycle.

Preflight stages (`validate`, deployment resolution, coherent read/quote,
typed construction) precede `constructed`. Approval is a distinct transaction
phase. After approval confirmation the action must revalidate volatile inputs
and simulate again before submission.

## Requirements and errors

`transaction-client-requirements` contains architecture requirements with stable IDs,
scope, normative statement, rationale, and source classification. Architecture
candidates remain `proposed`; observed Mezo behavior must cite a canonical
evidence owner.

`transaction-errors` defines shared categories, the lifecycle stage, default retry
classification, and required context. `retry` means the operation can be
retried only after its stated precondition. It never authorizes blind replay of
a state-changing request.

## Domain matrix

`transaction-requirement-matrix` routes protocol-specific preconditions and
reconciliation to their canonical task/domain. A blocked domain cannot supply a
supported write template; generic client support does not fill an evidence gap.

## Candidate dispositions

`transaction-candidates` accounts for promoted proposals, retained leads, rejected
product implementation details, and unresolved questions. It is an inventory,
not a source of runtime facts.
