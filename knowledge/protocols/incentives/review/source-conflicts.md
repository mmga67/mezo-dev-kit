# Incentives source conflict review

Source review dated 2026-10-08; its bounded dispositions were accepted on
2026-10-09. The [pinned official pages](../artifacts/official-docs-2026-10-08.json)
retain documentation commit `ddbca2cd013092a4c637be69356695945e20bf8b`.
Published descriptions, observed configuration and executable capabilities
establish different claims; this review does not promote current operations.

## veMEZO governance and allocation voting

The [governance page](https://mezo.org/docs/users/mezo/governance/)
separates protocol-parameter governance from independent veMEZO boost-gauge
and MEZO Gauge voting. The [MEZO Gauges page](https://mezo.org/docs/users/mezo-earn/vote/mezo-gauges/)
describes veMEZO allocating incentives to external pools independently of
boost matching. The accepted [third-party voting model](../records/third-party-voting-rewards.json)
and its linked September evidence preserve that allocation scope and the
unverified remote-delivery boundary.

**Disposition:** distinguish the voting domains. The narrow governance
statement does not imply veMEZO lacks every independent vote. Keep protocol
parameter authority, product/validator allocation, boost voting and external
allocation separate. This is consistent with the retained voting model;
no new authority or general proposal system is established here.

## Splitter adjustability

The governance page presents the splitter ratios as currently fixed and
describes future adjustability. The MEZO Gauges page attributes the external
allocation share to veBTC voting through a splitter. Meanwhile, the accepted
[emission model](../records/emissions.json) describes bounded needle changes
through the splitters' epoch governors; its source/evidence references establish
the executable rules at their recorded coordinates.

**Disposition: unresolved published/configuration distinction.** Preserve the
documented policy and scoped executable capability separately. A change method
does not prove an available user governance process, nor does public prose
prove an executable ratio immutable. Resolve governor roles, enabled state,
epoch conditions and actual configuration at the intended block before a
current adjustability claim. This review performed no new splitter state read.

## Rebase input

The retained [whitepaper](../artifacts/mezo-earn-whitepaper-2025-12.pdf)
describes a locked-supply input. The accepted emission record and linked
evidence instead establish prior-boundary unboosted, time-decayed voting power
for the recorded minter generation. The distinction is already recorded in
`incentives-emissions`; this review does not create a second formula owner.

**Disposition:** keep the specification/deployment conflict explicit. Use the
recorded executable input for that generation; do not reinterpret it as locked
principal or assume a newly observed generation behaves identically.

## Affected consumers

- The system explanation and skills must preserve distinct voting domains and
  source/generation qualifications.
- Revenue and relationship records must not turn a published ratio or a getter
  into an immutable rule, a public governance capability or a delivered payout.
- Existing formulas and deployment records remain unchanged. Broader current
  authority claims need scoped evidence and qualified review.

Resolution owner: `protocols/incentives`. Splitter current-state qualification
remains open; the governance wording distinction and existing rebase conflict
can be used in their stated scopes without inventing that missing qualification.
