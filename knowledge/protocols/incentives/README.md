# Locks, voting, and rewards

Locks, votes, and rewards are separate steps. Locking BTC or MEZO creates voting
power; votes direct reward allocation; reward contracts called gauges track
distribution and claims. A voting-power boost changes voting influence without
adding deposited principal.

This directory connects those steps and keeps pool, validator, and third-party
voting separate. It also distinguishes fees and payments to voters from newly
issued MEZO rewards, so they can be followed without counting the same value twice.

## Understand voting power and rewards

Begin with the lock. The names veBTC and veMEZO refer to voting positions
associated with locked BTC and MEZO. Their voting power is different from the
amount locked. A veMEZO boost can change effective veBTC voting power without
adding BTC principal. The [incentives reference](generated/reference.md)
contains the recorded lock and boost formulas.

Next choose the voting system. Pool voting and validator voting maintain
independent allocations; a vote in one is not a vote in the other. The
[MEZO Gauges system](generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives)
uses a separate veMEZO voting model for third-party incentives. Its reference
distinguishes behavior checked on Mezo from reward destinations described in
published guides.

Finally, follow the reward from allocation to payment. A gauge is the rewards
contract that tracks distribution and claims. An allocated weight, an amount
available for distribution, a user's earned reward and a completed payment are
different stages. Fees and other payments to voters also need to stay separate
from newly issued MEZO rewards, called emissions.

Claiming depends on the particular gauge and caller. For concentrated-liquidity
(CL) positions, the [claim reference](generated/reference.md#cl-gauge-claim-overloads)
explains why two methods named `getReward` have different inputs, permitted
callers and recipients. Use the exact method's rules rather than assuming
all reward claims work alike.

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

## Quick links

| Link                                                                                  | What you will find                                                   |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [Incentives reference](generated/reference.md)                                        | Locks, boosts, voting, emissions and reward calculations.            |
| [CL gauge claims](generated/reference.md#cl-gauge-claim-overloads)                    | Caller and recipient rules for the two claim methods.                |
| [MEZO Gauges](generated/reference.md#mezo-gauges-vemezo-voting-and-remote-incentives) | Third-party voting, remote incentives and delivery evidence limits.  |
| [Recorded configuration](generated/reference.md#configuration-observation-catalog)    | Changeable settings, observed values and capture dates.              |
| [Evidence guide](../../../docs/reference/incentives/current-evidence.md)              | Deployment scope, source disagreements and known gaps.               |
| [Earn whitepaper](artifacts/mezo-earn-whitepaper-2025-12.pdf)                         | The saved design specification; compare it with deployment evidence. |
| [Incentives SDK](../../../packages/protocols/incentives/README.md)                    | Reads, calculations, locks, votes, staking and claims.               |
| [Module index](index.json)                                                            | Exact model, source, configuration and evidence records.             |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
