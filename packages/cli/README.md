# MDK project utility

`@mezo-dev-kit/cli` sets up MDK guidance in an application, checks SDK
compatibility, and makes the bundled documentation searchable offline. It can
also create a TypeScript starter from a verified private artifact set.

## Start here

Use the [project setup guide](../../docs/guides/MDK_CLI.md) to build/install the
private artifacts or create a new application. The CLI runs on Node 24+ as a
project development dependency. It is not published to a package registry.

In an application with the CLI installed, preview and apply setup:

```sh
pnpm exec mdk init --domains typescript,foundation --dry-run
pnpm exec mdk init --domains typescript,foundation
pnpm exec mdk doctor --json
```

Initialization installs the selected consumer guidance and references. It creates
`AGENTS.md` only when absent; the application owns its instructions and source.
Use `--project` to select another application explicitly.

## Find documentation and update guidance

```sh
pnpm exec mdk docs search "borrowing" --offline
pnpm exec mdk docs fetch "api:musd-borrowing" --offline
pnpm exec mdk docs show "api:musd-borrowing" --offline
pnpm exec mdk sync --locked --check --offline
```

The artifact includes the declared reference corpus. Initialization copies the
selected resources; fetch makes additional bundled resources available locally.
After setup, open the complete utility guide without an MDK checkout:

```sh
pnpm exec mdk docs show "guide:docs/guides/mdk_cli.md" --offline
```

Use `mdk --help` for commands and options. The [focused tooling example](../../examples/project-tooling/README.md)
walks through creation, diagnostics, synchronization, and retrieval.

## Compatibility and recovery

Compatibility checks include built-file inventories as well as package versions.
Managed-file edits and unknown collisions are reported as conflicts. If an update
is interrupted, wait for that process to exit, then inspect `mdk recover --dry-run`
before running `mdk recover`, one recovery process at a time.

Offline operations make no requests. Configured downloads verify their locked
origin, bounds, and hashes. Bundled evidence keeps its original dates and limits;
installing it does not verify live protocol state or enable a protocol writer.

## Develop the utility

The [API reference](REFERENCE.md) covers programmatic commands, parsers, bundle
creation, and packing. The [contributor guide](../../CONTRIBUTING.md) owns workspace
checks; root `pnpm check` includes schema drift and packed external-project tests.
Starter source lives in [the TypeScript template](../../templates/typescript/README.md).
