---
name: mdk-frontend-application
description: Build or review browser and SSR frontends consuming installed MDK APIs. Use for wallet/request integration, exact amount forms, asynchronous protocol UI and bundle compatibility; not MDK repository maintenance or unrelated visual design.
---

# MDK frontend applications

Use the application's framework, design system, package manager and test conventions.
Pair with the installed TypeScript/foundation guidance and only the protocol consumer
skill needed by the feature. This skill adds frontend decisions; it does not establish
protocol support or authorize transactions.

Developers may use this skill and the companion guides as optional assistance.
The application architecture and frontend pattern guides offer possible recipes,
not required folder layouts, design tokens or workflows. Locate them through the
installed reference catalog when useful; preserve the application's chosen approach.

## Establish the installed boundary

Inspect the application instructions, installed MDK exports, matching package references
and existing wallet/provider integration. When the local MDK utility is available, use
`mdk docs search` for the browser integration guide and relevant API, then show/fetch the
returned pinned resource. Do not substitute newer website APIs or MDK source internals.

Check the actual artifact's browser compatibility before adopting it. ESM syntax, a Node
test, SSR success or a successful bundle with externalization warnings is insufficient.
Use public package imports; importing the CLI or adding Node crypto/Buffer shims is not
a frontend SDK integration strategy. If the installed artifact is incompatible, identify
the needed compatible update and continue independent UI work.

## Integrate with frontend state

1. Keep protocol calculations and transaction semantics in the installed SDK. Framework
   hooks/services adapt public results into application state rather than copying formulas,
   ABIs or registry records. Use named imports and measure their client-bundle cost.
2. Supply the documented request/signer ports from application-owned transport and wallet
   adapters. Read requests and wallet approval have different lifecycles. Preserve provider
   method binding; never assume an injected browser provider exists during SSR or before
   wallet connection. Access it in an application-controlled client lifecycle.
3. Keep private RPC credentials on the server. Verify browser endpoint access and required
   methods; do not turn a CORS failure into fabricated state. Scheduling, request timeout,
   cancellation and persistence remain application choices.
4. Key cached results by account, chain, target and relevant input/coordinate. Cancel or
   ignore obsolete responses after account/chain/input changes and component disposal.
   Clear prepared quotes/calls when their inputs change. A global wallet/client singleton
   must not mix users or requests during SSR.
5. Keep input amounts as text until validated with the installed EVM parsers; keep computed
   financial values as integer base units. Use the asset's verified precision, not a UI
   default or floating-point conversion. Serialize bigints explicitly across SSR/storage
   boundaries and validate values when restoring them.
6. Represent disconnected, loading, unavailable, partial, stale and failed data explicitly.
   A failed balance read is not zero. Distinguish wallet rejection, submitted transaction,
   receipt confirmation and protocol reconciliation. Prevent duplicate submissions and
   retain the application-owned recovery record across navigation when required.
7. Use labeled controls, keyboard-operable actions and accessible pending/error/result
   feedback. Show relevant network, asset, amount and freshness before an authorized write;
   do not silently prompt a wallet on page load or treat a transaction hash as completion.

## Adapt presentation and recovery

Use only the recipes needed by the feature. For shortened numeric display,
keep an exact selectable/copy value and explicit units; handle tiny nonzero values,
unknown values and amounts above safe-number precision without converting financial
values to `number`. Keep locale/rounding decisions out of transaction inputs.

Preserve previous data only within the same account/chain/query context, labeled
with its source/time. Clear it on context change, reject obsolete errors as well as
results, and isolate partial sources. Validate versioned preferences and explicit
bigint codecs; report denied storage instead of promising persistence. A preference
fallback is not an atomic durable submission store.

Map the installed Core observation and error variants explicitly. In particular,
`SubmissionUncertain` retains the reserved record even after a wallet send rejection;
do not offer blind resubmission. Preserve confirmed receipt state when a later read
fails. Verify replacement/cancellation through the installed recovery API. Use polite
announcements for ordinary progress and urgent alerts sparingly.

For mobile handoff, inspect provider state on resume without assuming visibility
means connected. Coalesce overlapping inspections, invalidate pending work on account,
chain or disconnect events, and remove listeners/timers on disposal. Check connector
details against the application's selected version; synthetic adapter tests do not
prove a real mobile-wallet integration.

For data/detail UI, test narrow layouts, long identifiers and exact values, labeled
controls, visible focus, dialog focus containment, Escape and focus return. For URL
views, verify Back/Forward/refresh and avoid loading unrelated sources. Tracking an
already-submitted operation has a separate lifetime from the visible view.

## Read-only evidence UI

When the installed artifact exposes `@mezo-dev-kit/evidence`, discover its recipe
catalog and validate form inputs with `parseEvidenceRequest`. Use the portable
`refreshEvidence` API with application-owned fetch, clock, cancellation and progress.
Keep capture completion, freshness, conflicts, block coherence and canonical
acceptance separate in the UI. Export the versioned report without executing a
CLI process or writing repository knowledge. Consult the installed Evidence API
reference and evidence refresh guide; preserve their candidate/coverage limits.
For `incentives.configuration`, render `incentive-configuration` conflicts and
`incentive-state` movement distinctly. Show `unsupported-codec` and unavailable
fields, the retained baseline coordinate and runtime identity failures. A changed
value does not prove a governance action, and a partial capture is not complete coverage.

## Verify the frontend boundary

- Typecheck client code without Node ambient globals; check SSR separately without a DOM.
- Build from installed public exports and fail Node-module externalization. Check a
  representative production bundle, not only the development server.
- Execute critical behavior in a real browser. Test malformed amount input, absent wallet,
  rejected connection, chain/account changes, stale responses and partial reads where the
  feature uses those boundaries. Use deterministic injected requests for repeatable tests.
- Distinguish fixture/browser success from a live provider or wallet integration. Follow
  the application testing and dependency policy; this skill does not install tools.

Pause only dependent work for a missing compatible public API, unresolved protocol input,
new dependency decision or transaction authorization. Preserve existing user authorization
and report the precise integration gap; do not move all logic to a backend merely because
one package version fails a browser check.
