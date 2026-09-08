# MDK workspace-module authoring

This guide gives maintainers one TypeScript-first workflow for creating or
changing an MDK workspace module during the GitHub source alpha. Packages are
private repository boundaries: they are not npm releases, reserved names,
semantic-version promises, or permission to expose a protocol writer.

Use the [SDK development quickstart](./SDK_DEVELOPMENT.md) first for checkout,
branch, toolchain, and contributor-skill setup. The
[architecture](../../ARCHITECTURE.md), [coding standard](../standards/coding.md),
[testing standard](../standards/testing.md), root and nested `AGENTS.md`, and
owning domain sources remain authoritative if this practical guide is
incomplete.

## Decide whether a package is justified

Start with an owner decision, not a directory name.

```text
Does an accepted owner already contain the behavior?
├─ yes → extend that owner; do not split for file size or naming preference
└─ no
   ├─ is the behavior a coherent capability with its own public boundary,
   │  dependency direction, tests, documentation, and likely consumers?
   │  ├─ no → keep it with the nearest accepted owner
   │  └─ yes
   │     ├─ does ARCHITECTURE.md already permit that owner and dependency edge?
   │     │  ├─ yes → create a scoped task and package
   │     │  └─ no → stop for an architecture decision before scaffolding
   │     └─ does it require a new dependency, writer, or publication?
   │        ├─ yes → stop for its separate approval and review
   │        └─ no → proceed with the private workspace module
```

A new package is justified by ownership and an enforceable boundary. It is not
justified by a planned directory, a desire for a generic `utils` home, one
large file, or an imagined future consumer. Search the workspace first:

```sh
find packages extensions templates examples -name package.json -print | sort
rg -n 'the capability or public type' packages docs ARCHITECTURE.md
```

If ownership is unclear or the required edge contradicts the current graph,
record what you found and stop. Do not create an abstraction that settles the
architecture accidentally.

## Preserve dependency direction

The accepted high-level direction is:

```text
chains
  ↓
contracts
  ↓
core
  ↓
protocol modules
  ↓
framework adapters
  ↓
examples / applications
```

Consult `ARCHITECTURE.md` for the complete graph and ownership rules. A package
may depend only on an accepted upstream owner. Declare every workspace edge in
the consuming `package.json`, import the provider by package name, and use only
an exported entrypoint. Cycles, cross-package relative paths, undeclared edges,
and imports such as `@mezo-dev-kit/example/src/internal.ts` fail the boundary
contract.

`src/` is an implementation location, not an automatically supported API. The
supported surface is the package export map plus its maintained documentation.
The private Chains, Contracts, and Core modules map their only supported
entrypoint to built JavaScript and declarations. Contracts uses the Chains
entrypoint for stable network identity, and Core uses both upstream entrypoints
for read coordination. Their package source, generated implementation files,
and Core's retained transaction proof are not declared subpaths. A runnable
built boundary must be tested without source fallbacks; this still does not
create a registry-release contract.

## Minimal package shape

Place a runtime package under the architecture-owned workspace area, normally
`packages/<owner>/`. Do not edit `pnpm-workspace.yaml` merely for another
package already covered by `packages/**`. Change that root declaration only
when an accepted architecture decision introduces a genuinely new workspace
area.

```text
packages/<owner>/
├── package.json
├── README.md
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   └── index.ts
└── test/
    └── <behavior>.test.ts
```

Add `scripts/`, `generator-input/`, fixtures, or examples only when the owned
behavior needs them. A source-alpha manifest checklist is:

- scoped repository name such as `@mezo-dev-kit/<owner>`;
- `"version": "0.0.0-private"`, `"private": true`, `"license": "MIT"`, and
  `"type": "module"`;
- a narrow description that does not claim unsupported protocol coverage;
- an explicit `exports` map for each supported entrypoint;
- `format:check`, `typecheck`, typed `lint`, `build`, `test`, seeded
  `test:shuffle`, and composed `check` scripts appropriate to the module;
- exact, already-approved development dependencies only;
- explicit `workspace:*` dependencies for accepted workspace edges; and
- no `publishConfig`, release scripts, registry tags, credentials, or
  package-local lockfile.

Use the root `tsconfig.base.json`, TypeScript, ESLint, Prettier, pnpm, and
Vitest baseline. The normal checking config includes source, tests, generator
scripts, and test configuration with `noEmit`. The build config narrows to
runtime source, sets a deterministic output directory/root, emits declarations
when the package exposes types, and rewrites TypeScript relative extensions
when runnable JavaScript is emitted. Do not exclude authored code from
typechecking merely to make a gate pass.

