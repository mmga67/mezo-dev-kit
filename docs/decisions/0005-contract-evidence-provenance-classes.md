# ADR-0005 — Contract evidence provenance classes

- Status: Accepted
- Date: 2026-08-18

## Context

Contract registry v1 validates the initial MUSD/Tigris scope by requiring two
official network artifacts for every ABI and fully verified explorer source for
every deployment. Those checks are strong, but their fixed shape excludes
other strong evidence needed by unresolved incentives and bridge promotion:

- current veBTC and veMEZO have block-pinned proxy/runtime identity and exact
  isolated executable reproduction, while the official explorer labels their
  source bundles partially verified;
- the current incentives generation is mainnet-scoped and has no legitimate
  second network artifact;
- the Native Bridge combines a version-matched official mezod precompile/client
  source with a fully verified Ethereum proxy implementation;
- MUSD NTT uses an official deployment repository plus reciprocal live peer
  configuration across three networks.

Weakening all deployments to the lowest evidence level would be unsafe.
Pretending partial explorer verification is full, fabricating a second
artifact, or treating official source as proof of deployment would be equally
unsafe.

## Proposed Decision

Every promoted deployment and ABI declares one explicit provenance class. The
validator applies the requirements for that class and never silently falls
back to another.

### `official-artifact-fully-verified-deployment`

Use the existing v1 requirements: pinned official build/deployment artifact,
full ABI equality, fully verified explorer source, deployed bytecode equality,
activation/upgrade history, and fixed-block runtime evidence.

### `deployed-executable-reproduction`

Allow only when all of the following hold:

- proxy/current implementation and runtime are block-pinned;
- the explorer's exact verification labels are preserved;
- compiler version, settings, libraries, source bundle digest, and build
  procedure are recorded;
- isolated creation and runtime executable bytecode reproduce exactly;
- full-bytecode/metadata differences are recorded separately;
- the full ABI derives from that exact source/build and matches deployed
  callable behavior;
- activation/upgrade history and freshness are complete;
- provenance/authorship/audit limitations are explicit.

This class establishes executable identity for scoped behavior. It does not
upgrade an explorer label or prove official authorship, audit coverage, or
product support.

### `official-client-precompile-source`

Use for a protocol precompile only when a pinned official client release/source
matches the live client generation, fixed-block precompile code/state and
interface are recorded, activation/version boundaries are established, and the
ABI/interface digest is tied to that release. Client-version RPC output is
supporting node evidence, not consensus proof by itself.

### `official-deployment-repository-live-configuration`

Use for deployments such as NTT only when a pinned official deployment/source
repository, full ABI/build artifact, proxy/runtime identity, reciprocal live
configuration, activation history, and fixed-block network evidence agree.
Route completion evidence remains owned by the workflow domain.

ABI provenance becomes a non-empty network/version-scoped artifact list rather
than an unconditional array of exactly two artifacts. A one-artifact record is
valid only when its selected provenance class and intended network scope justify
it; it is never inferred from absence.

Every class retains `supportStatus: proposed` and
`reviewStatus: pending-qualified-review` until Level 3 acceptance. Dynamic
instances continue to resolve through reviewed roots unless separately
approved.

## Alternatives

- Keep v1 unchanged and permanently exclude these deployments: safe but leaves
  incentives evidence review / bridge evidence review without canonical identities despite strong deployed evidence.
- Accept explorer or documentation labels without reproduction: rejected.
- Use one generic `verified` boolean: rejected because it erases materially
  different provenance and limitations.

## Consequences

- The registry can describe strong heterogeneous evidence without claiming all
  evidence has identical provenance.
- Validators become stricter per declared class and must test invalid class/
  evidence combinations.
- Protocol domains can reference stable IDs while retaining evidence-specific
  limitations in the registry owner.
- Generated outputs must carry the provenance class and canonical input digest.

## Acceptance Gate

Architecture plus qualified protocol/security review must accept the class
model and exact validation requirements. After acceptance, contract registry review must update
the schema and negative tests before promoting incentives evidence review / bridge evidence review identities. No
existing deployment changes class implicitly.

## Acceptance

Accepted by the human maintainer on 2026-08-21 without amendment. Acceptance
authorizes the class-specific schema, validator, and registry extension work
described here. Every new deployment remains `proposed` and
`pending-qualified-review` until its own evidence and Level 3 review pass; no
existing record changes provenance class implicitly.
