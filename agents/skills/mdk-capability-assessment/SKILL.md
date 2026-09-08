---
name: mdk-capability-assessment
description: Assess current MDK workspace APIs and integration gaps for contributor usage or changes. Reassess after checkout updates; skip unrelated edits and external apps.
---

# Contributor capability assessment

## Purpose and scope

Establish what this checkout can contribute to the requested outcome before
choosing an implementation or declaring a capability absent. Trying packages
inside an MDK example is contributor work. Alpha distribution does not make
documented workspace entrypoints unusable.

Reuse current root/nearest instructions and task context. Consult only relevant
`ARCHITECTURE.md` boundaries. Use skill discovery metadata to select procedures;
read `agents/catalog.json` only when routing is missing or needs verification.
Do not load every skill, package, or knowledge module.

## Assess the task

1. Separate the requested operations: explanation, identity/configuration, deterministic
   calculation, contract read, history, simulation, signing, submission, or
   knowledge maintenance. One request may cross several owners.
   EVM value parsing, validation, and exact conversion use the public
   `@mezo-dev-kit/evm` contract in `packages/evm/README.md`. Pure representation
   work needs no deployment, RPC, or protocol knowledge unless the task adds
   those semantics. It does not require a new skill.
   An explanation normally needs the relevant indexed records, canonical ABI
   and package reference. It does not require trying a wallet, fetching live
   state, downloading source, or reproducing a deployment merely because those
   steps would be necessary to execute the described operation.
2. Inspect the relevant package README, `package.json` export map, exported
   types, implementation, and existing examples. Reuse the documented public
   entrypoint where it serves the operation. Contributor access to internal
   code is not permission to use it as a public example dependency.
3. Route each operation using the table below. Read the selected skill's
   required context and apply it; mentioning a skill is not evidence of use.
4. Resolve needed knowledge through `knowledge/index.json` and the owning
   module index, using stable module/resource/record IDs. Check scope,
   `status`, `supportStatus`, `reviewStatus`, freshness, and limitations. Follow
   bounded authoritative evidence when the decision depends on deployed
   behavior. A knowledge read does not require every maintenance command.
   Identify the exact unanswered question before escalating to explorer source
   or compiler reproduction. Check retained source/evidence first and retrieve
   only the missing detail; stop once the requested claim is established.
5. Establish the usable API, injected inputs, precise gap, and verification
   boundary for each operation. A few sentences suffice for a small task;
   significant work records this assessment in its task/review before coding.

| Operation                                      | Additional route                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mezo identity, RPC configuration or capability | `mdk-network-knowledge`; `packages/chains/README.md`; indexed Networks records and required endpoint evidence.                                                                     |
| Deployment, ABI, or contract read              | `mdk-contract-knowledge`; Contracts and Core package docs, or the owning protocol reader; network guidance when using transport.                                                   |
| Protocol calculation or workflow               | Owning protocol skill and current package exports. Pure calculations need network context only when their input evidence does.                                                     |
| History, logs, checkpoints, reconciliation     | Define the exact history and coverage; `mdk-indexing-reconciliation` for scans/projections and the required network/domain evidence. It does not choose a hosted history provider. |
| Simulation, signing, submission                | `mdk-transaction-execution`, network requirements, and applicable deployment/protocol evidence. Verify actual public writer availability and explicit signer inputs.               |
| Knowledge or generated projection changes      | `mdk-knowledge-maintenance` and owning domain skill; canonical inputs before generation.                                                                                           |
| Authored code or tests                         | `mdk-typescript-development` and, for test work, `mdk-testing`, alongside the applicable domain route.                                                                             |

Domain skills elaborate their operation; they do not need to restart this
assessment. Load each relevant procedure once and revisit only changed inputs.

## Classify gaps and continue useful work

- **Usable public capability:** use it within its documented scope.
- **Required integration:** implement or inject the application-owned port
  within the task, using existing dependencies and verified inputs.
- **Missing build:** inspect the export target and run the documented build
  before treating an import failure as a missing API.
- **Internal or unsupported capability:** describe the exact missing supported
  boundary; do not deep-import it or replace all usable MDK components.
- **Evidence or configuration gap:** identify the missing source, coverage,
  endpoint capability, or signer input. Do not assume unlocked accounts, infer
  complete history from a partial scan, or fabricate a provider capability.
- **Conflicting owners:** report the code/docs/architecture/evidence conflict
  and resolve it through the owning procedure before the dependent decision.

Continue independent supported work. Existing task authorization remains
effective; ask only for missing information or decisions required by the
applicable policy. This procedure adds no blanket permission gate.

## Reassess an evolving checkout

Record `git rev-parse HEAD` and relevant `git status`/diff context for material
capability claims. Private package versions alone do not identify a revision.
After an update, branch switch, or changed worktree during a resumed task,
reinspect relevant docs, exports, build outputs, and canonical dependencies.
Revalidate old memory conclusions against those owners.

When a prior revision is available, compare the relevant boundaries: added
documented API, modified inputs/semantics, removal or narrowed scope,
internal-only change, or evidence-only update. Use newly available supported
APIs and remove obsolete workarounds within the authorized scope. Report wider
migration opportunities separately. With no trustworthy prior snapshot,
describe current capability without inventing an improvement history.

An export does not establish protocol support. Evidence acceptance does not
create an API. A new commit or build does not refresh on-chain evidence. Keep
source availability, support, distribution, and demonstrated execution distinct.

## Verification and reporting

Verify the boundary actually crossed: deterministic calculation, built-package
composition, adapter/encoding behavior, or bounded live RPC. Record exact
commands/results and, for live observations, network/block/hash/time and method
scope. Separate mock success from live integration and state unavailable
checks explicitly. Follow owning package commands and risk-appropriate review.

See `docs/guides/SDK_DEVELOPMENT.md` for a contributor walkthrough and
`docs/guides/CONTRIBUTOR_AGENT_EVALUATION.md` for behavioral evaluation.

## Stop conditions and common mistakes

Pause only the dependent work for unresolved authoritative conflict, a
protocol-sensitive assumption that cannot be verified, or an existing
scope/dependency/security/release decision. Do not infer approval from this
skill. Common mistakes are blanket rejection because of alpha status, stale
claims that an API is missing, speculative imports, copied canonical facts,
loading all domains, and completion claims broader than observed checks.
