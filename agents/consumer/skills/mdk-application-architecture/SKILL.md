---
name: mdk-application-architecture
description: Organize features, state ownership and bounded refactors in applications consuming MDK. Use when application structure is the task; not for MDK repository architecture, protocol implementation or routine visual edits.
---

# Optional application organization

Offer one possible organization, preserving the user's chosen approach and the
application's existing conventions. This skill and its companion guide are
optional; installing them does not mandate layers, folder names, a framework,
an issue format or a refactor. Keep a small feature small.

## Place the requested behavior

Inspect the affected feature, its callers, application instructions and matching
installed public MDK references. If available, use `mdk docs search` to locate
the application architecture guide and load only the relevant pinned resource.
Do not require MDK source-tree files, contributor procedures or legacy material.

- Put route selection and shareable filters in the application's existing URL
  convention. Keep temporary dialog/expansion state local.
- Keep source requests and account/chain/input invalidation with the feature's
  orchestration. Isolate pure presentation from provider access and mutable state.
- Adapt public SDK results through application-owned ports. Protocol calculations,
  addresses and transaction semantics retain their installed SDK owners.
- Share a widget/helper when named consumers need the same behavior; otherwise
  keep it with the feature. Do not create a generic utilities layer speculatively.
- Keep submitted-operation recovery independent of route/component lifetime.
  Lazy view loading must not cancel tracking of a submitted operation.

For a multi-source view, record source of truth, independent availability states,
invalidation and acceptance scenarios in the application's existing tracker when
useful. Do not copy MDK task governance into the application.

## Refactor within the requested boundary

Identify one responsibility and every affected caller. Preserve its contract and
side effects while moving it; verify behavior before combining a separate semantic
change. Avoid unrelated directory cleanup. If the current task only asks for a
label/color change or a tiny form, no structural migration is needed.

Verify the changed boundary with the application's tools: a multi-source view
needs account-change and partial-failure checks; a pure-helper move needs caller
and output equivalence; URL state needs Back/Forward/refresh checks. Use the
optional frontend skill for browser integration details when selected/available.

Continue authorized, independent work. Resolve a missing public SDK capability,
required dependency decision or conflicting application owner before the dependent
change; this skill adds no routine approval gate. Report actual checks and any
remaining gap without claiming a fixture proves live protocol support.
