# Mezo incentives knowledge

This module owns deployment-scoped knowledge for current veBTC and veMEZO
locks, boost voting, independent PoolsVoter and ValidatorsVoter domains,
epochs and votes, gauges, emissions, rewards, and their deterministic formulas.

For human use, start with `generated/reference.md`, then open only the indexed
record or evidence resource needed. `review/gaps.md` is the current production
blocker checklist; `review/candidates.md` records material that was not
promoted. The pinned official specification is stored as the indexed artifact
[`official-mezo-earn-whitepaper-pdf`](./artifacts/mezo-earn-whitepaper-2025-12.pdf);
its official URL, digest, scope, and deployment conflict remain owned by
`incentives-sources`.

For machine use, resolve module `protocols/incentives` through `index.json` and
refer to resources by `resourceId`. `incentives-contract-roles` maps fifteen
bounded roles to Contracts deployment and ABI records. The five registry provenance review roles,
eight emission evidence review emission roles, and two validator evidence review validator factory roots are
accepted registry scope. The 24 observed
validator gauges and paired voting-reward contracts are dynamic evidence
instances rather than independently maintained registry roots. Addresses
inside dated evidence remain observation coordinates, not protocol constants.

## Current boundary

- Canonical protocol behavior is verified and version scoped.
- Module support is `none`; no lock, vote, reset, poke, distribute, or claim
  writer is released.
- incentives evidence review qualified Level 3 review accepted the bounded lock, boost, vote,
  gauge, reward, and emission model on 2026-08-25. emission evidence review independently
  accepted the emission/rebase/splitter model and its registry additions.
- Stable current-generation contract IDs, ABIs, and activation histories
  received qualified registry acceptance under registry provenance review. This does not accept
  the incentives protocol or a writer surface.
- Eight emission-specific contract IDs, deployments, and ABIs added by
  emission evidence review received qualified registry acceptance.
- validator evidence review qualified review accepted the current ValidatorsVoter generation, its independent
  persistent vote state, exact allocation/index/distribution formulas, dynamic
  gauge lifecycle, and representative vote, notification, distribution, and
  claim reconciliation and its two reusable factory roots. Dynamic children,
  readers, writers, validator operations, and analytics remain unsupported.
- The active deployed validator generation and settled events take precedence
  over conflicting descriptive prose. The conflict between the current
  validator-gauge guide and a separate equal-split guide remains explicit
  review evidence rather than being silently normalized.
- Historical create-lock and replacement-vote replay proves only those exact
  historical pre-state transitions.
- Qualified review does not enable a public reader or writer. Every future
  operation still requires fresh identities, preconditions, exact-call
  simulation, reconciliation, and operation-specific review.
- APY, forecasts, planners, and user yield are analytics outside this module.

Maintainers follow `docs/standards/knowledge-management.md` and the incentives
skill. Update evidence, sources, record projections, fixtures, generated
reference, and declared checks together.
