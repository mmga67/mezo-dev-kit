# Organize an MDK application

This guide offers one way to organize a growing application around features and
explicit state owners. Adopt the parts that help, or keep your existing approach.
It is optional guidance, not an MDK requirement, framework recommendation or
reason to reorganize a working application. A small form can stay in one file.

Start with one feature and identify what it displays, where its data comes from
and which changes invalidate that data. The [browser integration guide](BROWSER_APPLICATIONS.md)
owns SDK/provider integration; [frontend patterns](FRONTEND_PATTERNS.md) offers
presentation and recovery recipes. Both can be used without agent skills.

## Map a feature before adding layers

For an account overview with balances and a separate valuation source, this
division keeps source failures independent and display logic testable:

| Responsibility           | Possible owner          | Example decision                                                                  |
| ------------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| Route and view selection | Application navigation  | Put a shareable selected view in the URL; preserve Back/Forward.                  |
| Request orchestration    | Account feature         | Request only visible sources; discard responses from an old account.              |
| MDK/provider adapter     | Application integration | Supply documented ports and validate external data through public APIs.           |
| View model               | Feature presentation    | Combine available balances with unavailable valuations without inventing a total. |
| Controls and layout      | Feature UI              | Show loading, partial results, exact values and source details.                   |
| Reused widget            | Existing design system  | Share a detail dialog once multiple features need the same behavior.              |

One possible file map is `account/load.ts`, `account/presentation.ts` and
`account/view.ts`, wired by a route. These names and layers are illustrative.
Keep protocol formulas, deployments and transaction semantics with the installed
SDK owners. A framework hook adapts those results; it does not become a second
protocol implementation. Use documented public package entrypoints.

Before moving a helper to shared code, identify its actual consumers and whether
they need the same semantics. An account-specific warning can remain local even
when its markup resembles another warning. Transport code belongs with the
integration it adapts; pure display rounding belongs with presentation.

## Give each kind of state a home

| State                       | Suggested owner               | Invalidation or lifetime                                                               |
| --------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Shareable view/filter       | URL                           | Validate supported values; unknown routes have a safe fallback.                        |
| Expanded row or open dialog | Component                     | Close when the selected account or item changes.                                       |
| Account data                | Feature query/cache           | Include chain, account, target and relevant inputs/coordinate in the key.              |
| Background refresh          | Same query context            | Keep earlier data labeled with its source/time; clear it on context change.            |
| Display preference          | Versioned application storage | Validate on restore; disclose memory-only fallback if storage fails.                   |
| Prepared transaction        | Workflow state                | Invalidate when account, chain, target or amount changes.                              |
| Submitted operation         | Application recovery service  | Retain identity across navigation; observe/recover independently of the visible route. |

Store only the state you need. Derive formatted labels from exact amounts and
derive active navigation from the URL instead of keeping competing copies.
Preference storage and durable transaction storage have different guarantees;
the [Core storage contract](../../packages/core/REFERENCE.md#durable-storage-and-uncertain-submissions)
owns intent reservation and recovery requirements.

## Load the selected feature

An application-owned view registry can pair a view ID, label and required data
sources. For example, an amount calculator requires no account reads; an account
view needs balances and may request valuation separately. Keep this registry in
the application, independent of MDK's installation capability sets.

On a view change, start only its needed work. Abort disposable reads if supported
and reject obsolete results even if the provider ignores cancellation. Keep
already-submitted operation tracking outside this view lifecycle. A failing
valuation service should leave balances and the calculator usable.

Use route navigation for destinations users should bookmark, local controls for
temporary modes, and dialogs for contextual detail. The
[offline workbench](../../examples/browser-workbench/README.md) demonstrates this
composition with synthetic sources and no wallet connection.

## Optional feature worksheet

Use your existing issue tracker or planning convention. This worksheet is a
prompt for decisions, not a new task format or approval process.

| Question             | Worked account-overview answer                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Outcome and owner    | Account feature shows balances even when valuation is unavailable.                                           |
| Source of truth      | Validated balances and valuation each carry their own source/time; neither substitutes for the other.        |
| State transitions    | Disconnected → loading → available/partial/failed; account changes reset the visible data.                   |
| Invariants           | Old-account responses never appear; unavailable is not zero; totals require complete inputs.                 |
| Affected consumers   | Account route and detail view; amount calculator remains independent.                                        |
| Acceptance scenarios | Reverse response order, switch account/chain, fail one source, refresh same context, navigate away and back. |

For a bounded refactor, choose one responsibility, enumerate callers and preserve
its input/output and side effects. Move an exact-value display helper with its
tests, update callers and compare rendered values before expanding the change.
Do not combine a move with new rounding rules or unrelated folder changes.

## Optional agent assistance

If useful, select `mdk-application-architecture` in compatible application tooling:

```sh
pnpm exec mdk add --skill mdk-application-architecture --dry-run
pnpm exec mdk add --skill mdk-application-architecture
```

The skill helps with feature placement and bounded refactors. It is selected
separately from the default and frontend sets, adds no framework, and preserves
application-owned instructions. Installing it does not require adopting this
file map. The [application setup guide](EXTERNAL_APPLICATIONS.md) explains the
private artifact prerequisites.
