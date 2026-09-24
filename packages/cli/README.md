# MDK project utility

`@mezo-dev-kit/cli` sets up MDK guidance in an application, checks SDK
compatibility, and makes the bundled documentation searchable offline. It can
also create a TypeScript starter from a verified private artifact set.
The starter includes foundation packages, TypeScript/foundation skills and
project memory. Add domain capabilities later from the console.

## Start here

From a prepared MDK checkout, run `pnpm cli` to create a project through guided
choices. The console handles artifact preparation, installation, guidance and
checks. A recipient of a prebuilt private kit runs `node start.ts` inside the kit.
Use the [project setup guide](../../docs/guides/MDK_CLI.md#guided-setup) for prerequisites
and the complete flow. The CLI runs on Node 24+ and is not published to a registry.

In a generated application, `pnpm mdk` opens the project console. In any project
with the CLI installed, use `pnpm exec mdk`. Neither requires a global install.
Use `mdk console --plain` for numbered choices. Explicit commands remain available
for scripts and AI agents; prompts never open in CI or noninteractive execution.

With matching SDKs already installed, initialize their guidance:

```sh
pnpm exec mdk init --set base --dry-run
pnpm exec mdk init --set base
pnpm exec mdk doctor --json
```

Initialization installs the selected consumer guidance and references. It creates
`AGENTS.md` only when absent; the application owns its instructions and source.
Use `--project` to select another application explicitly.

## Add packages and skills

Choose **Add capabilities or skills** in the console, or use:

```sh
pnpm exec mdk sets
pnpm exec mdk add borrowing --dry-run
pnpm exec mdk add borrowing
pnpm exec mdk skills
pnpm exec mdk add --skill mdk-memory-application
```

Each set combines matching package dependencies, portable skills and references.
Generated apps retain the private artifact manifest needed for later additions.
An existing independent app can supply `--artifacts <manifest.json>` explicitly.
Additions preserve unrelated dependencies, custom skills, memory and existing
instructions. Existing MDK version/override conflicts require reconciliation;
the command never chooses an SDK upgrade. A failed package install retains its
completed work; repeat the same addition after resolving the reported problem.

Local memory commands and the portable skill work without the source checkout
or an external service. See the [application memory guide](../../docs/guides/APPLICATION_MEMORY.md).

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