Export named values and types deliberately from `src/index.ts`; avoid wildcard
barrels. Keep internal validation, transport adapters, fixtures, and generated
implementation details unexported unless consumers have a reviewed need for
them.

## Model the smallest supported read API

Before implementation, write down the support contract:

- supported networks, deployment ranges, and capability status;
- external inputs and the point at which every `unknown` value is validated;
- exact units, scale, rounding, and integer representation—base units use
  `bigint`, not JavaScript floating point;
- required versus optional reads and how partial or unavailable data is
  represented;
- the block number and, where available, block hash that make a multi-read
  result coherent;
- typed failure codes, structured context, retry meaning, and preserved causes;
- injected provider/registry/clock dependencies rather than hidden globals;
- pure deterministic calculations separated from RPC, wallets, and mutable
  state; and
- the exact public names, types, examples, and compatibility expectations.

A required read failure must not be returned as complete success. An optional
read may use a discriminated `available`/`unavailable` result when that state is
supported. Multiple values forming one logical result must be pinned to one
coordinate; do not combine whatever block each provider call happens to see.
Validate provider, JSON, environment, registry, and generated inputs at their
boundaries. Never swallow an error, convert an unknown outcome to success, or
leak a provider-library type through the framework-independent public API.

Read-only scope means no signer requirement, approval, transaction
construction, submission, or value-bearing side effect. Discovering that the
feature needs any of those is a stop condition, not an invitation to add a
small writer while scaffolding.

## Generated runtime inputs

Protocol facts remain in their indexed canonical `knowledge/` owner. Runtime
packages must not import repository knowledge files, parse `knowledge/` at
runtime, or manually copy an address, ABI, deployment, formula, or support
status into source.

Use this build-time flow instead:

```text
indexed canonical module/resource ID
→ schema/lifecycle/evidence validation
→ deterministic repository generator
→ generated package-owned TypeScript
→ runtime import from generated TypeScript
```

The generator must name the canonical module/resource IDs and input paths,
validate untrusted parsed data, constrain its output path, emit deterministically,
record a digest of the exact input bytes, and support a drift-only `--check`
mode. Change the canonical input and generator first; regenerate and review the
input/output diff together. Never patch generated output by hand.

Core demonstrates the real repository boundary with
`scripts/generate-core-transaction-model.ts`: it resolves stable transaction
resources, produces `packages/core/src/model.generated.ts`, records a SHA-256
input digest, and supports:

```sh
node scripts/generate-core-transaction-model.ts --check
```

The disposable example below uses a fictional package-local input so it cannot
be mistaken for Mezo knowledge. Its `generator-input/synthetic-model.json` is
the named canonical input only for that fixture. Runtime source imports the
generated TypeScript and has no JSON or `knowledge/` import.

## Manual creation workflow

### 1. Approve the owner and activate the task

Confirm `dev`, inspect the dirty worktree without discarding unrelated changes,
read the task and nearest rules, and load `mdk-typescript-development`, the
owning domain skill, and `mdk-testing` when tests are in scope. Record allowed
packages/dependencies, canonical inputs, public API constraints, risk level,
and stops before editing.

For significant work, move the task from `backlog/` to `active/`. Humans retain
control of the goal, priority, material scope, and final acceptance.

### 2. Inspect an owner, then scaffold the boundary

Inspect the closest accepted package's manifest, configs, README, source
exports, tests, and commands. Use it as evidence for current mechanics, not as
permission to duplicate its semantics. Search for an existing shared type or
helper before adding one.

Create the minimal layout and private manifest above. Declare accepted
workspace dependencies and supported exports immediately so boundary mistakes
surface early. Do not add a new external dependency. If current platform or
approved workspace capabilities are insufficient, stop with the dependency
need, alternatives considered, maintenance/security/license review, and
expected lockfile/surface impact.

### 3. Implement one vertical read-only slice

Start at the public input/output/error types. Inject the smallest provider port,
validate external results from `unknown`, pin coherent reads, separate pure
calculation, and explicitly model unavailable data. Add only the exports needed
by the first supported use case. Keep framework adapters and examples outside
the protocol/core owner.

If the runtime needs canonical data, add or update the owning knowledge record
through its domain task, then add a deterministic generator and drift gate.
Protocol-sensitive facts, formulas, support transitions, or registry-derived
data raise verification to Level 3 and require authoritative evidence and
qualified review.

