# ADR-0027 — Standalone MDK project utility

> Historical decision, consolidated on 2026-09-15 into
> [Standalone project tooling](../manifest#standalone-project-tooling).
> The original text and acceptance scope below are retained for context;
> the manifest and its delegated owners define current policy.

- Status: Accepted product scope; implementation qualification tracked separately
- Date: 2026-09-15
- Accepted by: maintainer direction accepting the utility design and task program
- Extends: [ADR-0008](0008-portable-agent-skill-distribution.md)

## Decision

Maintain `@mezo-dev-kit/cli` in `packages/cli/` as a Node TypeScript tool. Install
it per project as a development dependency. Runtime SDK packages remain separate.
The first distribution is a private packed-artifact pilot; no public registry,
release automation, new external dependency, or writer release is implied.

The application owns its source, package configuration, and `AGENTS.md`.
Initialization creates instructions only when absent; synchronization never
claims ownership of that file. Selected portable consumer skills are copied
unchanged into a tested discovery root. Contributor procedures are excluded.

A generated consumer bundle contains a complete declared reference index and
selected local resources. The CLI supports explicit retrieval of pinned deeper
resources and a complete download of the declared consumer corpus. Coverage
and exclusions remain visible. Canonical records, review dates, support labels,
and package docs retain their authority. Downloads do not renew evidence.

## Contracts

`packages/cli/src/contracts.ts` owns the typed runtime parsers. The JSON Schemas
under `packages/cli/schema/` are generated from those interfaces and describe
their structural boundary; parsers additionally enforce reference resolution,
identity, ownership, and integrity. Generation has a drift check.

Bundle identity is SHA-256 over its normalized manifest without its own `id`.
Package compatibility checks names, versions, and exact built-file inventories
from the target project. Source revision plus input/content hashes distinguish
private snapshots with identical version strings. The package-manager lockfile
resolves dependencies; `mdk.lock.json` records guidance identity and managed files.

Resolve the target explicitly from the invocation directory or `--project`.
Do not silently select another workspace or use the CLI's dependencies as the
application's SDK. The initial discovery locations are `.agents/skills` and
`.claude/skills`; actual host support requires an observed host/version check.

File updates validate contained paths and symlinks, compare recorded ownership
and current hashes, stage verified replacements, and retain recoverable prior
state. Unknown files and local edits are conflicts. Recovery does not claim
universal multi-file atomicity. Dry runs make no filesystem or dependency changes.

Reference downloads require the locked manifest's credential-free HTTPS origin,
bounded resources, and matching digests. Redirects cannot silently switch
origins or versions. Local artifact sources remain available for the private
pilot and offline use. Downloaded references are data, never executable inputs.

## Commands and diagnostics

The [utility guide](../guides/MDK_CLI.md) owns user examples. The implementation
provides init/create, sync/locked/check, doctor, search/show/fetch/all, and
explicit recovery. `--offline` prohibits requests; local search and show do not
implicitly fetch. Mutations support previews, and diagnostics support JSON.

Typed failures distinguish invalid input, incompatibility, file conflicts,
unavailable resources, integrity failures, and required recovery. Diagnostics
do not expose credentials or certify live RPC/protocol state. Check mode fails
when required conditions are unmet and preserves advisory evidence limitations.

## Alternatives and qualification

A global-only CLI would couple independent projects to one tool version. A full
raw repository copy would leak contributor scope and defeat bounded retrieval.
A hosted service or required MCP server adds an unnecessary baseline dependency.
Keeping consumer references as independently authored copies creates drift.

Qualify the private utility through packed installation outside the workspace,
invalid-input and update/recovery tests, complete offline resource coverage,
and actual agent discovery/retrieval in a documented host. Local checks do not
publish packages, reverify protocol facts, or qualify protocol writers.
