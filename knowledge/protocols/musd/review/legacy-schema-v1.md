# MUSD Knowledge Record Contract

The machine-readable files in this directory use schema version `1`.
`scripts/validate-musd-knowledge.ts` is the executable schema until a shared
knowledge-schema package is deliberately adopted.

## Common Status

Every catalog declares:

- `status`: evidence state for the pinned protocol version;
- `supportStatus`: whether MDK has accepted the records as a public support
  promise;
- `reviewStatus`: the Level 3 review gate.

`verified-versioned` means the claim is supported for the pinned official
source/deployment scope. It does not mean the claim is immutable. All records
created by implementation review use `supportStatus: proposed` and
`reviewStatus: pending-qualified-review`.

## Evidence

Every promoted record has one or more evidence entries containing:

- a source artifact ID from `sources.json`;
- a precise source locator;
- a short statement of what the evidence establishes.

Official repositories are pinned by full commit and artifact SHA-256.
Non-canonical input cannot be the sole evidence for a promoted claim. Contract
deployment identity and current-code evidence
remain owned by `knowledge/contracts/`; MUSD records reference stable contract
IDs only.

## Stability Classes

- `stable-design`: a conceptual relationship intended to survive parameter
  changes, while still scoped to the pinned protocol family.
- `versioned-design`: behavior of the currently verified implementation that
  may change in a future upgrade.
- `governed-state`: a value or binding that authorized roles can change.
- `deployment-state`: a network-specific binding resolved from the contract
  registry or live state.

No class is shorthand for “forever true.” Consumers must honor the source,
deployment, and review scope.

## Domain Boundaries

`terminology.json` defines reusable meanings. `components.json` defines roles
and relationships. `model.json` contains atomic system claims, units, and
parameter ownership. It may name a borrowing/redemption concept only to locate
its owner; detailed workflow and financial semantics remain in implementation review and
implementation review.

Future generated docs/types must derive from these inputs and carry their
digests. Application read models, caching, UI labels, and database schemas are
not protocol facts.
