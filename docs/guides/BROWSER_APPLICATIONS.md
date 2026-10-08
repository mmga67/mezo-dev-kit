# Use MDK in a browser application

MDK SDK packages use the same ESM implementation in Node and modern browsers.
Import their public entrypoints from your TypeScript frontend, and supply your
application's RPC, wallet and storage adapters. The CLI, generators and repository
tools run in Node and do not belong in a client bundle.

Use a matching private artifact set under the current
[application setup](EXTERNAL_APPLICATIONS.md). Runtime compatibility does not
publish packages or extend any protocol reader/writer's qualification. Package
references own available operations and required inputs.

## Start with a frontend

The [browser example](../../examples/browser/README.md) is a complete offline
amount form, with labeled inputs, exact conversion, portable hashing and validation
feedback. Build the SDK first, then run `pnpm exec vite examples/browser` from the
repository root. Use `pnpm exec vite build examples/browser` for its production build.

In an existing application, preserve its framework and tooling. MDK does not require
React, a wallet library or Node polyfills. Use named public imports and verify the
production client bundle, including server/client separation in an SSR framework.

The optional consumer capability set is `frontend`:

```sh
pnpm exec mdk add frontend --dry-run
pnpm exec mdk add frontend
```

Run these in an application with compatible installed MDK tooling/artifacts. The set
adds foundation packages and frontend guidance; it does not install a framework or
application test runner. Select additional protocol sets for the workflows you need.

For optional application-level ideas, see [feature organization](APPLICATION_ARCHITECTURE.md)
and [frontend patterns](FRONTEND_PATTERNS.md). Adopt individual recipes or retain
your own conventions. The [offline workbench](../../examples/browser-workbench/README.md)
combines exact display, account-scoped reads, detail dialogs and simulated progress.

## Supply RPC and wallet ports

Core accepts an application-owned JSON-RPC request function. This excerpt adapts a
provider already selected by the application; it does not discover or connect a wallet:

```ts
import { createRpcTransport, createRpcSigner } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { parseUserAddress } from "@mezo-dev-kit/evm";

export function bindProvider(provider: { request: RpcRequest }, selectedAccount: string) {
  const request: RpcRequest = (input) => provider.request(input);
  const transport = createRpcTransport({ id: "application-provider", request });
  const signer = createRpcSigner({ account: parseUserAddress(selectedAccount), request });
  return { transport, signer };
}
```

Calling the factory performs no network request or transaction. A wallet provider
must implement the documented request contract; preserve its method binding. The
application requests connection through its chosen wallet integration and recreates
account/chain-dependent state when the selection changes. Use an HTTP request adapter
instead for provider reads where appropriate; the application owns endpoint access,
authentication, response validation, timeout, cancellation and retry policy.

Keep private credentials server-side and check browser cross-origin access to the
chosen endpoint. A successful Node request does not establish browser access. A
server proxy or worker may be appropriate for private endpoints or long scans, while
SDK calculations and validation remain reusable on either side.

## Keep UI and SSR state correct

- Read wallet/browser globals only in the application's client lifecycle. SDK imports
  themselves do not require `window` or `document`; do not share a user's wallet or
  mutable request state across SSR requests.
- Keep amount input as text, then validate with EVM using verified asset precision.
  Store computed amounts as bigint base units and format explicitly. Serialize bigint
  deliberately when crossing a JSON/SSR boundary and validate restored data.
- Key results by account, chain, target and operation inputs. Cancel or discard obsolete
  responses after changes or unmount; stale results must not overwrite a new selection.
- Show loading, failed, unavailable, partial and stale states distinctly. A failed read
  is not a zero balance. Invalidate prepared calls when their inputs or wallet context change.
- Let explicit user actions initiate authorized signing. Prevent duplicate submissions
  and distinguish submitted, confirmed and reconciled outcomes. Applications own durable
  recovery records; changing pages does not prove a transaction failed.

## Runtime and bundle contract

The SDK targets ES2022 with BigInt, typed arrays, `TextEncoder`, `structuredClone`,
abort signals and standard timers. Use modern browsers providing those APIs. Node 24
is the development baseline; Node-specific ambient types are excluded from SDK builds.
The test toolchain additionally uses DOM declarations for its browser-driver types.

Browser qualification uses the Chromium, Firefox and WebKit revisions shipped with
the root-pinned Playwright version. See the root manifest/lockfile for exact tooling.
The suite records actual engine failures; it does not silently skip a missing browser.
This does not promise older browser versions, every mobile WebView, React Native or
every edge runtime. Integrators test their own supported application matrix.

