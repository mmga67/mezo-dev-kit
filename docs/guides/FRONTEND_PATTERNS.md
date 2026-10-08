# Present financial application state

These optional recipes show one way to make an MDK application understandable
when data is partial, amounts are precise and transactions take time. Keep your
application's branding, framework, design system and testing conventions. Choose
individual recipes; MDK does not require this visual style or screen structure.

The [offline browser workbench](../../examples/browser-workbench/README.md) lets
you try the recipes with fixtures. For SDK setup and supplied provider ports,
use the [browser integration guide](BROWSER_APPLICATIONS.md).

## Compose a screen

A useful starting point is a page title and context, a small summary, one primary
action, a data view and contextual detail. Distinguish the primary action from
navigation and secondary inspection. Use text and icons alongside semantic color
so loading, warning and failure do not depend on color alone.

Prefer stable content while refreshing the same context. Reserve loading space
on first load; keep previous same-context data with its timestamp on refresh.
Clear it when account or chain changes. Show source failures beside the affected
section, without replacing unrelated working tools with a page-wide error.

For dense data, a labeled, horizontally scrollable table can preserve row/header
relationships on narrow screens. A mobile card alternative should expose the
same labels, values and actions without duplicating focusable content. Let long
addresses, hashes and exact amounts wrap in details. Check narrow and wide
layouts, zoom, visible focus, empty data, large values and partial failures.

## Disclose exact values

Keep form input as text and use `parseUnitsExact` with the asset's verified
precision. Format base-unit bigints with `formatUnitsExact`; the
[EVM value contract](../../packages/evm/README.md) defines those APIs.

| Situation            | Presentation option                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| Large amount         | Group the integer part without converting the amount to a JavaScript number.                            |
| Short display        | Truncate fractional display digits with an explicit label; expose the exact decimal for selection/copy. |
| Tiny positive amount | Show a less-than threshold such as `<0.0001`, never a misleading zero.                                  |
| Missing value        | Say unavailable; reserve `0` for a successful zero result.                                              |
| Valuation or quote   | Label its unit, source and time; estimated output is distinct from received output.                     |
| Time                 | Render an absolute time; compute relative age from an injected clock and an explicit freshness policy.  |

Localization belongs in presentation. The workbench offers two explicit separator
policies and truncation, using integer/string operations. It retains exact,
unlocalized copy values; it is not a general locale or asset-metadata library.
Never feed rounded display text back into transaction inputs. Asset decimals and
protocol rounding still come from their owning APIs/evidence.

## Keep account data separate

Create a request identity from account, chain, target and relevant inputs. Keep a
generation counter or equivalent cancellation scope: when the context changes,
clear visible data and reject earlier responses, including earlier errors. On a
same-context refresh, preserve the old value while marking refresh in progress.
Invalidate the generation on disposal. Cancellation alone is insufficient when
an adapter cannot honor it.

Represent each source independently. A successful balance plus unavailable
valuation is partial data, not a zero valuation or complete portfolio total.
The workbench's injected source loader demonstrates reversed completion order,
chain/account changes and same-context refresh without a query-library dependency.

## Separate preferences from recovery

For a UI preference, store a small versioned object and validate each known field
on restore. Report malformed/unsupported data and use a known default; a denied
storage write can leave the current session usable while clearly reporting that
the preference was not saved. Inject storage so SSR needs no browser globals.
Use explicit decimal-string codecs for bigint fields instead of changing
`BigInt.prototype` or accepting arbitrary JSON objects.

For real submissions, use the installed
[Core submission-store contract](../../packages/core/REFERENCE.md#durable-storage-and-uncertain-submissions).
Preference fallback and browser local storage do not satisfy its atomic reservation
guarantees. Retain the reserved intent before wallet submission, including uncertain
outcomes. The workbench persists only a validated **demo checkpoint**; it is not a
submission-store implementation and never sends a transaction.

## Explain transaction progress

Adapt actual results from the installed execution API; keep UI labels application
owned. The [Core lifecycle reference](../../packages/core/REFERENCE.md#submission-records-and-observation-states)
defines observation states and recovery. A possible mapping is:

| Result or boundary                     | UI message and next action                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| Simulation failure                     | Explain that preparation failed; correct inputs before any wallet action.        |
| Wallet request pending                 | Awaiting wallet; suppress a duplicate action.                                    |
| Core `SubmissionUncertain`             | Preserve the returned record and any hash; inspect/recover rather than resubmit. |
| `submitted`                            | Show hash/operation identity and pending observation.                            |
| `included`                             | Confirming; inclusion is not final confirmation.                                 |
| `confirmed`                            | Receipt confirmed; protocol outcome still awaits reconciliation.                 |
| `execution-reverted` / `reorged`       | Explain the observed failure or changed inclusion; retain identity.              |
| `inspectHash` replacement/cancellation | Explain the inspected outcome; do not silently replace the original intent.      |
| Successful domain reconciliation       | Show the verified outcome.                                                       |
| Failed post-confirmation read          | Keep receipt confirmation visible and offer observation/reconciliation retry.    |

A wallet rejecting Core's send can still produce `SubmissionUncertain`, with a
reserved record. Do not convert every rejection into an idle, retryable form.
Connection rejection before an intent exists is a different boundary. Navigation
and reload must not erase a real submitted identity or automatically sign again.

Use polite status announcements for ordinary progress. Reserve alerts for urgent
information; [W3C's alert guidance](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)
warns that frequent interruptions impede use. Keep failure details available
until the user has had time to read them.

## Offer keyboard-accessible detail

Give a modal detail dialog an accessible name, an appropriate initial focus
target, a visible close button, contained keyboard focus, Escape dismissal and
focus return to its opener (or a logical replacement if it disappeared).
Background content must be inert while it is open. These behaviors follow the
[W3C modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
The example uses native `dialog.showModal()` and explicitly restores focus.
Test the behavior in your supported browsers; markup alone proves no accessibility
conformance.

## Check mobile wallet handoff

Treat return-to-visible as a reason to inspect provider state, not proof of
connection. The [EIP-1193 provider contract](https://eips.ethereum.org/EIPS/eip-1193)
defines account/chain and connectivity events; connector-specific retries and
deep links need verification against the versions your application selected.

Use an application adapter to refresh the current account/chain after returning.
Suppress overlapping inspections, invalidate pending work on provider events,
clear account data after disconnect, and remove subscriptions on disposal. Do
not automatically reconnect or sign when a page becomes visible. The workbench
contains a deterministic resume helper for these decisions, with no connector.

Exercise repeated resumes, disconnect during a read, changed account/chain,
rejected connection, denied storage and cleanup. Keep actual device/browser/wallet
handoff checks separate from fixture tests. Those checks require your selected
connector; this example does not qualify a live wallet integration.