### 4. Test behavior and failures

Derive tests from the public contract, not from implementation line order.
Cover the nominal result, boundary/partition values, malformed external data,
required partial failure, optional unavailability, block mismatch, provider
failure, ordering/side-effect constraints, and pure calculation units. Assert
typed code/context/cause and that validation failures do not invoke downstream
effects. Do not use snapshots or test counts as a substitute for semantic
assertions.

### 5. Run focused gates from narrow to broad

Discover, then run, the package-owned commands:

```sh
pnpm --filter <package-name> run
pnpm --filter <package-name> format:check
pnpm --filter <package-name> typecheck
pnpm --filter <package-name> lint
pnpm --filter <package-name> test
pnpm --filter <package-name> test:shuffle
pnpm --filter <package-name> build
pnpm --filter <package-name> check
pnpm boundaries
```

Run every affected generator's drift check. Inspect declaration and JavaScript
output when emitted. Then exercise a clean consumer through the declared
package name/export map as shown below. A test importing `../src/index.ts` is a
package test, not proof of the built consumer boundary.

Before review, run the risk-appropriate root gate, shuffled tests, link check,
and whitespace check. Record exact commands and failures; do not describe a
narrow substitute as the full gate.

### 6. Document and review compatibility

Update the package README with support scope, configuration, units,
coordinates, failure behavior, examples, limitations, and exact commands.
Update architecture or an ADR only when the accepted design changed. Update a
guide/reference only when its owner changed.

For each added or changed export, review source and built resolution, type
shape, error contract, units, async behavior, generated input, and existing
consumer impact. During the private alpha, compatibility still matters even
though the version is not a public promise: avoid accidental breaks and record
intentional ones for the maintainer.

Add an example only when it proves a supported public workflow and can remain
read-only, deterministic, credential-free, and maintainable. Add or update a
consumer skill only when application agents need a reusable supported
procedure; keep its canonical source in `agents/consumer/skills/`, do not copy
repository-maintenance instructions, and validate/materialize it through the
catalog workflow. Do not create either merely to make the directory look full.

Decide whether memory needs an update. Routine task history and rules already
owned by code/docs/tasks do not belong in memory. Capture only a durable,
verified, non-canonical observation that will improve later retrieval; promote
authoritative discoveries to their real owner instead.

Move the task to `review/` only after deliverables and technical verification
are complete. The maintainer accepts and moves it to `done/`.

## Existing-module workflow

For an existing owner, do not re-scaffold or rename it by default:

1. identify the current supported exports, package docs, dependents, generated
   inputs, and exact checks;
2. classify the change as additive, behavior-changing, deprecating, or
   removing, and inspect all repository consumers;
3. preserve dependency direction and add no deep or undeclared edge;
4. update public types/errors/units and runtime validation coherently;
5. update canonical input and generator before generated output, then run drift
   checks;
6. add regression and negative tests before relying on the previous suite;
7. build and check declarations plus a package-name consumer for every changed
   entrypoint;
8. update the package README, relevant example, and consumer skill when their
   supported behavior changed;
9. record compatibility, documentation, knowledge, skill, memory, and follow-up
   decisions; and
10. run package, boundary, root, shuffled, link, and whitespace gates at the
    appropriate risk level.

Stop if the requested change unexpectedly moves ownership, requires a circular
edge, changes an architecture/public API outside approved scope, lacks required
evidence, or can pass only by weakening a gate.

## Coding-agent request template

Give a coding agent a bounded contract like this:

```text
Implement <TASK-ID> on the current dev worktree.

Outcome:
- Create or extend <workspace package and owner> for <one read-only capability>.

Authority and context:
- Read root and nearest AGENTS.md, the task, ARCHITECTURE.md, package README,
  coding/testing standards, and only <domain canonical sources>.
- Load mdk-typescript-development, <owning domain skill>, and mdk-testing.
- Canonical generated inputs are <stable module/resource IDs>; do not copy facts
  or import knowledge files at runtime.

Allowed changes:
- <exact directories/files>.
- Existing workspace dependencies: <list>.
- New external dependencies: none.

Public contract:
- Supported exports: <names/entrypoints>.
- Inputs/outputs, exact units, block coordinate, required/optional availability,
  typed failures, and compatibility constraints: <details>.
- Read-only: no signer, approval, transaction construction, submission, or write.

Required tests:
- Nominal, boundary partitions, malformed unknown input, provider failure,
  required partial failure, optional unavailable result, block mismatch,
  pure calculation, and no downstream side effect after validation failure.

Exact verification:
- <generator --check>, package format/type/lint/test/shuffle/build/check,
  pnpm boundaries, clean package-name built consumer, applicable root checks,
  Markdown links, and git diff --check.

Stop and report:
- unclear ownership/evidence, architecture or unapproved API expansion, new
  dependency, cycle/deep import, copied canonical fact, unsupported tool,
  writer, publication/CI/security change, destructive action, or gate bypass.

Handoff:
- Report changed files, checks actually run, API/compatibility impact,
  knowledge/docs/example/consumer-skill/memory decisions, and remaining risks.
- Do not commit, push, publish, merge, or promote to main unless separately asked.
```

