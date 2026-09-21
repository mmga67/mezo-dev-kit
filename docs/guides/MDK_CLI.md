# MDK standalone project utility

`@mezo-dev-kit/cli` gives an independent TypeScript project its own MDK agent
setup and matching local references. Install it as a **project development
dependency**. Global installation is optional; each project should pin its own
CLI and runtime SDK artifacts.

## Start here

- **New project:** [build the private artifacts](#build-private-artifacts),
  then [create and verify a TypeScript starter](#create-a-standalone-typescript-project).
- **Existing application:** follow [initialization](#initialize-an-existing-application).
- **Already set up:** [find a reference](#find-a-deeper-reference),
  [prepare for offline work](#prepare-for-offline-work), or
  [update guidance](#add-skills-and-update-guidance).

The starter's first run uses an offline fixture. Setup commands and their
expected results appear in the selected workflow below; the ownership and
reference sections explain the files it creates.

## Availability

The CLI is implemented as a **private packed-artifact pilot** under
[`packages/cli/`](../../packages/cli/README.md). It is not published to a registry.
Use the private workflow below. Registry installation commands with
`0.0.0-private` do not identify a public release.

The starter uses Node 24+, pnpm 11.0.8, TypeScript and Vitest. See
[verification and boundaries](#verification-and-boundaries) for artifact and
agent-host checks; their recorded scope is separate from protocol support.

## Project ownership

```text
my-mezo-project/
  package.json                 SDK packages and local CLI dev dependency
  pnpm-workspace.yaml          private artifact dependency overrides
  pnpm-lock.yaml               dependency resolution
  AGENTS.md                    application-owned instructions
  mdk.config.json              application-owned guidance selection
  mdk.lock.json                bundle identity and managed-file hashes
  .agents/skills/mdk-*/         selected unchanged consumer skills
  .mdk/reference/bundle.json   complete declared consumer reference index
  .mdk/reference/references/   selected or explicitly cached documents
  .mdk/artifacts/              private pilot package tarballs
  src/                        application-owned TypeScript
  test/                       application-owned tests
```

Initialization creates `AGENTS.md` only when absent. Updates preserve it and
application source. MDK manages files identified by its guidance lock; unrelated
skills and unknown colliding files retain their ownership.

Commit source, instructions, configuration, both lockfiles and the private
artifact files needed by the pilot. Generated skills/references may be committed
or explicitly ignored and restored with `mdk sync --locked`; the CLI does not
edit existing ignore policy. The starter commits them by default. Do not share
`.mdk/operation/`, which contains temporary recovery state.

## How the agent gets knowledge

1. Application `AGENTS.md` routes Mezo work to selected consumer skills.
2. Skills describe public SDK usage and matching local reference retrieval.
3. The complete index identifies the declared consumer corpus, including
   resources not yet copied into the project.
4. Search returns stable IDs, metadata, availability and local paths. `show`
   reads verified cached content. Explicit `fetch` copies a resource and its
   declared supporting resources from the matching bundle.

The private CLI artifact carries the full corpus locally. Initialization copies
the selected subset. On-demand copying and `fetch --all --offline` need no
hosted service, MCP server, vector database or MDK checkout.

The corpus includes public package API references, unchanged indexed canonical
knowledge records, and this consumer guide. Metadata retains source paths and
hashes, logical module/resource/record identities, review dates and limitations.
Relative API-document links resolve to included resources; links outside the
corpus become explicit source pointers. Raw source/evidence artifacts,
maintenance procedures, schemas, fixtures, review records and derived duplicates
have indexed exclusions. **Complete** means this declared corpus.

The index lets the agent find the small set needed for a task. It does not load
all documents into context at once. Downloading documents never renews evidence
or establishes support for a protocol writer.

## Build private artifacts

From a prepared MDK checkout, using its pinned toolchain:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm cli:bundle
MDK_ARTIFACTS="$(mktemp -d)"
pnpm cli:pack "$MDK_ARTIFACTS"
```

`cli:bundle` creates `packages/cli/dist/assets` from canonical inputs and built
SDK packages. Its output must be empty; `pnpm build` clears package outputs
before regeneration. `cli:pack` requires an empty output directory and packs
the CLI plus all SDK packages using pnpm. `manifest.json` records tarball names,
versions, sizes, hashes and the matching bundle identity. Packing verifies the
actual file report: SDK artifacts include built code/types and license/reference
docs; CLI artifacts additionally include their generated assets and schemas.

A base Git revision is recorded when available. Exported source may have no Git
revision. Input hashes identify the actual snapshot, including uncommitted
source; a base revision alone does not identify those bytes. These commands
build and pack local files. They do not publish packages.

## Create a standalone TypeScript project

Continue from MDK with the artifact directory above. Choose a new directory
whose parent exists. The source checkout uses the built Node entrypoint because
workspace installation can precede generation of the CLI executable. Installed
consumer projects use `pnpm exec mdk` normally:

```sh
node packages/cli/dist/bin.js create /tmp/my-mezo-project --template typescript \
  --artifacts "$MDK_ARTIFACTS/manifest.json" --dry-run
node packages/cli/dist/bin.js create /tmp/my-mezo-project --template typescript \
  --artifacts "$MDK_ARTIFACTS/manifest.json"
cd /tmp/my-mezo-project
pnpm install
pnpm exec mdk init --domains typescript,foundation --offline
pnpm start
pnpm check
pnpm exec mdk doctor --json
```

Creation verifies and copies tarballs into the project. Local dependency
specifications and pnpm overrides keep transitive MDK dependencies on those
same tarballs. Generated tooling overrides preserve the root lockfile's exact
external dependency resolutions. Creation writes source and initial instructions; dependency
installation and `init` are explicit next steps. The generated application then
works independently of the original checkout.

`pnpm start` runs a deterministic read-only fixture. `src/network.ts` uses public
Chains, Contracts and Core APIs to check an injected provider's chain identity.
The fixture makes no network request. Replace its transport when adding live
reads. `pnpm check` typechecks, tests matching/mismatched chains and checks locked
guidance. Node runs the TypeScript starter directly; no build step is required.
Creation accepts new or empty directories and refuses occupied targets.

## Initialize an existing application

Install the CLI tarball named in the trusted artifact manifest as a local
development dependency. The CLI has no runtime SDK dependency. If the application
already uses SDK packages, install the matching complete artifact set first;
`init` does not change dependency configuration.

For a private application without an artifact mapping, create a temporary
starter as above. Copy its `.mdk/artifacts/` directory and merge its `file:`
dependency entries and `pnpm-workspace.yaml` overrides into application-owned
configuration before `pnpm install`. Preserve existing dependencies and workspace
settings. The complete mapping prevents unpublished transitive dependencies
from falling through to a registry.

Then run from the application root:

```sh
pnpm exec mdk init --domains typescript,foundation --dry-run
pnpm exec mdk init --domains typescript,foundation
pnpm exec mdk doctor
```

For guidance without foundation runtime packages, choose `--domains typescript`.
Available IDs are in the bundle's `domains` array: `typescript`, `applications`,
`foundation`, SDK package names, and `knowledge-<module-id-with-hyphens>`.

For an existing `AGENTS.md`, retain its conventions and add this routing section:

```markdown
## MDK guidance

For Mezo work, load the relevant consumer skill from the discovery root in
mdk.config.json. Find matching references with pnpm exec mdk docs search.
Read cached material with docs show; explicitly fetch indexed resources when
needed. Keep application rules here and use installed public MDK exports.
```

Use `--project <directory>` to target a workspace package. Commands use that
exact root, without silently selecting its parent workspace. Direct SDK
dependencies must resolve from that project's `node_modules`; transitive pnpm
layouts resolve from each installed package.

## Commands and options

| Command                                                               | Behavior                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `mdk init`                                                            | Install selected guidance; bootstrap missing instructions/configuration  |
| `mdk create <directory> --template typescript --artifacts <manifest>` | Create starter and verified artifact mapping                             |
| `mdk sync`                                                            | Update compatible managed guidance and its lock                          |
| `mdk sync --locked`                                                   | Restore the recorded bundle and configuration                            |
| `mdk sync --check`                                                    | Fail on selected guidance drift without writing                          |
| `mdk doctor`                                                          | Check SDK compatibility and file integrity; report review deadlines      |
| `mdk docs search "<query>"`                                           | Search IDs, titles, API text terms, record IDs, domains and source paths |
| `mdk docs show "<id>"`                                                | Read verified cached content with metadata                               |
| `mdk docs fetch "<id>"`                                               | Retrieve pinned resource and declared dependencies                       |
| `mdk docs fetch --all`                                                | Verify/cache every declared consumer resource                            |
| `mdk recover`                                                         | Roll back interrupted work without replacing later edits                 |

Common options: `--project`, `--bundle <asset-directory>`, `--offline`, `--json`.
Initialization accepts `--domains typescript,foundation` and `--skills-dir
.agents/skills` or `.claude/skills`. Mutations accept `--dry-run`. Previews never
install dependencies, fetch remote content or write files; sync previews require
local source assets for uncached selected resources.

JSON success is `{ "ok": true, "data": ... }`. Failed checks have `ok: false`
and a nonzero exit code. Fatal errors use `{ "ok": false, "error": { "code":
"...", "message": "..." } }` on stderr. Exit codes: 0 success, 1 failed checks
or operations, 2 invalid input. Typed errors distinguish incompatibility,
conflict, unavailable data, integrity failure and recovery required. Evidence
review warnings are advisory.

## Find a deeper reference

```sh
pnpm exec mdk docs search "borrowing" --json
pnpm exec mdk docs fetch "api:musd-borrowing" --dry-run
pnpm exec mdk docs fetch "api:musd-borrowing" --offline
pnpm exec mdk docs show "api:musd-borrowing" --offline
```

Search reports `cached`, `indexed` or `corrupt` availability. `show` reports a
missing local resource until fetched. Its returned path can be opened directly.
Exclusions are searchable and explain unavailable source artifacts.

An agent task can say:

> Follow our AGENTS.md, load the foundation consumer skill, inspect api:core,
> and add a read-only integration using installed public exports. Fetch extra
> pinned references only as needed and run the application checks.

## Prepare for offline work

```sh
pnpm exec mdk docs fetch --all --dry-run --json
pnpm exec mdk docs fetch --all --offline --json
pnpm exec mdk doctor --offline --json
```

Results list planned/verified/missing IDs, expected bytes and `complete`. Partial
retrieval retains verified files, reports `complete: false` and fails. Retrying
resumes from verified cache entries. Dry runs never claim completion. Corrupt
cached files require explicit resolution and are not silently overwritten.

The pilot copies from the installed CLI. A distribution may declare a pinned
HTTPS origin for missing assets; requests reject redirects, verify sizes/hashes
and use a timeout. `--offline` forbids requests. This pilot configures no hosted
origin. Reference caching is separate from dependency caching: offline installs
also require a prepared pnpm store. Offline docs supply no live chain observations.

## Add skills and update guidance

Edit the application-owned `mdk.config.json`:

```json
{
  "formatVersion": 1,
  "domains": ["typescript", "foundation"],
  "skillsDirectory": ".agents/skills",
  "references": { "mode": "selected" }
}
```

Add a cataloged domain or choose `references.mode: "all"` to restore the full
corpus on sync. A domain with SDK requirements requires those artifacts first.
Only consumer skills matching selected domains are copied.

```sh
pnpm exec mdk sync --dry-run
pnpm exec mdk sync
pnpm exec mdk doctor
pnpm check
```

For an SDK upgrade, install a qualified artifact set and matching CLI first,
then run this sequence. Versions sharing `0.0.0-private` must also match package
metadata and exact built-file inventories. `sync` does not choose dependency
upgrades. Unmatched artifacts fail before writes.

Restore a clone with matching dependency artifacts and both locks:

```sh
pnpm install --frozen-lockfile
pnpm exec mdk sync --locked --offline
pnpm exec mdk sync --locked --check --offline
```

Retain the matching CLI artifact. `--bundle` can select another retained asset
directory explicitly. There is no implicit fallback to main or a newer website.

## Conflicts and recovery

Modified managed skills and colliding unknown files are conflicts. Preserve
useful edits in an application-owned location before resolving the collision.
Missing managed files can be restored from the same bundle. During upgrades,
verified stale on-demand cache files are identified through the previous locked
index and retired. Cached files with local edits remain conflicts; unchanged
cached references can become selected managed resources without a collision.

Updates publish a recovery journal before changing files. Interrupted updates
block later operations and retain before/after bytes at
`.mdk/operation/journal.json`. After the owning process exits:

```sh
pnpm exec mdk recover --dry-run
pnpm exec mdk recover
pnpm exec mdk sync --locked --offline
```

Recovery refuses files matching neither recorded state, preserving later edits.
Run one recovery process per project. Individual replacements are atomic; this
is not a universal multi-file or power-loss atomicity guarantee. Rollback may
leave empty generated directories.

## Verification and boundaries

After building the workspace, `node scripts/tests/test-cli-built-package.ts`
checks external packed installation, unchanged canonical records/skills,
deterministic generation, starter checks, deeper retrieval, full offline
coverage and locked restoration. Vitest covers malformed inputs, conflicts,
compatibility, recovery, path containment and download failure handling.

The recorded host evaluation used Codex 0.154.0-alpha.6.1: both generated
consumer skills were reported enabled at repository scope through the local
app-server catalog, and the session retrieved the matching Core reference and
exercised the installed starter. This observation is limited to that host/version.

The filesystem boundary assumes a normal application directory; hostile
concurrent replacement of filesystem ancestors is outside pilot qualification.
Further host/version evaluations and public release approval remain separate. No writer
support, deployment freshness or transaction authorization is inferred.

See [external applications](EXTERNAL_APPLICATIONS.md),
[Standalone project tooling](../manifest#standalone-project-tooling) and the
[consumer instructions template](../../agents/consumer/APP_AGENTS.template.md).
