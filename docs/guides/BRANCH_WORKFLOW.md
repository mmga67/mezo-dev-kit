# Main and feature development

MDK uses two long-lived branches. `main` is the canonical source synchronized
with GitHub. `feat/next` is the daily working branch and starts from `main`.
Completed feature commits merge into `main` together. Both branches use the
same ignore policy and contain only publishable MDK source history.

[ADR-0022](../decisions/0022-main-and-feature-workflow.md) owns this decision.
It replaces the separate private `dev` branch and filtered-snapshot process.

## Source and local material

| Location                                                                                     | Purpose                                                               | Git policy                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| `packages/`, `scripts/`, `knowledge/`, maintained `docs/`, `agents/`, examples and templates | Reusable MDK implementation, evidence and guidance                    | Commit on `feat/next`; merge to `main` |
| `legacy/`                                                                                    | Predecessor code and reference material                               | Local and ignored                      |
| `tasks/`, `plans/`, `docs/reviews/`                                                          | Individual tasks, plans and internal review packets                   | Local and ignored                      |
| `local/`                                                                                     | Diagnostics, experiments, verification receipts and recovery archives | Local and ignored                      |
| `.mdk/`, `.agents/`, `.codex/`                                                               | Local memory, generated discovery and agent state                     | Local and ignored                      |

The root [`.gitignore`](../../.gitignore) applies on both branches. Ignored
files belong to the working directory, not to a branch: they remain on disk
when switching between `main` and `feat/next`, but are absent from commits,
merges, pushes and fresh clones. A separate clean clone/worktree has no local
reference material. Back up local material separately if it must survive loss
of this checkout.

Root-only rules preserve maintained nested examples. Canonical reviews under
`knowledge/*/review/` and shared memory seeds under `agents/memory/seed/` remain
normal source; they are different owners from private working records.

Git ignore rules do not remove already tracked files or erase history. Never
commit private material on `feat/next` with the intention of filtering it at
merge time. Do not use force-add, `assume-unchanged`, `skip-worktree`, custom
merge drivers, or branch-specific ignore files as a privacy mechanism.

## One-time local setup

In an existing checkout, inspect `git status` and preserve unfinished changes
before switching branches. For a fresh clone:

```sh
git clone https://github.com/mmga67/mezo-dev-kit.git
cd mezo-dev-kit
git switch -c feat/next main
pnpm install --frozen-lockfile
pnpm setup:git
```

`pnpm setup:git` installs repository-local commit/push hooks through
`core.hooksPath`, configures pulls to fast-forward only, and makes merges into
`main` fast-forward only by default. It updates local Git configuration, not
global configuration. If you already use a custom hooks path, reconcile that
setup before replacing it. Each clone needs this setup once.

The hooks use small POSIX shell launchers because Git requires executable hook
entrypoints; all validation is TypeScript under `scripts/`. This is a bounded
Git interoperability exception under the coding standard. Node must be on PATH.

Install contributor discovery using the
[agent setup guide](CONTRIBUTOR_AGENT_SETUP.md). Write legacy imports and
private task records directly into their ignored locations.

## Daily work

```sh
git switch feat/next
git status --short
# Edit MDK source and local working records.
git add -A
git diff --cached --stat
git commit -m "Describe the completed change"
```

Normal staging includes MDK changes and excludes the local roots. The commit
hook rejects a private path even if it was force-added, and checks the staged
ignore policy. `pnpm check:source` runs that check explicitly and is also part
of `pnpm check`. Review staged content as usual: a path check cannot identify
private information copied into an otherwise public source file.

Keep unfinished feature work on `feat/next` until the branch is ready as a
whole. Use ignored `local/` for scratch experiments that are not intended as
source. A feature branch is not a private archive.

## Synchronize with GitHub

With committed source changes and a clean tracked worktree:

```sh
git fetch origin
git switch main
git merge --ff-only origin/main
git switch feat/next
git merge main
```

Resolve any genuine overlapping source edits on `feat/next`, then verify the
combined result. This keeps `main` as an ancestor of the feature and makes the
later promotion a fast-forward. Shared ancestry removes the previous snapshot
divergence; concurrent edits to the same source can still require resolution.
Regenerate affected outputs from their canonical inputs after resolving those
inputs. Refresh local skills after canonical skills change.

## Promote the complete feature

Synchronize as above, finish and commit the intended source changes, then:

```sh
pnpm check
pnpm check:source --base main
git switch main
git merge --ff-only feat/next
git push origin main
git switch feat/next
```

Run any additional evidence/domain checks required by the change. Maintainer
review and protocol release gates still apply. A PR, when used, goes from
`feat/next` to `main` and preserves commit ancestry; avoid squash/rebase merges
for this long-lived pair. After a GitHub merge, fetch and merge the resulting
`main` into `feat/next` before continuing.

The history check examines every incoming commit, including a private file
added and deleted before the final tree. The push hook repeats that check
against the actual remote tip and refuses a non-fast-forward update. Missing
remote objects require a fetch before validation. A new remote ref has no
trusted baseline and is checked from its root; historical private/discovery
files can therefore block publishing a new branch even when updating the
existing `main` is valid. The ordinary publication path is `git push origin main`.

If GitHub moves meanwhile, fetch and repeat synchronization and verification.
Do not force-push to bypass divergence. If private data entered an unpublished
feature commit, preserve it locally and repair that unpublished history before
promotion; a later deletion is insufficient. Never merge an archived private
branch or push recovery/stash refs, `--all`, or `--mirror`.

Local hooks are safeguards, not server enforcement, and can be bypassed by a
different client or checkout. GitHub branch protection/CI is a separate setup;
the maintainer remains responsible for the reviewed source and history.

## Git behavior references

- [Git ignore rules](https://git-scm.com/docs/gitignore): untracked-file rules do
  not affect files already tracked.
- [Git merge](https://git-scm.com/docs/git-merge): fast-forward promotion retains
  ancestry and refuses divergent history with `--ff-only`.
- [Git bundles](https://git-scm.com/docs/git-bundle): offline recovery archives
  preserve commits and refs without merging their history into the public branch.