The agent may choose implementation details inside that envelope, but it must
not infer authority for a new package owner, dependency, fact, writer, or
release surface.

## Disposable manual and agent proof

The maintained [synthetic fixture](./examples/sdk-package-development/README.md)
contains a fictional reader and built consumer. It is documentation source,
not an active package. It proves exact base units, external validation, typed
failures, required/optional reads, block coherence, generated-input drift,
explicit exports, declarations, and package-name consumption without Mezo
facts or external calls.

From an installed repository root, prepare a clean disposable workspace. Use a
new directory for each path; do not run `pnpm install` inside it:

```sh
mdk_module_fixture_root="$(mktemp -d -t mdk-sdk-package-XXXXXX)"
cp -R docs/guides/examples/sdk-package-development/repository/. \
  "$mdk_module_fixture_root/"
cp package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs \
  .prettierrc.json "$mdk_module_fixture_root/"
ln -s "$PWD/node_modules" "$mdk_module_fixture_root/node_modules"
```

Run the package gates and inspect output:

```sh
pnpm_config_verify_deps_before_run=false pnpm --dir "$mdk_module_fixture_root" \
  --filter @mezo-dev-kit/synthetic-reader generate:check
pnpm_config_verify_deps_before_run=false pnpm --dir "$mdk_module_fixture_root" \
  --filter @mezo-dev-kit/synthetic-reader check
pnpm_config_verify_deps_before_run=false pnpm --dir "$mdk_module_fixture_root" \
  --filter @mezo-dev-kit/synthetic-reader test:shuffle
find "$mdk_module_fixture_root/packages/synthetic-reader/dist" \
  -maxdepth 1 -type f -print | sort
```

The fixture deliberately has no temporary install or workspace-state record.
The scoped environment setting prevents pnpm 11 from trying to repair that
intentional state before a script. Use it only for this copied no-install
fixture; never use it to bypass dependency verification in the real checkout.

Run the repository boundary validator against the disposable root:

```sh
MDK_FIXTURE_ROOT="$mdk_module_fixture_root" node --input-type=module --eval '
  import { validateWorkspaceBoundaries } from "./scripts/validate-package-boundaries.ts";
  const diagnostics = await validateWorkspaceBoundaries(process.env.MDK_FIXTURE_ROOT);
  if (diagnostics.length > 0) {
    throw new Error(JSON.stringify(diagnostics, null, 2));
  }
  process.stdout.write("Disposable workspace boundaries are valid.\n");
'
```

Create a package-only built artifact and link the consumer to that artifact.
This deliberately excludes `src/`, tests, generator input, and generator code:

```sh
mkdir -p "$mdk_module_fixture_root/artifacts/synthetic-reader"
cp "$mdk_module_fixture_root/packages/synthetic-reader/package.json" \
  "$mdk_module_fixture_root/artifacts/synthetic-reader/"
cp -R "$mdk_module_fixture_root/packages/synthetic-reader/dist" \
  "$mdk_module_fixture_root/artifacts/synthetic-reader/"
mkdir -p "$mdk_module_fixture_root/packages/synthetic-reader-consumer/node_modules/@mezo-dev-kit"
ln -s "$mdk_module_fixture_root/artifacts/synthetic-reader" \
  "$mdk_module_fixture_root/packages/synthetic-reader-consumer/node_modules/@mezo-dev-kit/synthetic-reader"
pnpm_config_verify_deps_before_run=false pnpm --dir "$mdk_module_fixture_root" \
  --filter @mezo-dev-kit/synthetic-reader-consumer check
node "$mdk_module_fixture_root/packages/synthetic-reader-consumer/dist/index.js"
```

