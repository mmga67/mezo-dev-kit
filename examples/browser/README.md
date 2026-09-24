# Browser amount example

Run exact amount conversion and portable SHA-256 through the public EVM package in
a browser. The form uses illustrative precision and makes no network request or
wallet connection.

From the repository root, after installing the pinned workspace dependencies:

```sh
pnpm build
pnpm exec vite examples/browser
```

Open the local URL printed by Vite. Enter `1.25` with precision `6` to see `1250000`
base units. An amount with more fractional digits than the selected precision
produces a validation message rather than silently rounding.

Build the same application with `pnpm exec vite build examples/browser`. Development
and production bundles resolve built public package exports, with no Node polyfills
or SDK source aliases. Workspace typechecking uses the existing source paths before
builds; the browser suite also typechecks and executes the form against packed SDK artifacts.

See the [browser integration guide](../../docs/guides/BROWSER_APPLICATIONS.md) for
RPC/wallet integration, SSR boundaries, compatibility and verification.
