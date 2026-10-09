# Locks, voting, and rewards

Locks, votes, and rewards are separate steps. Locking BTC or MEZO creates voting
power; votes direct reward allocation; reward contracts called gauges track
distribution and claims. A voting-power boost changes voting influence without
adding deposited principal.

This directory connects those steps and keeps pool, validator, and third-party
voting separate. It also distinguishes fees and payments to voters from newly
issued MEZO rewards, so they can be followed without counting the same value twice.

## Understand voting power and rewards

- [Incentives reference](generated/reference.md): locks, formulas, emissions, and validator allocation.
- [Concentrated-liquidity gauge claims](generated/reference.md#cl-gauge-claim-overloads): why the two `getReward` signatures allow different callers and pay different recipients.
- [MEZO Gauges and remote incentives](generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives): veMEZO voting, Curve/Uniswap LP rewards, Aerodrome voting incentives, and delivery evidence limits.
- [Current evidence guide](../../../docs/reference/incentives/current-evidence.md): deployment scope and known conflicts.
- [Recorded configuration](generated/reference.md#configuration-observation-catalog): which settings can change, what was observed, and when it was captured.
- [Official Earn whitepaper](artifacts/mezo-earn-whitepaper-2025-12.pdf): retained specification; use the evidence guide for differences from deployment.

## Limits to keep in mind

- **Rewards on other chains:** the third-party voting reference distinguishes
  rules checked against Mezo contracts from destinations described in published
  guides. Delivery to recipients on other chains has not been verified.
- **Changing reward contracts:** gauges distribute rewards, and factories can
  create new gauges and related reward contracts. The recorded instances show
  what existed when observed; they are not a permanent list of approved
  contracts. Look them up again through the relevant factory or voter before use.
- **Historical snapshots:** configuration reads and replayed transactions
  describe their recorded dates and blocks. Older examples use the contract
  interfaces active at those blocks, identified in the
  [historical contract-interface catalog](../../contracts/records/historical-abi-bindings.json).
  A past successful lock or vote does not establish that the same call works today.
- **Conflicting sources:** when a guide disagrees with the deployed contracts
  or recorded transaction results, the reference preserves the disagreement and
  uses the deployed behavior for that contract version.
- **Reward estimates:** locked principal, stored and current voting-power
  boosts, payments to voters, fees, and newly issued rewards are separate
  quantities. Yield forecasts and portfolio projections are outside this module.

## Use incentives in an application

Start with the [Incentives SDK](../../../packages/protocols/incentives/README.md)
for private reads, calculations, locks, votes, staking and claims. Its
[API reference](../../../packages/protocols/incentives/REFERENCE.md) explains
which reader and writer to use; the protocol reference above explains the rules
those operations must follow.

These implementations have operation-specific limits and release reviews still
required. Sending a transaction also requires
current chain checks and simulation of the exact call. The
[evidence and support guide](../../README.md#evidence-review-and-support)
explains what review labels mean; each reference identifies the contract versions
and observations covered by its acceptance.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
