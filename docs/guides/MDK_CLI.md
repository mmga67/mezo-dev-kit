# Use MDK in your application

<a id="mdk-standalone-project-utility"></a>

Use the MDK console to create a TypeScript application or add Mezo packages to
an existing one. It installs matching packages and local documentation together,
so you can look up the APIs available in your project. If you work with a coding
agent, MDK also supplies skills that guide it through the features you choose.

You can use the packages and documentation without an agent. Start with the
console, try the sample application, then add the capabilities your project needs.
For example, the borrowing capability combines its SDK package, documentation
and optional agent guidance in one selection.

## Start here

| Your starting point                | What to do                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create a new application           | [Open the guided console](#guided-setup) in an MDK checkout.                                                                                                                                 |
| Add MDK to an existing application | [Select your project in the console](#use-mdk-in-an-existing-application).                                                                                                                   |
| You received a prepared MDK kit    | [Start the included console](#start-from-a-portable-private-kit); no source checkout is needed.                                                                                              |
| Your project already has MDK       | Run `pnpm mdk` in that project to [add a capability](#add-a-capability-set-or-skill), [read documentation](#find-a-deeper-reference), or [update guidance](#add-skills-and-update-guidance). |

## Availability

MDK packages are not published to npm yet. Use an MDK checkout or a prepared
private kit containing the matching packages. The console handles their
preparation and installation; you do not need to build a kit manually to start.

Use Node.js 24+ and pnpm 11.0.8. The starter uses TypeScript and Vitest and runs
with sample data, without an RPC connection or wallet. Installing MDK does not
verify live protocol state or qualify a transaction workflow for release;
check the selected package's scope before integrating it.

## Guided setup

From an MDK checkout with Node and pnpm installed, run:

```sh
pnpm install --frozen-lockfile
pnpm cli
```

1. Choose **Create a project**.
2. Enter a new directory outside the MDK checkout, such as `../my-mezo-app`.
3. Review the setup plan and apply it. The console prepares matching packages,
   creates the application, installs dependencies and checks the result.
   This can take a few minutes.
4. Once setup passes, choose **Run the local demo**. It uses sample data and
   makes no live RPC requests. Open the displayed project folder in your editor
   when you are ready to change the application.

From the new application's directory, reopen its console with:

```sh
pnpm mdk
```

You now have an independent project with the **App essentials** set: EVM value
helpers, network identities, contract lookup and Core reads, plus documentation
and agent skills. Its optional project memory starts empty. Each application
uses its own installed CLI; no global installation or PATH change is needed.

Use arrow keys and Enter, or enter a menu number. Escape goes back where a Back
action is available; Ctrl+C exits. Use `pnpm cli --plain` for numbered prompts
without menu redrawing.

If installation fails, **Retry this step** repeats it while keeping the project.
**Finish project setup** resumes a created starter. Once documentation and skills
are installed, use **Finish or recheck project setup**. If dependencies are not installed yet, select
the project from the original console. A new session reruns installation and
checks. Completed package-manager changes remain in place. For an interrupted
documentation or skill update, use [Review recovery](#conflicts-and-recovery).

### Start from a portable private kit

If you received a prepared kit, keep its complete directory together. With Node
and the pinned pnpm installed, run this inside the kit:

```sh
node start.ts
```

The kit contains a prebuilt console and matching packages and documentation.
Use its menu to create an application or select an existing one; you need no MDK
source checkout or build. The resulting application keeps its dependencies and
CLI in its own project.

`node start.ts --plain` selects numbered prompts. Use `--offline` only when the
required dependencies are already in the pnpm store; bundled MDK files alone
do not supply every dependency. To prepare a kit for someone else, follow
[Build private artifacts](#build-private-artifacts).

<a id="select-an-existing-application"></a>
<a id="initialize-an-existing-application"></a>

## Use MDK in an existing application

Open `pnpm cli` from MDK, or `node start.ts` from a prepared kit. Choose
**Choose an existing project** and enter your application's directory.

The console calls its documentation and agent skills **guidance**. If your
application has none installed, choose **Set up guidance here**, then
**App essentials**.
The console installs matching packages and guidance using its retained kit or
an explicitly supplied private manifest. A manifest is the kit's list of package
files and the identities used to check them. A TypeScript-guidance-only option
is available when you do not need the SDK packages.

For an application that already uses MDK, the console uses its installed
references when available. Choose **Add capabilities or skills** to review and
add a feature. Your source, existing `AGENTS.md` and unrelated dependency
settings remain yours. A project inside a larger pnpm workspace needs its own
dependency integration; automatic addition does not edit the parent workspace.

Use [manual initialization](#initialize-without-the-console) if you need explicit
commands for a script or an existing installation. **Add reference domains
(advanced)** changes only documentation and skills, and requires the matching
SDKs to be installed already. A domain is a category used by MDK's configuration;
ordinary capability additions select the required categories for you.

## Add a capability set or skill

A capability set groups the packages, documentation and agent skills for a task,
such as borrowing or swaps. In your application's `pnpm mdk` menu, choose
**Add capabilities or skills**. You can inspect the selection before applying it.

To do the same from the command line, run these in your application:

```sh
pnpm exec mdk sets
pnpm exec mdk add borrowing --dry-run
pnpm exec mdk add borrowing
pnpm check
```

`sets` shows the choices available in your installed version. The preview shows
what borrowing will add without writing files, installing packages or making
network requests. Applying the addition installs missing packages and makes their
matching documentation and skills available. Run your application's checks to
verify the result; the generated starter provides `pnpm check`.

Sets include `base`, `memory`, `tokens`, `prices`, `borrowing`, `savings`, `lending`,
`vaults`, `liquidity`, `swaps`, `incentives`, `bridges`, `redemptions`,
`institutional-debt`, `history`, `frontend` and `economy`. Use `mdk sets` for the
installed catalog. The optional `economy` set adds explanations and selected
reviews for understanding Mezo across domains; it adds no runtime packages.
Its evidence keeps its original dates and qualifications.

If you want one agent skill rather than a complete set:

```sh
pnpm exec mdk skills
pnpm exec mdk add --skill mdk-memory-application
```

An addition can update `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
and `node_modules`. It preserves unrelated settings, source, instructions,
custom skills and memory. Adding an already complete set is safe to repeat.
It does not remove capabilities or choose SDK upgrades.

Run one addition at a time. If package installation fails, resolve the reported
cause and repeat the same `add`; completed installation work is retained and
`mdk recover` does not undo it. The configuration selection is recorded only
after compatible packages are installed. If guidance then conflicts with local
files, resolve the conflict and retry or run `mdk sync`. An offline addition also
needs the application's other dependencies cached in pnpm.

## Find a deeper reference

Search finds a document in the versioned collection, or **bundle**, shipped with
your CLI. Some documents are already copied into the project; `fetch` copies another one from that local
collection, and `show` displays it. You can use these commands yourself or let an
agent use them.

For example, look up the borrowing API from your application:

```sh
pnpm exec mdk docs search "borrowing" --offline
```

The results include document IDs. Choose `api:musd-borrowing` for the SDK reference,
then make it available and open it:

```sh
pnpm exec mdk docs fetch "api:musd-borrowing" --offline
pnpm exec mdk docs show "api:musd-borrowing" --offline
```

The displayed reference explains the borrowing methods, inputs and limits for
your installed package. Its returned local path can also be opened in an editor.
`fetch --dry-run` previews which files would be copied.

| Availability in a search result | Your next step                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cached`                        | Read it with `docs show`.                                                                       |
| `indexed`                       | Copy it with `docs fetch`, then read it.                                                        |
| `corrupt`                       | Resolve the changed or damaged cached file before retrying; MDK will not silently overwrite it. |

The collection includes public API references, selected guides and indexed Mezo
records. Search also reports excluded resources, such as raw evidence, with an
explanation. A source pointer outside this collection identifies where the
original lives; it is not a document that `fetch` can supply. Downloading or
copying a record does not update the observation it describes.

## Prepare for offline work

Your installed CLI already carries the declared documentation collection.
Initialization copies the subset for your selected capabilities. To make every
included document available in the project before working offline, run:

```sh
pnpm exec mdk docs fetch --all --dry-run
pnpm exec mdk docs fetch --all --offline
pnpm exec mdk doctor --offline
```

The preview lists the planned files and size. The applied command reports whether
it completed. A partial retrieval keeps verified files and fails with
`complete: false`; resolve the missing or damaged resource and retry. Retrying
reuses verified files. A preview does not establish completion.

Offline documentation and offline dependency installation are separate. Installing
packages also needs a prepared pnpm store. `--offline` forbids reference requests
and, for package additions, applies to installation too. Offline documents supply
no live chain observations. This distribution has no hosted document origin;
the [download contract](#commands-and-options) describes the optional remote mode.

<a id="project-ownership"></a>

## What MDK adds to your project

Your application owns its code and decisions. MDK manages selected documentation
and skills, recording their identities so updates can detect local changes.

| Files                                                                    | What to do with them                                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/`, `test/`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Develop your application and commit its source and dependency settings.                                                             |
| `AGENTS.md`                                                              | Keep your application's agent instructions here when using an agent. MDK creates it only if absent and preserves it during updates. |
| `mdk.config.json`                                                        | Select the documentation and skills your application needs. Capability additions normally update this for you.                      |
| `mdk.lock.json`                                                          | Commit the recorded documentation version and managed-file hashes alongside your configuration.                                     |
| `.agents/skills/`, `.mdk/reference/`                                     | MDK-managed skills and local documents. Preserve personal work elsewhere before replacing a modified managed file.                  |
| `.mdk/artifacts/`                                                        | Retain and commit the private package files and manifest needed to reproduce setup and add capabilities later.                      |
| `.mdk/memory/`, `docs/mdk-memory/`                                       | Optional local and reviewed shared project memory; follow the [memory guide](APPLICATION_MEMORY.md) for what to retain.             |

You can commit the generated skills and references or ignore them explicitly and
restore them with `mdk sync --locked`. The starter includes them for version
control; MDK does not change an existing application's ignore policy. Do not
share `.mdk/operation/`, which holds temporary update-recovery state.

## Add skills and update guidance

Use [capability additions](#add-a-capability-set-or-skill) for a new feature or skill.
Use `sync` when your installed packages are already compatible and you want to
update MDK-managed documentation and skills. It preserves your application
instructions and source.

Preview, apply and check a guidance update from your application:

```sh
pnpm exec mdk sync --dry-run
pnpm exec mdk sync
pnpm exec mdk doctor
pnpm check
```

The preview shows the proposed changes. `doctor` checks that the installed SDKs,
configuration and managed files agree; it also reports evidence review deadlines.
Those warnings do not certify current protocol state. Use your application's
usual checks if it does not define `pnpm check`.

For an SDK upgrade, first install a matching, qualified set of SDK and CLI
artifacts, then run the sequence above. `sync` does not choose dependency upgrades.
Private packages can share `0.0.0-private` while containing different builds,
so compatibility includes exact files and metadata. A mismatch stops the update
before guidance writes.

### Change the guidance selection directly

For advanced selection, edit the application-owned `mdk.config.json`. This is an
example; retain your project's existing selections and discovery directory:

```json
{
  "formatVersion": 1,
  "domains": ["typescript", "foundation"],
  "skillsDirectory": ".agents/skills",
  "references": { "mode": "selected" }
}
```

Add a cataloged domain or use `references.mode: "all"` to copy the full declared
collection on sync. Domains with SDK requirements need matching packages installed
first. Only consumer skills matching the selected domains are copied. The
bundle's `domains` list contains the exact available IDs; capability sets are
the simpler way to select these together.

### Restore a cloned project

Keep the matching package artifacts, configuration and both lockfiles. From the
cloned application, run:

```sh
pnpm install --frozen-lockfile
pnpm exec mdk sync --locked --offline
pnpm exec mdk sync --locked --check --offline
```

This restores the recorded guidance and then checks it. Retain the matching CLI
artifact; there is no automatic fallback to the latest website or repository.
`--bundle` selects another retained documentation directory explicitly.

## Conflicts and recovery

A conflict means MDK found a changed managed file or another file occupying its
intended path. Preserve useful edits in an application-owned location before
resolving the collision. Missing managed files can be restored from the same
bundle. During an upgrade, unchanged cached documents may be retired or become
selected managed files; cached documents with local edits remain conflicts.

If a guidance update was interrupted, choose **Review recovery** in the console.
Wait for the original process to exit, then preview the recovery before applying
it. The equivalent commands are:

```sh
pnpm exec mdk recover --dry-run
pnpm exec mdk recover
pnpm exec mdk sync --locked --offline
```

MDK records the update's before-and-after file contents in
`.mdk/operation/journal.json` before making changes. Recovery refuses to replace
a file that matches neither version, preserving edits made afterward. Run one
recovery process per project. Recovery covers guidance files, not completed
package installations; the [API reference](../../packages/cli/REFERENCE.md#failures-and-limits)
explains the filesystem limits.

## Work with a coding agent

Agent assistance is optional. Your application's `AGENTS.md` owns its conventions;
MDK's installed consumer skills describe how to use the selected packages and
references. Contributor maintenance skills belong in MDK itself.

For an existing `AGENTS.md`, keep its rules and add a short route when needed:

```markdown
## MDK guidance

For Mezo work, load the relevant consumer skill from the discovery root in
mdk.config.json. Find matching references with pnpm exec mdk docs search.
Read cached material with docs show; explicitly fetch indexed resources when
needed. Keep application rules here and use installed public MDK exports.
```

### How the agent gets knowledge

The installed skills point the agent to the matching
[documentation bundle](#find-a-deeper-reference). Its index at
`.mdk/reference/bundle.json` lists the included documents and package identities,
even those not yet copied into the project. The agent can search, fetch and read
just what its task needs without loading the whole collection.

Documents retain source paths, identities, evidence dates and limits. Relative
links work between included resources; other links identify sources outside the
collection. Raw source and evidence, contributor procedures, schemas, fixtures
and most review or generated documents are excluded. Selected explanations and
conflict reviews are included explicitly. Literal code examples are preserved.
A complete download means this declared collection, not all MDK source or all
Mezo knowledge. No external memory service, MCP server or hosted search is needed.

For example, ask your agent:

> Follow our application instructions, find the Core SDK reference, and add a
> read-only integration using the installed packages. Read further references
> as needed and run the application checks.

### Adopt communication defaults

New applications receive concise communication and completion-report defaults
in the generated `AGENTS.md`. Existing applications keep their instructions:
`sync` updates managed guidance but never merges these defaults into that file.
After installing matching updated artifacts, review your application's rules
and add or adapt the following only where equivalent guidance is missing:

```markdown
## Communication and reporting

Lead with the outcome. Start tool work with one short action update; subsequent
updates report new findings and next steps at the host's required cadence.
Ask only for material missing inputs or decisions, with a recommendation.
Continue independent work within existing authorization.

Keep routine closeouts brief (usually 80–150 words, less for small tasks).
State delivered behavior, actual checks and outcomes, and material gaps or
remaining decisions. Combine docs/knowledge/memory decisions in one sentence.
Link useful detail; omit empty optional fields and repeated plans or logs.
The final answer must stand alone. Distinguish implementation, verification,
review and release; never hide failed or unavailable required checks.
Research reports lead with findings, sources, recommendations and uncertainty.
User-requested depth and completeness take precedence over length targets.
```

Review the edited file with the application's usual checks. Instruction delivery
does not prove agent compliance or token savings; compare representative tasks
in fresh sessions if measuring those outcomes.

## Current evidence reports

Use `mdk evidence capabilities`, `refresh`, `inspect` and `recover` without project
initialization. The [junior evidence walkthrough](EVIDENCE_REFRESH.md) explains explicit
network/provider selection, policy, JSON reports, cancellation and frontend integration.
These commands collect read-only observations and preserve failures; they never
modify canonical knowledge or renew evidence review dates.

## Commands and options

Use this section for exact terminal commands after choosing a workflow above.
Run installed commands as `pnpm exec mdk ...` from the application directory.
Use `--json` when another program needs the result; ordinary interactive use
can keep the human-readable output.

| Command                                                               | Behavior                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `mdk init`                                                            | Install selected guidance; bootstrap missing instructions/configuration  |
| `mdk init --set base`                                                 | Initialize base guidance for already installed foundation packages       |
| `mdk sets` / `mdk skills`                                             | List available selections and current selection status                   |
| `mdk add <set>`                                                       | Install matching packages, skills and references together                |
| `mdk add --skill <name>`                                              | Add one portable skill and its domain requirements                       |
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
| `mdk memory search "<query>"` / `show <id>`                           | Search metadata or read one application memory entry                     |
| `mdk memory save --file <entry.json>` / `check`                       | Save or validate application-owned memory                                |

Common options: `--project`, `--bundle <asset-directory>`, `--offline`, `--json`.
Initialization accepts `--set <id>` or `--domains typescript,foundation`, and `--skills-dir
.agents/skills` or `.claude/skills`. Mutations accept `--dry-run`. Previews never
install dependencies, fetch remote content or write files; sync previews require
local source assets for uncached selected resources.

The optional download mode uses a declared, pinned HTTPS origin. Requests reject
redirects, check sizes and hashes, and use a timeout. The current private kit has
no hosted origin; `--offline` forbids all reference requests.

JSON success is `{ "ok": true, "data": ... }`. Failed checks have `ok: false`
and a nonzero exit code. Fatal errors use `{ "ok": false, "error": { "code":
"...", "message": "..." } }` on stderr. Exit codes: 0 success, 1 failed checks
or operations, 2 invalid input. Typed errors distinguish incompatibility,
conflict, unavailable data, integrity failure and recovery required. Evidence
review warnings are advisory.

Memory defaults to `--scope local`; `--scope shared` explicitly selects reviewed
team context. Search also accepts `--domain`. See the
[application memory guide](APPLICATION_MEMORY.md) for storage and lifecycle.

<a id="scripts-and-ai-agents"></a>

### Noninteractive commands

Menus open only in an interactive terminal outside CI. Use the explicit commands
above with `--json` for automation. No-argument noninteractive invocation prints
help; explicit `mdk console` fails promptly without a terminal. `--no-input`
disables the implicit menu. Human terminal output summarizes results, while JSON
results and exit codes retain the command contract. `mdk console --help` lists
console options, including `--project`, `--bundle`, and `--artifacts` for a
separately supplied private artifact set.

## Manual setup

These commands are an alternative to the console. Use them for automation or
when managing a prepared artifact set directly. The console already performs
the corresponding preparation and checks during guided setup.

<a id="create-a-standalone-typescript-project"></a>

### Create a project without the console

From MDK, first [build a private artifact set](#build-private-artifacts). Keep
`MDK_ARTIFACTS` from that procedure available in the same shell. Choose a new directory
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
pnpm exec mdk init --set base --offline
pnpm start
pnpm check
pnpm exec mdk doctor --json
```

Creation verifies and copies tarballs into the project. Local dependency
specifications and pnpm overrides keep transitive MDK dependencies on those
same tarballs. Creation writes source and initial instructions; dependency
installation and `init` are explicit next steps. The generated application then
works independently of the original checkout.

`pnpm start` runs a deterministic read-only fixture. `src/network.ts` uses public
Chains, Contracts and Core APIs to check an injected provider's chain identity.
The fixture makes no network request. Replace its transport when adding live
reads. `pnpm check` typechecks, tests matching/mismatched chains and checks locked
guidance. Node runs the TypeScript starter directly; no build step is required.
Creation accepts new or empty directories and refuses occupied targets.

### Initialize without the console

Install the CLI tarball named in the trusted artifact manifest as a local
development dependency. The standalone packed CLI bundles its Evidence SDK production dependencies. If the application
already uses SDK packages, install the matching complete artifact set first;
`init` does not change dependency configuration.

For an independent pnpm application, preview and add the base set with the
matching artifact manifest. This installs foundation packages, preserves
unrelated dependencies and settings, and initializes guidance:

```sh
pnpm exec mdk add base --artifacts /path/to/kit/manifest.json --dry-run
pnpm exec mdk add base --artifacts /path/to/kit/manifest.json
pnpm exec mdk doctor
```

Use the bundle's pinned pnpm version. The installer copies verified runtime
tarballs and records a local manifest, then asks pnpm to merge private overrides
and add selected dependencies. It disables lifecycle scripts for the addition.
Conflicting existing MDK overrides or installed SDK snapshots require an explicit
application migration; the command does not silently replace them. Nested
applications inside a parent pnpm workspace need application-owned dependency
integration; automatic addition never writes the parent workspace.

For guidance without runtime installation, use `mdk init --domains typescript`.
With matching foundation packages already installed, use `mdk init --set base`.
Available IDs are in the bundle's `domains` array: `typescript`, `applications`,
`foundation`, `memory`, SDK package names, and `knowledge-<module-id-with-hyphens>`.

If you use a coding agent, follow [agent guidance](#work-with-a-coding-agent)
while preserving the application's existing instructions.

Use `--project <directory>` to target a workspace package. Commands use that
exact root, without silently selecting its parent workspace. Direct SDK
dependencies must resolve from that project's `node_modules`; transitive pnpm
layouts resolve from each installed package.

## Build private artifacts

This section is for preparing a kit or running setup without the console.
For ordinary application setup, use the [guided workflow](#guided-setup).

In `pnpm cli`, choose **Prepare a portable private kit** and select a new or empty
output directory. Share the complete directory through your trusted private
channel. The console retains its own prepared snapshots under ignored
`local/cli-kits/`; those snapshots are not automatically refreshed.

To build and pack explicitly, run from a prepared MDK checkout:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm cli:bundle
MDK_ARTIFACTS="$(mktemp -d)"
pnpm cli:pack "$MDK_ARTIFACTS"
```

The result contains SDK and CLI package tarballs, their `manifest.json`, and a
prebuilt console started with `node start.ts`. Keep the directory together.
`cli:bundle` needs an empty `packages/cli/dist/assets`; `pnpm build` clears
package outputs before regeneration. `cli:pack` also requires an empty output
directory. These commands create local files and do not publish packages.

The manifest records package identities and hashes so consumers can use a
matching set. See the [packing contract](../../packages/cli/REFERENCE.md#packprivateartifacts--create-private-tarballs)
for file inventories and dependency handling, and the
[bundle contract](../../packages/cli/REFERENCE.md#buildreferencebundle--generate-reference-assets)
for source revision and content identity.

## Verification and boundaries

To check an application, run its tests and `pnpm exec mdk doctor`. A healthy
setup means its installed packages and managed guidance agree. It does not
establish current deployment state, writer qualification or agent behavior.

Contributors verify the tooling with the
[packed CLI checks](../../scripts/tests/test-cli-built-package.ts) and package
tests. The [CLI verification reference](../../packages/cli/REFERENCE.md#verification-scope)
records what those checks and the earlier agent-host observation establish.
For integration beyond setup, continue with the
[application guide](EXTERNAL_APPLICATIONS.md).
