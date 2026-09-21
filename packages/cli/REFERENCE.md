# CLI API reference

Use `@mezo-dev-kit/cli` to validate project configuration, invoke MDK commands from Node, and build
private distribution artifacts. This reference covers the programmatic API for Node 24+. For
terminal commands and installation, start with the [CLI guide](../../docs/guides/MDK_CLI.md).

A **bundle** lists the SDK and documentation resources available to a project. A **lock** records
the exact guidance files MDK manages. A **recovery journal** records an interrupted file operation.
Parsing these objects validates their shape and relationships; the relevant command performs
filesystem work.

Import from the package root. The CLI has no runtime SDK dependency and supplies no transaction
authorization.

On this page:

- [Validated contracts](#validated-contracts)
- [Command orchestration](#command-orchestration)
- [Distribution tooling](#distribution-tooling)
- [Failures and limits](#failures-and-limits)

## Validated contracts

### `parseConfig`

Returns `ProjectConfig`; validates format, selected domains, one supported discovery root and
reference mode. Domain availability is subsequently checked against a bundle.

**Call:** `parseConfig(value: unknown)`

### `parseBundle`

Returns `ReferenceBundle`; validates metadata, contained resource paths, unique IDs,
dependency/domain resolution and manifest digest. Does not read or verify resource bytes.

**Call:** `parseBundle(value: unknown)`

### `bundleDigest`

Computes SHA-256 over the normalized manifest without its own `id`; object keys are normalized and
array order is significant.

**Call:** `bundleDigest(bundle)`

### `parseLock`

Returns `GuidanceLock`; validates configuration, bundle ID and managed-file inventory. Application
instructions cannot be lock-owned.

**Call:** `parseLock(value: unknown)`

### `parseArtifactSet`

Returns `ArtifactSet`; validates unique package names/tarball paths, declared versions, sizes,
digests and bundle identity. Does not unpack or install packages.

**Call:** `parseArtifactSet(value: unknown)`

### `parseRecoveryJournal`

Returns `RecoveryJournal`; validates format, process identity, bounded base64 before/after data and
allowable managed paths. Does not recover files or establish that a process has exited.

**Call:** `parseRecoveryJournal(value: unknown)`

### Configuration and artifact types

`ProjectConfig` selects `domains`, `skillsDirectory` and `references.mode`. `ReferenceBundle`
describes source input identity, exact SDK build inventories, consumer domains/skills,
application/starter templates, indexed resources, exclusions and an optional pinned HTTPS origin.
`GuidanceLock` records the bundle/configuration and hashes of files MDK manages. `ArtifactSet`
identifies the private tarballs; `RecoveryJournal` describes a pending filesystem operation.

Unknown fields, unsupported formats, unsafe paths and duplicate identities reject. Generated schemas
under `schema/` describe the structural shapes; runtime parsers enforce additional semantic
constraints. Content hashes detect drift; trusted artifact provenance separately establishes origin.

Validate a minimal project configuration before using its fields. This example performs no file
writes:

```ts
import { parseConfig } from "@mezo-dev-kit/cli";
import type { ProjectConfig } from "@mezo-dev-kit/cli";

const input: unknown = {
  formatVersion: 1,
  domains: ["typescript", "foundation"],
  skillsDirectory: ".agents/skills",
  references: { mode: "selected" },
};

const config: ProjectConfig = parseConfig(input);

if (config.references.mode !== "selected") {
  throw new Error("Unexpected configuration");
}
```

`config` has the validated `ProjectConfig` shape. Domain availability is checked later against the
selected bundle.

## Command orchestration

### `runCommand` — invoke a command from Node

`runCommand(args, context)` returns `Promise<CommandResult>` and implements the same argument
validation and filesystem behavior as the installed `mdk` binary. `CommandContext.cwd` is the
explicit application root. Optional `sourceRoot` points to generated bundle assets; `now` controls
diagnostic review comparisons and `fetch` injects reference retrieval. None is an EVM provider or
signer. `CommandResult` contains `exitCode` and `data: unknown`; inspect/narrow the structured
result for the selected command.

Commands that mutate files are `init`, `create`, `sync`, `docs fetch` and `recover`. Their
`--dry-run` path does not write or fetch. Local search/show and diagnostics do not implicitly
download. `sync --locked --check` verifies selected guidance without changing it. Applications own
AGENTS.md and configuration.

Preview initialization in an explicit project directory using a local bundle-assets directory:

```ts
import { runCommand } from "@mezo-dev-kit/cli";
import type { CommandResult } from "@mezo-dev-kit/cli";

export async function previewProject(project: string, assets: string): Promise<CommandResult> {
  return runCommand(["init", "--domains", "typescript", "--dry-run", "--offline"], {
    cwd: project,
    sourceRoot: assets,
  });
}
```

The returned `CommandResult` contains an exit code and command-specific data. `--dry-run --offline`
lets the application inspect the proposed operation without writing files or downloading references.

## Distribution tooling

### `buildReferenceBundle` — generate reference assets

`buildReferenceBundle(input: DistributionInput)` returns `Promise<ReferenceBundle>`. It reads
canonical consumer/module/package inputs and built SDK artifacts from `sourceRoot`, then writes an
empty `outputRoot`. `revision` is a base Git SHA or null for exported source. `remoteBase`
optionally declares a pinned credential-free HTTPS directory. Generation does not renew evidence;
canonical knowledge bytes and skill directories remain unchanged. The pinned pnpm executable
interprets the existing root lockfile to derive starter dependency resolutions. No dependencies are
installed by generation.

### `packPrivateArtifacts` — create private tarballs

`packPrivateArtifacts(sourceRoot, outputRoot)` returns `Promise<ArtifactSet>`. It requires built
SDK/CLI artifacts and a generated CLI bundle, invokes pnpm pack, and writes tarballs plus
`manifest.json` to an empty directory. This function validates pnpm's actual packed-file report
against built files, license and reference docs (plus CLI schemas/assets). Contributor source and
tests are excluded. It performs no publication or dependency installation.

## Failures and limits

`CliError` extends Error with a readonly `code: CliErrorCode` and optional cause. Codes are
`InvalidInput`, `Incompatible`, `Conflict`, `Unavailable`, `Integrity` and `RecoveryRequired`.
Command failures can throw; diagnostic commands can instead return a nonzero
`CommandResult.exitCode` with structured issues. The binary prints JSON and redacts unexpected
internal failures.

Compatibility compares installed target SDK metadata and exact built-file inventories. Equal private
version strings are insufficient. Cached references must match declared sizes/digests. Recovery
preserves subsequent edits and requires a single recovery process; normal project directories are
assumed. Individual atomic replacements do not imply universal multi-file or power-loss atomicity.
File discovery, live protocol evidence and public release approval remain distinct qualifications.
