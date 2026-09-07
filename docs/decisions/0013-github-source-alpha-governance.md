# ADR-0013 — GitHub source-alpha governance

- Status: Accepted
- Date: 2026-08-29

## Context

The source-alpha program initially considered publishing a first package set to npm.
That made registry authority, names, credentials, artifact provenance,
distribution tags, version policy, and release automation prerequisites for
work that is still intended for a small alpha developer community.

The maintainer narrowed the milestone on 2026-08-29: the GitHub repository is
the alpha distribution unit, the project uses the MIT license, and repository
changes remain under direct manual maintainer review. Package distribution and
automation can be designed later using evidence from the source alpha.

## Decision

### Distribution and support

- The first MDK alpha is distributed as source through
  `github.com/mmga67/mezo-dev-kit`.
- A clean Git checkout, the root-pinned pnpm toolchain, built workspace
  entrypoints, tests, and documented examples define the alpha verification
  path.
- Workspace packages remain private. Their names and `0.0.0-private`-style
  versions are implementation metadata, not registry availability, semantic
  compatibility, or support promises.
- The alpha is experimental and read-only. Repository presence, generated
  knowledge, or a passing check does not make every surface supported.

### License and ownership

- Repository source is licensed under the MIT License in the root `LICENSE`.
- `@mmga67` is the default CODEOWNER and manually reviews pull requests and
  material repository decisions during this stage.
- No hosted automation replaces maintainer approval. Deterministic local
  checks remain required according to task risk.
- Active alpha development integrates on `dev`. Pull requests target `dev`,
  and `@mmga67` manually promotes the accepted, polished alpha source to
  `main`; no automated branch-promotion workflow is implied.

### Security and deferrals

- Suspected vulnerabilities use GitHub private vulnerability reporting or a
  repository maintainer's established private channel. Public reports must not
  contain vulnerability details.
- The source alpha does not promise a response-time SLA, bug bounty, stable
  version, deprecation window, production support, or a package support matrix.
- npm or other package publication, namespace authority, registry credentials,
  artifact provenance, signing, version/tag policy, GitHub Releases, release
  automation, and CI/CD changes are deferred to separately approved work.

## Consequences

- Contributors clone and verify the repository instead of installing MDK from
  a package registry.
- source-alpha program children must prove workspace boundaries and clean-checkout behavior
  without tarball or registry-install requirements.
- A later distribution stage must make its own security, authority,
  compatibility, credential, artifact, and rollback decisions; this ADR does
  not pre-approve them.
- Manual governance is appropriate for the intended small alpha community but
  does not scale automatically. Feedback from this stage should inform later
  governance rather than being guessed now.

## Rejected alternatives

- Publishing provisional packages merely to make the alpha externally
  installable.
- Adding CI/CD, release bots, credentials, signing, or version automation before
  the maintainer requests that operational complexity.
- Treating private workspace metadata as a public compatibility contract.
- Inventing a security email, response SLA, or bounty promise.

## Acceptance

The maintainer accepted source-alpha governance review, this ADR, the MIT license, CODEOWNERS rule,
security wording, and `dev`-to-`main` manual promotion boundary on 2026-08-29.

## Public source boundary

On 2026-09-07 the maintainer approved a new public root history for `main`.
Public promotion includes MDK source, canonical knowledge/evidence, tests,
examples, reusable skills, and maintained developer documentation. Individual
planning records, internal review packets, local diagnostics, and predecessor
project material are excluded. Public snapshots are independently verified;
private development history is never merged into the public branch.

Public preparation may remove internal tracking labels from MDK-owned prose
and metadata. Digests of those sanitized local resources are recomputed and
derived projections are regenerated. Captured upstream artifacts, numeric and
hex observations, lifecycle states, and verification deadlines retain their
original values; publication is not a new protocol observation or evidence
refresh. All module checks and the source quality gates apply to the public
snapshot itself.
