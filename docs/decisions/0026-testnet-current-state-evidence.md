# ADR-0026 — Mainnet evidence and current testnet state

> Historical decision, consolidated on 2026-09-15 into
> [Network scope](../manifest#network-scope).
> The original text and acceptance scope below are retained for context;
> the manifest and its delegated owners define current policy.

- Status: Accepted for project scope
- Date: 2026-09-15
- Accepted by: maintainer direction on 2026-09-15
- Supersedes: the temporary testnet archive-recovery exception in the oracle refresh guide.

## Context

MDK already separates mainnet reader evidence from testnet oracle archive
re-verification and provides bounded current-state captures. Recovering the
testnet oracle's original creation storage adds maintenance work without serving
those operations. The maintainer requested a standing policy that makes testnet
historical data unnecessary and prioritizes recent state and mainnet evidence.

Mainnet evidence establishes behavior only within its recorded deployment,
implementation, and version scope. It cannot establish a testnet address,
implementation, balance, configuration, price, or transaction outcome.

## Decision

### Evidence scope

- Mainnet remains the primary maintained deployment and historical evidence
  scope. Its existing provenance, freshness, replay, and release requirements
  continue to apply.
- Testnet is a current-state integration environment. Use recent, explicitly
  scoped testnet observations and verified source/ABI evidence matching the
  observed testnet implementation. Reuse mainnet-derived behavior evidence only
  where that implementation compatibility is established.
- Long-term testnet archive capture, recovery, maintenance, historical backfills,
  old-generation replay, and full-history certification are outside MDK's
  supported project scope. They are unnecessary for ordinary implementation,
  maintenance, acceptance, and release of the included scope. Do not create or
  reopen a recovery task because old testnet evidence expires, a historical
  diagnostic fails, or an archive provider becomes available.
- A request requiring excluded testnet history receives an explicit unsupported
  scope or unavailable-evidence result. It does not silently expand MDK's
  requirements. Adding maintained testnet historical support requires a
  maintainer-approved revision of this decision.

### Recent observations and retained evidence

"Recent" follows the operation's owning freshness, finality, and coverage rules;
this ADR introduces no universal block count or age limit. A bounded recent
receipt, log range, confirmation, reorg overlap, or protocol post-state check
needed by a current operation remains required. Missing evidence for that
operation makes its result unavailable or incomplete.

Current testnet observations must verify their actual chain, block/hash,
deployment, runtime/implementation, ABI compatibility, configuration, and
value/time constraints as applicable. Mainnet values and a successful historical
testnet observation cannot replace these checks.

Preserve retained testnet artifacts, dates, proxy generations, and limitations
as records of their original observations. No recapture or freshness renewal of
excluded history is required. Existing integrity checks can still validate
retained bytes and references. Never claim a recent observation proves an old
coordinate or apply a current ABI to an unqualified old generation.

### Acceptance and diagnostics

Use the existing mainnet acceptance commands and bounded current-state capture
workflow documented in the [oracle refresh guide](../guides/oracle-evidence-refresh.md).
Testnet/full-history diagnostics remain available with their existing strict
claims. Their missing or expired testnet archive evidence is an excluded-scope
diagnostic, not a requirement to recover history before accepting included work.
Report actual command failures and their scope; do not report those diagnostics
as passed or relabel a scoped check as full-history acceptance.

Structural inconsistencies, current-state failures, and mainnet evidence
failures remain failures for the included scope. The exclusion applies only to
maintaining testnet historical coverage and its fresh archive re-verification.

This decision does not add a testnet reader/writer API, change canonical
deployment support, extend evidence dates, authorize transactions, or complete
qualified protocol-release review. Existing public API and transaction semantics,
including the separate mainnet historical evidence boundary in ADR-0024, retain
their owners.

## Alternatives

- Keep testnet and mainnet archive requirements identical: rejected because the
  maintainer does not include long-term testnet history in MDK's product scope.
- Keep only a temporary oracle exception: rejected because unrelated tasks could
  repeatedly recreate the same maintenance requirement.
- Use mainnet evidence as proof of testnet state: rejected because deployments,
  configuration, prices, balances, and transaction outcomes are network-specific.
- Delete retained history or convert failed historical checks into passes:
  rejected because neither is needed to narrow the maintained scope.

## Consequences

MDK can progress using maintained mainnet evidence and qualified recent testnet
observations without acquiring testnet archive access. It offers no maintained
long-term testnet replay, archive completeness, or historical certification.
Existing testnet artifacts can support diagnostics within their recorded limits.
Consumers needing a testnet historical service own that additional service and
its evidence; it is not an implicit MDK dependency.

## Acceptance gate

The maintainer's direction accepts this project-scope decision. Record it in
architecture, route the affected maintenance and contributor workflows to it,
and keep a dedicated memory retrieval pointer. Verify documentation links,
memory schema/index consistency, skill routing, and generated discovery.
Executable provenance and freshness checks retain their existing behavior;
future changes to them require their own implementation verification and review.