EVM implements synchronous SHA-256 and Keccak through its existing Ox dependency.
Callers explicitly encode text as UTF-8. The [hashing contract](../../packages/evm/REFERENCE.md#byte-hashing)
defines algorithms and output formats; protocol/runtime identities and event
checkpoints retain their original digests.

SDK packages declare no required import-only side effects, allowing bundlers to drop
unused modules. Importing a calculation or request adapter should not retain the whole
contract registry. Registry lookup APIs still include their canonical generated data.
Avoid copying a reduced address/ABI catalog into application code to save bytes.

## Verify an integration

Typecheck client code with Web API libraries and without configured Node ambient types.
Run the application's production build and reject Node-module externalization warnings.
Test SSR imports separately from browser behavior. ESM output or a successful bundle
does not prove the executed operations are portable.

MDK applications use the SDK through their existing browser or Node runtime.
The SDK, CLI and generated starter do not require Playwright browsers or browser
system libraries. Applications choose their own integration-test tooling.

For ordinary MDK contributor verification, run `pnpm check`. It covers code,
generated consistency, built packages, clean installation and unit tests without
launching a browser. Browser qualification is an optional additional check.

### Complete browser qualification

Opt in when you want to verify the complete maintained Node/browser matrix.
Choose a container or native browser installation. Both paths execute the same
suite and assertions. Install the root-pinned Node/pnpm tooling and locked project
dependencies first with `pnpm install --frozen-lockfile`.

#### Browser container

Use a local Docker engine with Linux container support. Docker Desktop users in
WSL must enable integration for their distribution. This path requires no host
Playwright browser downloads, codecs or apt packages:

```sh
pnpm check:browser:container
```

The command runs default checks on the host, then starts a disposable browser
server from the official Playwright image. The first invocation downloads that
image. Its version and multi-platform digest are pinned in
[the container configuration](../../scripts/lib/browser-container.ts) and checked
against the root-pinned and installed Playwright versions. It reuses the installed
driver as a read-only mount, without installing another package set inside the
container. The host Vitest process connects through a randomly allocated loopback
port; builds, declarations and package tests continue to use the existing toolchain.

The container runs as `pwuser`, with a read-only root filesystem, dropped Linux
capabilities and temporary browser data. It receives no repository, home directory,
Docker socket, wallet or credential mounts. Normal completion, test failure and
handled interruption remove its container. A daemon failure or forced process kill
may require removing the uniquely named `mdk-browser-*` container printed at startup.
This environment is for the maintained offline fixtures; isolation does not patch
its dependencies or qualify it for browsing untrusted sites.

After the current checkout is built and checked, `pnpm test:browser:container`
runs only the additional suite. Follow the
[official Playwright container documentation](https://playwright.dev/docs/docker)
when reviewing an image update; update its version and digest together and rerun
all engines. A version mismatch fails before a container starts.

#### Native browser installation

If you prefer native execution, install the browsers matching the pinned
Playwright version:

```sh
pnpm exec playwright install chromium firefox webkit
```

Native Linux browser execution also needs
[Playwright's system libraries](https://playwright.dev/docs/browsers#install-system-dependencies).
Only provision them if you choose this qualification environment. To inspect the
host package plan before installing it:

```sh
pnpm exec playwright install-deps --dry-run chromium firefox webkit
```

Review the host's dependency policy and current package advisories. If the plan
is suitable, install explicitly with
`pnpm exec playwright install-deps chromium firefox webkit`; Linux system package
installation requires elevated privileges. Browser testing may instead run on a
separately provisioned machine. No container or host package installation is part
of ordinary MDK setup.

Run the default checks and all browser cases together:

```sh
pnpm check:browser
```

If the current checkout has already been built and checked, run just the additional
suite with `pnpm test:browser`. `PLAYWRIGHT_BROWSERS_PATH` can select an existing
browser cache; use the same value during browser installation and test execution.
Tests never install missing browsers or system libraries automatically.

`pnpm test:browser` runs Vitest with Playwright as a browser driver. It packs and extracts
every SDK package, resolves each public entrypoint without SDK source aliases, checks
Node imports without a DOM, and compiles declarations with browser libraries. Actual
browser cases cover amount parsing, both byte/text SHA-256, ABI round trips, registry
resolution, injected requests, runtime-code mismatch rejection and resumption of a
checkpoint created before the hashing migration. The frontend form checks valid and
invalid amount input. Separate bundle budgets guard small Savings/RPC imports against
full registry retention. `pnpm check:browser` and `pnpm check:browser:container` include this entire suite;
`pnpm check` does not.

A complete browser qualification requires every selected suite case to pass,
including Chromium, Firefox and WebKit. An explicitly invoked suite fails on a
missing browser or library; it does not silently skip that engine. Record the
checkout, Playwright version, host platform and result. When running only the
default checks, report browser qualification as not run. These commands establish
code/runtime verification; live evidence, protocol acceptance and release review
remain separate.

Browser tests use synthetic requests and block outbound page requests. They do not
establish live provider capabilities, wallet integration or transaction settlement.
Applications still verify those boundaries within the requested workflow.
