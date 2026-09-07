# Security Policy

Security is part of MDK's architecture. Network records, deployments, ABIs,
financial calculations, transaction construction, write paths, templates,
agent guidance, and release tooling can all affect developer or user safety.

## Project Status and Supported Versions

MDK is currently an experimental, MIT-licensed, GitHub-hosted source alpha for
a small developer community. A private dependency-free core execution proof
exists, but no SDK package, template, contract integration, transaction writer,
bridge route, or protocol workflow is supported merely because related files
exist in the repository.

| Surface                                                     | Current security-support status                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Reviewed repository source                                  | Reports are welcome; interfaces and policies may still change       |
| Private workspace packages                                  | Repository implementation details; no registry artifact is released |
| Knowledge marked `proposed` or `pending-qualified-review`   | Review material, not a production support promise                   |
| Transaction writers, production use, and published versions | Unsupported in this alpha                                           |

The alpha has no stable-version, deprecation-window, response-time, bug-bounty,
or production-support promise. Package publication and its support policy are
deferred to separately approved work.

## Reporting a Vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull
request, task file, memory entry, or chat transcript.

Use the repository host's private vulnerability-reporting or security-advisory
interface when it is available. If no private interface is visible, contact a
repository maintainer through an established private channel. If you do not
have one, open a public issue that asks only for a private security contact and
contains no vulnerability details.

Do not send private keys, seed phrases, production credentials, wallet data, or
personal data with a report. Include only what is necessary to reproduce the
issue safely:

- affected file, package, version, commit, network, and deployment coordinate;
- vulnerability class and realistic impact;
- minimal reproduction steps or proof of concept;
- required preconditions and privileges;
- whether the issue has been observed in the wild;
- suggested mitigation, if known;
- any disclosure timing constraints.

`@mmga67` owns repository decisions during this alpha, but the repository does
not publish a named private security address, response-time SLA, or bug-bounty
promise. Use the private-first path above and do not infer or invent those
details.

## Handling and Disclosure

Maintainers should keep a report private while they:

1. establish the affected scope and evidence;
2. identify supported versions, deployments, consumers, and exposure;
3. reproduce the issue without unsafe production writes;
4. prepare a fix, regression verification, and migration or revocation plan;
5. coordinate disclosure with affected upstream or downstream maintainers;
6. publish an advisory and credits when it is safe and agreed with the
   reporter.

Security findings are blockers. They must not be downgraded to documentation
nits, hidden by disabling checks, or stored only in agent memory.

## Security Boundaries

### Network, contract, and protocol evidence

- Never infer a supported deployment from an address or ABI alone.
- Verify chain identity, deployment address, proxy and implementation history,
  activation range, source/ABI identity, and current runtime evidence.
- Preserve explorer verification labels and evidence limitations exactly.
- Reject zero-address sentinels, ambiguous versions, unsupported networks,
  stale evidence, and conflicting sources rather than guessing.
- Keep addresses and ABIs in their canonical owner; copied values create unsafe
  drift.
- Financial formulas require explicit units, precision, rounding, boundary
  fixtures, version scope, and qualified protocol review.

Protocol-sensitive knowledge remains proposed until its Level 3 review gate is
recorded. Canonical records are maintained projections of evidence, not proof
by location or filename.

### Transaction and wallet safety

- Assert chain, account, inputs, deployment, quote freshness, and spender before
  signing.
- Simulate the exact intended call and preserve decoded revert information.
- Request only the necessary approval target and amount; unlimited approvals
  require an explicit supported design and user-visible risk treatment.
- Distinguish submission, inclusion, receipt success, confirmation, and
  protocol reconciliation. A transaction hash is not success.
- Do not blindly retry nonce-bearing or otherwise non-idempotent writes.
- Handle replacement, cancellation, reorg, timeout, receipt failure, and
  reconciliation mismatch explicitly.
- Mainnet writes, funded test accounts, signing automation, deployment, and
  release actions require explicit task scope and human authorization.

The transaction semantics are accepted in
[ADR-0003](./docs/decisions/0003-transaction-lifecycle.md); public
implementation and writer release remain subject to its implementation and
protocol-specific Level 3 gates.

### Secrets, logs, evidence, and memory

Never commit or place in documentation, fixtures, task files, issue reports,
logs, generated artifacts, or memory:

- private keys, mnemonics, signing material, or wallet backups;
- access tokens, cookies, passwords, RPC credentials, or private endpoints;
- personal, customer, or confidential partner data;
- raw provider state that contains credentials or private identifiers.

Use redacted, reduced fixtures. Debug logging must be opt-in and must redact
headers, URLs containing credentials, signatures when sensitive, and private
data.

Local memory and provider state belong outside Git. Shared memory seeds require
review and source links, and must remain safe to export. Memory is never an
authorization store, secret store, or independent source of protocol truth.

If a secret is exposed, removing it from the latest file is not sufficient.
Stop, notify maintainers privately, revoke or rotate the credential, assess
history and downstream exposure, and follow a reviewed cleanup plan.

### Dependencies and supply chain

New dependencies require explicit human approval before adoption or
installation. Review necessity, maintainer and release health, known
vulnerabilities, install scripts, transitive dependencies, lockfile changes,
license compatibility, provenance, and build/publishing effects.

Do not use unpinned `latest` tooling as release evidence. Do not trust
unverified generated or executable artifacts. CI/CD, package publishing,
signing, provenance, permissions, and secret configuration are security
boundaries and may change only under explicit scope and review.

### Generated outputs and templates

Generated contract data, bindings, and docs must derive deterministically from
reviewed canonical inputs and retain input identity or digests where practical.
Drift is a failure, not a manual-edit opportunity.

Templates and examples must use public MDK APIs, safe defaults, and placeholder
configuration. They must not contain live credentials, privileged addresses,
unbounded approvals, automatic production writes, or copied protocol facts.

### External services and upstream protocols

MDK may depend on RPC providers, explorers, wallets, bridges, package
registries, source repositories, and deployed contracts that have independent
security policies. MDK cannot guarantee their availability or security.

When a report primarily affects an upstream project or deployed protocol,
coordinate privately with that owner. Still report it to MDK maintainers when
MDK exposes, amplifies, misrepresents, or fails to defend against the issue.

## Required Review

Security guidance, contract/deployment records, ABIs, financial calculations,
transaction construction, write paths, approvals, registry changes, and
release infrastructure are Level 3 changes. They require:

- authoritative, version-matched evidence;
- targeted deterministic tests;
- integration verification where practical and safe;
- explicit negative, failure, and compatibility review;
- qualified human review before release.

A contract audit, explorer label, schema pass, or successful happy-path test is
useful evidence but does not replace the complete gate.

## Source-Alpha and Future Release Gates

The current source alpha is governed manually by `@mmga67`, licensed under the
root MIT license, and verified through documented local checks from a clean
checkout. It has no publishing credentials, release automation, stable version,
or package-registry support contract. Security-sensitive and protocol-sensitive
changes still require their normal Level 3 verification and qualified review.

Before the first public package release, maintainers must establish:

- package publishing authority and registry ownership;
- dependency-license policy for the released package set;
- named private security contact and response targets;
- supported runtime, tool, chain, deployment, and package versions;
- release, changelog, deprecation, provenance, and rollback procedures;
- CI/CD least privilege, protected publishing credentials, and artifact
  verification;
- qualified reviewers or CODEOWNERS for protocol-sensitive surfaces.

Until those decisions are recorded, repository material may be reviewed and
tested as source but must not be represented as a published package or
production security guarantee.
