# Validate an amount in a browser form

Read [main.ts](main.ts) beside [index.html](index.html). The application entrypoint
finds the form, reads amount text on submission, converts it using public EVM
exports and renders a result or validation error. It makes no RPC or wallet request.

For six decimal places, entering `1.25` produces `1250000` base units. Extra
fractional precision rejects instead of rounding. The precision field is
illustrative; a financial application obtains precision from the selected asset's
verified metadata. SHA-256 here hashes the formatted text, not a transaction.

Adapt the event handler to your application's lifecycle and DOM. The entrypoint
mounts its handler when loaded and needs the matching form elements; SDK imports
remain independent of the DOM. Browser qualification is maintained separately
against packed public packages and production bundles.

See the [browser integration guide](../../docs/guides/BROWSER_APPLICATIONS.md)
for RPC/wallet adapters, SSR boundaries and compatibility.
