---
name: mdk-economic-system
description: Explain or verify Mezo's economic architecture across custody, credit, products, revenue, voting and emissions. Use for whole-system questions or cross-domain assumptions; skip isolated API, calculation and transaction tasks.
---

# Mezo economic-system reasoning

Use this procedure to connect domain models into an economic explanation or to
check assumptions spanning several owners. Individual modules and package APIs
do not establish the full Mezo architecture.

## Establish the question

1. Reuse the task and applicable instructions. Distinguish explanation,
   architecture verification, knowledge maintenance and an executable workflow.
   A narrow amount conversion, contract lookup or single-domain operation goes
   directly to its owner; it does not need this procedure.
2. Start with [Mezo's economic system](../../../docs/architecture/mezo-economic-system-composition.md)
   for orientation and the [knowledge entry point](../../../knowledge/README.md)
   for domain discovery. The explanation is a projection of evidence, not an
   independent correctness oracle. When verifying architecture, compare its
   relationships with the primary sources and scoped deployment evidence it cites.
3. Select the actors and flows needed to answer the question. Follow asset
   entry/custody, credit creation or lending, product participation, revenue,
   voting and emissions where relevant. Do not substitute a package inventory
   for the economic explanation or load every domain by default.

## Resolve each relationship

Use the selected module index and stable resource references. Domain skills
elaborate the relevant procedure; they do not restart this whole-system pass.
Where indexed, `economic-relationships` exposes the domain's composition
claims and gaps. Check its own review state and follow its basis references;
the module's acceptance does not accept a newly added relationship collection.

| Relationship under review                                                | Owning knowledge and procedure                                                                                                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset origin, representation, custody and cross-chain delivery           | `workflows/bridges`; [bridge knowledge](../mdk-bridge-knowledge/SKILL.md). Follow referenced Networks and Contracts identities when the claim needs them.                     |
| MUSD issuance, debt, peg and protocol funds                              | `protocols/musd`; [shared MUSD](../mdk-musd-knowledge/SKILL.md), then borrowing or redemptions only for the selected flow.                                                    |
| Institutional custody and debt                                           | `protocols/musd/institutional-debt`; [institutional debt](../mdk-institutional-musd-debt/SKILL.md). Do not infer classic-borrowing rules from shared asset names.             |
| Savings principal, yield and product-specific gauge custody              | `protocols/musd/savings`; [Savings](../mdk-musd-savings/SKILL.md).                                                                                                            |
| Market lending and depositor vault claims                                | `protocols/lending/musdc` and `protocols/vaults/usdc-lending`; [lending](../mdk-musdc-lending/SKILL.md) and [vault](../mdk-usdc-lending-vault/SKILL.md) procedures as needed. |
| Liquidity positions, swaps and trading revenue                           | `protocols/pools` and `workflows/swaps`; [pools](../mdk-pool-liquidity-knowledge/SKILL.md) or [swaps](../mdk-swap-routing-knowledge/SKILL.md) for the selected mechanism.     |
| Locks, boost matching, voting domains, allocations, emissions and claims | `protocols/incentives`; [incentives](../mdk-incentives-knowledge/SKILL.md). Fee origin remains with its producing domain.                                                     |

For every material connection, establish:

- the asset/representation, network and quantity being tracked;
- who holds custody, owes debt, has a claim, or controls an allocation;
- what changes the quantity and what proves the resulting state;
- its source, deployment/time scope, and unresolved limitations.

Keep principal, collateral, debt, receipts, voting weight, fees and emissions
distinct. A custody transfer is not another principal balance. Trace redirected
yield to its beneficiary before attributing returns. Verify whether two uses of
an asset are separate positions or an explicitly evidenced pledge relationship.
Distinguish protocol-parameter authority, reward allocation and network consensus;
a similar use of the word "governance" does not make them the same mechanism.

## Resolve gaps and conflicts

Classify published design, dated deployed behavior, current observations and
supported SDK operations separately. Missing records or APIs do not prove a
Mezo feature absent. Conversely, a diagram, official overview or contract identity
does not qualify an executable route or a complete revenue lifecycle.

For an uncovered relationship, identify the missing claim and its intended owner,
then follow [knowledge retrieval](../../../docs/standards/knowledge-management.md#read-or-use-knowledge).
Consult authoritative sources for that gap. If prose and deployed evidence
disagree, preserve both scopes and resolve the relevant generation before making
the dependent claim; do not force all sources into a single timeless account.

For maintenance, use [knowledge maintenance](../mdk-knowledge-maintenance/SKILL.md)
and the owning domain procedure. Maintain relationships with their owners and
derive composition; do not copy formulas, addresses or governed values here.
Economic feedback loops do not authorize cyclic package dependencies.

For an observed change, use
[observed-change maintenance](../../../docs/standards/knowledge-management.md#react-to-an-observed-change)
to trace dependent explanations and procedures. A valid graph or link does not
prove that the economic assumption behind it still holds.

## Verify the answer or change

Explain the requested economic flow first, with source links and explicit gaps.
Use a diagram when it clarifies custody or value movement. Report architecture
coverage separately from SDK coverage and from what was actually verified.

For a conceptual answer, check the relevant relationships against scoped sources;
no wallet, live simulation or maintenance suite is implied. For architecture
verification, use independent source evidence rather than agreement among agents
reading the same explanation. For changed knowledge, run the owning structural,
semantic and projection checks. An executable workflow additionally needs its
current operation-specific evidence, authorization and reconciliation.
