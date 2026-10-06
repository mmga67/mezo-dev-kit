# MDK cookbook

Learn how to use MDK in an application by reading small, commented TypeScript
recipes. Start with one operation, then follow an advanced composition when you
need several steps. There is no example console or demonstration command to run.

## Start here

1. Read [exact amounts](evm/README.md): convert decimal form text to integer base units.
2. Follow [application connections](SETUP.md): supply your RPC first; add a wallet,
   consent and durable storage only for writes.
3. Read [two balances at one block](core/read-balances.ts) or
   [preview borrowing eligibility](borrow-musd/preview-position.ts).
4. Choose an operation from the [package and recipe index](PACKAGES.md). Each
   folder explains its inputs, return value and relevant failure cases.
5. Follow its `workflow.ts` for advanced composition. These files take amounts
   and dependencies from the application and return domain results.

For browser applications, the [amount form](browser/README.md) shows input
validation and rendering; the [browser integration guide](../docs/guides/BROWSER_APPLICATIONS.md)
explains RPC, wallets, SSR and package compatibility.

## Follow one transaction

A focused write recipe keeps each stage visible: prepare current state, obtain
any separate token approval, prepare again, simulate the exact call, request
application consent, submit, observe confirmation, then reconcile the protocol
result. A successful receipt alone does not establish the expected outcome.

`review(simulated)` belongs to the application. Show the exact network, account,
recipient, value and calldata, with the protocol intent and bounds from your
application state. Resolve only after consent; reject when the user cancels.
Each approval and each action needs its own decision. The wallet still owns
signing and fee selection. See [connection and recovery guidance](SETUP.md).

The larger recipes demonstrate sequencing, not a single atomic operation.
Earlier transactions remain real if a later step fails. Preserve operation IDs
and submission records; inspect an uncertain submission before deciding what
happens next. [Mixed swaps](swap-tokens/mixed.ts) explicitly persist intermediate
funds, and [bridge observation](bridge-musd/observe-delivery.ts) stays separate
from sending.

## Scope and verification

These are typechecked recipes for private workspace APIs. Current supported
methods and release limits belong to the [SDK references](../docs/reference/sdk.md).
Reading or compiling a recipe does not qualify a writer for release or refresh
its protocol evidence. Caller amounts, balances, governed limits and provider
capabilities must be checked when an application prepares a real operation.

Contributors keep recipes aligned through TypeScript, lint, build, import and
link checks. Built import checks load exports without executing a financial
workflow. Independent helper tests and browser qualification remain separate;
see [contributor verification](../CONTRIBUTING.md#verification).

For read-only frontend evidence collection, see the [typed recipe](evidence/refresh.ts)
and [junior walkthrough](../docs/guides/EVIDENCE_REFRESH.md). No example runner is required.
