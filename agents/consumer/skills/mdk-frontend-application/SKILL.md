---
name: mdk-frontend-application
description: Build or review browser and SSR frontends consuming installed MDK APIs. Use for wallet/request integration, exact amount forms, asynchronous protocol UI and bundle compatibility; not MDK repository maintenance or unrelated visual design.
---

# MDK frontend applications

Use the application's framework, design system, package manager and test conventions.
Pair with the installed TypeScript/foundation guidance and only the protocol consumer
skill needed by the feature. This skill adds frontend decisions; it does not establish
protocol support or authorize transactions.

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
