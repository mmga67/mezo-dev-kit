# Workspace utilities

[Scripts manual](../README.md) · Run from the repository root.

## Local work records

[tasks.ts](tasks.ts) implements the root aliases below. The
[task-management guide](../../docs/guides/TASK_MANAGEMENT.md) owns naming,
required sections, status folders, parent relationships, and acceptance rules.

```sh
pnpm setup:tasks
pnpm task:new describe-a-concrete-outcome
pnpm tasks:list
pnpm check:tasks
```

| Command                      | Arguments and effect                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm setup:tasks`           | Creates ignored task folders and guidance; `--refresh` replaces only local guidance with the tracked template and routing text |
| `pnpm task:new <kebab-name>` | Allocates the next ID and writes a backlog task; optional `--parent TASK-NNN` links to an existing unfinished parent           |
| `pnpm tasks:list`            | Prints tasks grouped by status and reports structural errors                                                                   |
| `pnpm check:tasks`           | Validates local records and guidance; a fresh checkout without tasks passes                                                    |

Fill in the created task's scope and acceptance criteria before moving it to
`tasks/active/`. These records remain ignored and local to the checkout.

## Build-output cleanup

[clean-package-dist.ts](clean-package-dist.ts) accepts exactly one approved
package key and removes only that package's `dist/` directory. Prefer the owning
package's build/clean scripts, which already call this utility where needed:

```sh
pnpm --filter @mezo-dev-kit/core build
# Explicit cleanup of core's disposable output:
node scripts/workspace/clean-package-dist.ts core
```

The source's `packageDirectories` map owns the allowed keys. Unknown keys and
extra arguments fail. This is a file-removing command; it does not clean task
records, source, the dependency store, or arbitrary paths.

## Private distribution artifacts

`pnpm cli` opens the guided console directly from CLI TypeScript source; no
package build is needed to open the menu. It explicitly selects this repository
as the source workspace. Project creation prepares matching artifacts and targets
an external application. **Prepare a portable private kit** builds a directory
whose recipient can run `node start.ts` without a source checkout. See
[guided setup](../../docs/guides/MDK_CLI.md#guided-setup).

[mdk-distribution.ts](mdk-distribution.ts) backs `pnpm cli:bundle [empty-output]`
and `pnpm cli:pack <empty-output>`. It uses the built CLI package to write a
reference bundle or private package archives. Output paths resolve from the
repository root; the destination must be new or empty.

```sh
pnpm build
pnpm cli:bundle
pnpm cli:pack local/private-artifacts
```

The bundle command defaults to `packages/cli/dist/assets`. Packing requires that
bundle plus the built packages and writes archives with a manifest into the
supplied directory. It does not publish them. See the
[CLI guide](../../docs/guides/MDK_CLI.md) for the distribution workflow and current
availability.

## Git setup

`pnpm setup:git` is an inline root-package command. It configures repository-local
hooks and fast-forward defaults. Follow the
[branch workflow](../../docs/guides/BRANCH_WORKFLOW.md#one-time-local-setup),
including its instructions for existing custom hooks.
