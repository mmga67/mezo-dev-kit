# Offline browser workbench

Try one possible composition of an exact amount tool, account overview and
transaction progress view. All values, accounts, chains and outcomes are synthetic.
The example makes no RPC request, accesses no wallet and submits no transaction.
Use individual recipes or keep your application's existing conventions.

## Run it

From the MDK repository root with its pinned dependencies installed:

```sh
pnpm build
pnpm exec vite examples/browser-workbench
```

Open the local URL Vite prints. For a production build:

```sh
pnpm exec vite build examples/browser-workbench
pnpm exec vite preview examples/browser-workbench
```

The app uses public EVM exports for exact values and public Core types for the
observation adapter. The packed-consumer browser check typechecks without Node
ambient globals or SDK source aliases; workspace typing also works before the
first build. The existing TypeScript/Vite stack needs no framework or new
dependencies. Styles belong to this example and are not a general UI package.

## Try the behavior

1. **Exact amounts:** convert the initial value above safe-number precision.
   Try `0.000001` with six decimals, zero, invalid input and German separators.
   Display truncation never changes the selectable exact decimal or base units.
2. **Account overview:** valuation initially fails independently of balance.
   Enable **Hold account reads**, refresh Alice, then switch to Bob. Release
   reads newest first: Alice's late result cannot overwrite Bob's balance.
   Changing the fixture chain also clears the old context. Disconnect clears data.
3. **Details:** open Balance details with the keyboard, use Tab/Shift+Tab and
   Escape, and check focus returns to the button. Resize to a narrow viewport;
   the table scrolls within its region and long exact values wrap in the dialog.
4. **Navigation:** use the URL views, Back/Forward and refresh. Opening the
   calculator makes no account calls. Same-context refresh keeps earlier data
   labeled with its timestamp; account changes clear it.
5. **Transaction progress:** select a scenario, start the simulation and advance
   each fixture. Start is disabled until **Reset demo**. Navigation and reload
   preserve the validated demo checkpoint when storage is available. Confirmation
   remains visible when the follow-up read fails; retry advances reconciliation.

Preferences and checkpoints disclose malformed/unsupported or unavailable storage.
Reset removes only the demo's logical checkpoint. This local-storage example is
not a Core `SubmissionStore`: it provides no cross-process intent/nonce reservation
and must not be used as production transaction recovery.

## Adapt a recipe

| File                                 | Responsibility                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| [presentation.ts](presentation.ts)   | Exact disclosure, two separator policies, truncation and injected-time freshness.       |
| [accounts.ts](accounts.ts)           | Independent source availability and obsolete-response rejection through injected reads. |
| [storage.ts](storage.ts)             | Validated preference restoration and explicit persistence failure.                      |
| [transaction.ts](transaction.ts)     | Public Core observation labels and a separate synthetic checkpoint codec/progression.   |
| [wallet-resume.ts](wallet-resume.ts) | Connector-neutral resume coalescing, event invalidation and subscription cleanup.       |
| [main.ts](main.ts)                   | Application wiring, fixture sources, URL views and native dialog behavior.              |

The resume helper is tested with injected subscriptions; the page does not connect
a real wallet. An application supplies its connector, validates its provider state
and tests actual mobile handoff independently. Demo scenarios do not execute Core
simulation, observation or reconciliation and establish no protocol qualification.

See [application organization](../../docs/guides/APPLICATION_ARCHITECTURE.md) and
[frontend patterns](../../docs/guides/FRONTEND_PATTERNS.md) for optional guidance.
The [Core reference](../../packages/core/REFERENCE.md) owns real submission/recovery
contracts; its uncertainty rules must survive any UI adaptation.

## Verification

`pnpm --filter @mezo-dev-kit/examples typecheck` checks client and model/test types.
`pnpm --filter @mezo-dev-kit/examples test` includes deterministic ordering, precision,
storage, progress and resume checks. `pnpm check` covers repository boundaries and
the ordinary build/test matrix.

After building, `pnpm test:browser` or `pnpm test:browser:container` opts into the
[browser qualification environment](../../docs/guides/BROWSER_APPLICATIONS.md#complete-browser-qualification).
The suite builds this page against packed public SDK exports and exercises its
navigation, account race, dialog, narrow layout and checkpoint reload in Chromium,
Firefox and WebKit. No browsers are needed for ordinary SDK/application use.