The consumer imports `@mezo-dev-kit/synthetic-reader`, not a file path. Its
typecheck resolves `dist/index.d.ts`; its built runtime resolves
`dist/index.js`. Because the linked artifact has no source tree, a source deep
import cannot make this proof pass accidentally.

For the manual proof, create the fixture from this section and run every
command. For the coding-agent proof, give the agent the request template with
this fixture path and require a second clean temporary root plus the same exact
commands. Compare the two before cleanup:

```sh
diff -qr "$mdk_manual_root/packages/synthetic-reader/src" \
  "$mdk_agent_root/packages/synthetic-reader/src"
diff -qr "$mdk_manual_root/packages/synthetic-reader/dist" \
  "$mdk_agent_root/packages/synthetic-reader/dist"
```

Build source maps contain no timestamps, and the generated model is a pure
function of its exact input bytes, so both trees should match. Inspect each
temporary path before removing only those paths. Keep any path whose result is
unexpected for diagnosis.

This fixture does not replace real package checks or authoritative
knowledge-derived generation. For a real generated input, also run the owning
module validator/generator and repository drift checks, including the current
Core check when its transaction inputs are affected.

## What not to do

- Do not create speculative packages or vague `common`, `helpers`, or `utils`
  owners.
- Do not invert dependency direction, create cycles, or reach across owners
  with relative, deep, or undeclared imports.
- Do not use hidden globals or leak provider/client-library types through the
  public framework-independent API.
- Do not wildcard-export a source tree or assume every `src/` file is supported.
- Do not use JavaScript numbers or floating point for base units or exact
  financial calculations.
- Do not swallow errors, erase causes/context, treat partial data as complete,
  or combine reads from unspecified blocks.
- Do not trust RPC, JSON, environment, registry, or generated data without
  runtime/build-time validation at its boundary.
- Do not import `knowledge/` at runtime, manually copy canonical facts, patch a
  generated file, or omit its digest/drift check.
- Do not make snapshot-only tests, happy-path counts, mocks of the function
  under test, or weakened type/lint settings stand in for behavior.
- Do not add or install an unapproved dependency or create another lockfile.
- Do not introduce a signer, approval, transaction construction/submission,
  protocol writer, value-bearing example, or secret.
- Do not add publication metadata, registry automation, CI/CD, tags, release
  credentials, or a compatibility claim during the source alpha.
- Do not commit, push, merge, or promote `dev` to `main` unless the maintainer
  separately requests that repository action.

## Final review checklist

- [ ] Owner and dependency direction are accepted; extending an existing owner
      was considered first.
- [ ] Manifest is private/MIT/ESM, declares all edges, and exports only the
      documented surface.
- [ ] TypeScript source, tests, scripts, and build/declaration output follow the
      root toolchain without suppressions or unapproved dependencies.
- [ ] External values are validated from `unknown`; units, failures,
      unavailable/partial reads, and consistency coordinates are explicit.
- [ ] Pure calculations are separated from provider/RPC state.
- [ ] Generated runtime data names canonical inputs, validates them, emits
      deterministically with a digest, passes drift checks, and creates no
      runtime knowledge dependency.
- [ ] Nominal, negative, boundary, side-effect, and shuffled tests pass.
- [ ] Package format, type, typed lint, build/declaration, test, boundary, and
      built package-name consumer checks pass.
- [ ] Compatibility, docs, example, consumer-skill, knowledge, and memory
      decisions are recorded.
- [ ] New dependencies, writers, publication, CI/CD, security, and unexpected
      architecture/API changes remained stopped for separate approval.
- [ ] Risk-appropriate root checks, links, and `git diff --check` pass; the task
      is moved only to `review/` pending maintainer acceptance.

## Related guidance

- [SDK development quickstart](./SDK_DEVELOPMENT.md)
- [Architecture](../../ARCHITECTURE.md)
- [Contributing](../../CONTRIBUTING.md)
- [Coding standard](../standards/coding.md)
- [Testing standard](../standards/testing.md)
- [Knowledge authoring](./KNOWLEDGE_AUTHORING.md)
- [Skill authoring](./SKILL_AUTHORING.md)
- [External applications](./EXTERNAL_APPLICATIONS.md)
- [Source-alpha governance ADR](../decisions/0013-github-source-alpha-governance.md)

For changes to an existing public boundary or its evidence dependencies, follow
the [capability guidance maintenance rule](../../CONTRIBUTING.md#keep-capability-guidance-current)
and the affected [contributor behavioral cases](./CONTRIBUTOR_AGENT_EVALUATION.md).
