---
name: mdk-economic-system-application
description: Explain Mezo's economy or check cross-domain assumptions from installed MDK references. Use for custody, credit, products, revenue and voting composition; skip isolated API or calculation tasks.
---

# Mezo economic system in an application

Use the application's instructions and version-compatible local corpus to
answer whole-system questions or check assumptions crossing product boundaries.
A conceptual explanation needs no wallet setup, live transaction simulation or
SDK integration work.

## Find the relevant evidence

Start with `pnpm exec mdk docs show guide:docs/architecture/mezo-economic-system-composition.md`. If it is indexed
but uncached, use `pnpm exec mdk docs fetch <id> --offline`. The installed
`.mdk/reference/bundle.json` also gives local paths and exclusion reasons.
Use `pnpm exec mdk docs search "<topic>" --json` to find only the selected
domain records. Do not assume a contributor checkout or raw evidence archive
is installed.

The composition guide orients the answer; the domain's `economic-relationships`
and accounting references provide scoped claims and gaps. Preserve each
resource's candidate/review state, source generation and freshness. Follow
delivered conflict reviews when published prose and accounting differ. An
excluded source is an explicit evidence boundary; identify the exact missing
claim before any authorized external lookup. An offline miss does not authorize
network access, a dependency install or a version update.

## Explain or verify the flow

1. Start with the economic purpose and selected user journey. Follow relevant
   custody and asset entry, credit, product participation, revenue, voting and
   emissions; avoid substituting the package list for the system.
2. Track the representation and network at every bridge stage. Keep custody,
   source inclusion and destination delivery distinct; one token's route set
   cannot establish another token's routes or supply model.
3. Separate collateral, debt, principal, receipt claims, voting power, earned
   fees and emitted rewards. Trace gauge custody and the beneficiary before
   attributing yield. Do not count the same capital in two independent positions.
4. Keep protocol parameter authority, independent allocation-voting domains
   and validator consensus roles distinct. Retrieve parameters and formulas
   from their owners instead of maintaining copies in application instructions.
5. Report published architecture, dated observed behavior, unresolved gaps and
   installed API support separately. A relationship or diagram is not proof of
   a usable writer or current cross-chain delivery.

For an implementation request, inspect installed public exports and the owning
consumer integration skill. Use `mdk doctor` when compatibility matters, then
apply the operation's current evidence, authorization and reconciliation rules.
A narrow API or amount-conversion request goes directly to that owner.

## React to new information

Treat a changed document, deployment, API or observed result as a scoped signal.
Record its source/version/network/time and which application assumptions depend
on it. Verify the affected claim; update its consumers, record why they are
unaffected, or hold the dependent behavior until resolved. Preserve historical
evidence and report upstream MDK gaps through the application's authorized
workflow. Do not silently edit managed references or their lock to accept a new
fact. Review an explicit version-compatible MDK update while preserving
application-owned instructions and code. This skill supplies no background
monitoring or automatic update service.
