# Repository scripts

This is the manual for MDK contributor automation: checking a checkout,
regenerating derived files, maintaining evidence, and managing local workspace
tasks. Run the commands below **from the repository root**.

## Start here

Use the Node and pnpm versions declared in [package.json](../package.json),
then install the locked dependencies:

```sh
pnpm install --frozen-lockfile
pnpm check
```

Scripts run directly as TypeScript with Node. Some load installed tooling or
built workspace packages, so installation alone is not enough for every command.
The recipes below name the additional prerequisites.

## Choose a task

| I want to…                                              | Command or manual                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Find/read canonical knowledge or relevant memory        | `pnpm context --help`; [offline retrieval](agents/CONTEXT.md)                     |
| Verify the whole checkout                               | `pnpm check`                                                                      |
| Check formatting, types, lint, or package boundaries    | `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm boundaries`             |
| Apply formatting                                        | `pnpm format` writes the configured source surfaces                               |
| Build packages and examples                             | `pnpm build` writes their build outputs                                           |
| Detect SDK generated-file drift                         | `pnpm generate:check`; see [generation](generate/README.md) for other projections |
| Regenerate one derived file                             | [Generation recipes and catalog](generate/README.md)                              |
| Validate knowledge or documentation                     | [Checks](checks/README.md)                                                        |
| Check the mainnet reader evidence set                   | `pnpm check:evidence:mainnet`                                                     |
| Run code checks and mainnet evidence checks             | `pnpm check:readers:mainnet`                                                      |
| Run tests or reproduce one failure                      | [Tests and their runners](tests/README.md)                                        |
| Capture evidence, import it, or inspect contract source | [Evidence tools](evidence/README.md)                                              |
| Install or refresh agent skills                         | [Agent utilities](agents/README.md)                                               |
| Create/list local work records or clean build output    | [Workspace utilities](workspace/README.md)                                        |

`pnpm check` runs source/task checks, formatting, generated drift, typechecking,
lint, boundaries, builds, browser tests, built-package tests, the clean-workspace smoke test,
and unit tests in sequence. It stops at the first failing command. Builds and
tests can write build output and temporary files. This command does not collect
live evidence or run every domain validator; select the owning module's checks
when knowledge changes.

Browser tests require [Playwright browsers and host libraries](../docs/guides/BROWSER_APPLICATIONS.md#verify-an-integration).

## Folder layout

```text
scripts/
├── README.md
├── agents/       skill validation, materialization, and evaluation setup
├── checks/       repository, documentation, and knowledge validators
├── evidence/     captures, imports, refreshes, and source/build investigation
├── generate/     canonical inputs → derived package and reference files
├── workspace/    local task records and approved build-output cleanup
├── tests/        automation tests and integration smoke entrypoints
├── lib/          shared implementation imported by scripts
└── fixtures/     synthetic Solidity and deliberately invalid coding examples
```

Each entrypoint keeps its descriptive filename. Existing `pnpm` aliases retain
their names; direct `node scripts/<name>.ts` invocations now use the workflow
directory. For example, `node scripts/checks/validate-markdown-links.ts` checks
local documentation links. Historical evidence may retain the old command as
part of its recorded provenance; locate the matching basename in this layout.

`lib/` contains imported helpers, not commands. `fixtures/` supplies test inputs;
its invalid coding examples are meant to fail the gates that their tests invoke.

## Command conventions

- Prefer a root `pnpm` alias when one exists. [package.json](../package.json)
  owns the exact command chain; each package owns its own scripts.
- `--check` on a generator compares output and exits nonzero on drift. Omitting
  it writes derived files. A successful comparison does not renew evidence.
- `--help`, `--check`, network flags, and dry-run support are **script-specific**.
  Consult the relevant manual before invoking an unfamiliar entrypoint. Some
  evidence importers act immediately with no arguments.
- A nonzero exit means the command failed. Read the named file, resource, or
  prerequisite in the error; rerun that command after correcting its cause.
- Resolve protocol facts through [knowledge](../knowledge/README.md). Keep
  captures and diagnostics in the ignored locations described by the
  [branch workflow](../docs/guides/BRANCH_WORKFLOW.md).

## Common problems

| Symptom                                       | Next step                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Missing workspace `dist` module               | Run `pnpm build`; direct generators that need EVM require `pnpm --filter @mezo-dev-kit/evm build` first                         |
| Generated output is stale                     | Run its owning generator without `--check`, review the diff, and repeat the drift check                                         |
| Evidence is expired, missing, or incompatible | Follow the owning module's refresh/review procedure; see [evidence](evidence/README.md)                                         |
| Old flat script path is missing               | Use the same basename in its workflow folder or the existing `pnpm` alias                                                       |
| Materializer refuses an occupied directory    | Follow the documented [backup-and-refresh procedure](../docs/guides/CONTRIBUTOR_AGENT_SETUP.md#refresh-after-a-checkout-update) |
| Clean-workspace offline installation fails    | Check that the pinned dependency set is installed and available in the local pnpm store                                         |

## Adding or changing a script

1. Choose the workflow folder. Keep package-specific tooling in its owning
   package and shared helpers in `lib/` when multiple scripts need them.
2. Write TypeScript using the existing toolchain. Resolve repository-owned paths
   from the script location; document how caller-supplied paths are resolved.
3. Document arguments, prerequisites, network use, writes, and a usable command
   in that folder's README. Add a root alias for a recurring contributor task
   when useful; do not duplicate another command's implementation.
4. Update imports, subprocess paths, package commands, relevant module-index
   checks, guides, and skill references when moving an entrypoint. Regenerate
   derived files and refresh affected local skill copies from their owners.
5. Include new tests in their owning runner. The root lint command explicitly
   selects authored workflow folders to keep negative fixtures out of normal
   lint; update that selection if adding a folder. Typechecking and formatting
   already traverse the scripts tree.
6. Run the checks required by [CONTRIBUTING](../CONTRIBUTING.md#verification),
   including `pnpm check` for shared automation/configuration changes and
   `node scripts/checks/validate-markdown-links.ts` for these manuals.

The [coding](../docs/standards/coding.md), [testing](../docs/standards/testing.md),
and [knowledge-management](../docs/standards/knowledge-management.md) standards
own implementation and review rules.
