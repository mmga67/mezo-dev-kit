# ADR-0022 — Main and feature workflow

- Status: Accepted
- Date: 2026-09-11
- Supersedes: ADR-0013's branch and filtered-publication workflow only.

## Context

A separate private development history required selecting source files for
public snapshots. The resulting divergence made routine integration confusing
and introduced avoidable merge conflicts. The maintainer requested a daily
`feat/next` branch, a GitHub-synchronized canonical `main`, and local ignored
legacy and development records.

## Decision

- Keep `main` and `feat/next` on one publishable history. Retire `dev` after
  preserving its history and working files in local recovery storage.
- Work on `feat/next`; merge completed changes to `main` as whole commits.
  Synchronize upstream changes into the feature before fast-forward promotion.
- Use one shared root ignore policy. Legacy material, individual plans/tasks,
  internal review packets, local diagnostics/recovery and agent state remain
  untracked in the working directory on either branch.
- Validate the staged index and incoming commit history. Local commit/push
  hooks apply these checks to ordinary Git operations; `pnpm check` includes
  index/policy validation. Hooks and pull/merge defaults are installed per clone.
- Preserve ancestry in manual or PR merges. Do not build repeated filtered
  snapshots, merge archived private history, or publish selected file trees.
- The GitHub source/support, license, human review, evidence and package-release
  boundaries remain governed by their existing owners. This decision does not
  publish packages or change protocol support.

## Consequences

Normal `git add -A`, commits, merges and `git push origin main` are sufficient.
Ignored data is local to a checkout, persists across branch switches and needs
separate backup. Feature commits must already be suitable for public history.
Genuine simultaneous source edits still need resolution on `feat/next`.

Local hooks are bypassable and do not establish server-side branch protection.
Small executable shell hook launchers delegate entirely to TypeScript; this is
the Git-required interoperability boundary. No dependency or hosted automation
is introduced.

The [branch workflow guide](../guides/BRANCH_WORKFLOW.md) owns commands,
publication checks, recovery boundaries and local setup.
