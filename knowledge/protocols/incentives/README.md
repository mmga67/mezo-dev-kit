# Locks, voting, and rewards

Understand veBTC and veMEZO locks, boost, pool and validator voting, gauges, emissions, and claims. This module keeps each voting and reward domain’s accounting explicit.

## Start here

- [Incentives reference](generated/reference.md): locks, formulas, emissions, and validator allocation.
- [CL gauge claims](generated/reference.md#cl-gauge-claim-overloads): caller, recipient, and overload-specific behavior.
- [MEZO Gauges and remote incentives](generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives): veMEZO voting, Curve/Uniswap LP rewards, Aerodrome voting incentives, and delivery evidence limits.
- [Current evidence guide](../../../docs/reference/incentives/current-evidence.md): deployment scope and known conflicts.
- [Incentives SDK](../../../packages/protocols/incentives/README.md): private reads, calculations, lock/vote, staking, and claim workflows.
- [Official Earn whitepaper](artifacts/mezo-earn-whitepaper-2025-12.pdf): retained specification; use the evidence guide for differences from deployment.

## Scope and evidence

The earlier lock, boost, emission, pool and validator models have qualified
review, but module support is `none`: operation release requires its own review.
The third-party voting model also has qualified review; its reference
separates deployed rules, published destination descriptions and unverified
delivery. Dynamic gauges and reward children are observations, not independently
maintained registry roots.

Current deployed generations and settled events take precedence over conflicting
descriptive guides. Historical lock/vote replay proves only those recorded
transitions. Keep principal, stored/current boost, voter revenue, fees, and
emissions separate; APY forecasts and portfolio projections are outside this module.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
