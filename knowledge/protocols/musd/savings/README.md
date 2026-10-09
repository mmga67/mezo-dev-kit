# MUSD Savings

In the contract generation covered by the accepted evidence, Savings separates
deposited MUSD principal from the yield it earns. A deposit creates a receipt
for the principal; yield is tracked and paid separately.
Staking the receipt in a rewards contract called a gauge changes its custody
and reward flow, without creating a second deposit.

Use this directory to understand those balances, follow yield distributions,
and distinguish wallet holdings from a user's gauge stake. Savings balances
are separate from the borrower positions and collateral accounting used by
classic MUSD borrowing.

The official product page describes a different receipt-value model. The
[source conflict review](review/source-conflicts.md) compares that description
with recorded withdrawals and source. It also identifies the October 8 generation
check as candidate evidence awaiting review; the older accounting evidence has
not been renewed by that check.

## Follow the money

Start with a deposit. In the recorded model it creates sMUSD, a receipt for
the deposited MUSD principal. Yield is accounted for separately through an
index that tracks distributions. A receipt balance and claimable yield therefore
answer different questions: how much principal the receipt represents, and how
much yield is available to claim. The [Savings reference](generated/reference.md)
shows the accounting and its evidence scope.

Staking moves the receipt into a gauge, the rewards contract. The user still
has a beneficial stake in that principal; adding the staked amount to the same
receipt's former wallet balance would count it twice. Staking also affects
where yield goes, while MEZO rewards remain a separate asset and calculation.
[Incentives](../../incentives/README.md) explains those reward and voting rules.

To withdraw principal through the SDK, first unstake any receipts held in the
gauge. Claiming yield is a separate workflow from withdrawing principal.
These balances do not enter classic borrower collateral ratios, the Stability
Pool or the redemption queue; the
[MUSD explanation](../../../../docs/reference/musd-system.md) shows that wider boundary.

## Use Savings in an application

The [Savings SDK](../../../../packages/protocols/musd-savings/README.md) provides
reads, calculations, and private deposit, withdrawal, and yield-claim workflows.
Its package documentation identifies the reviewed reader scope and the
transaction workflows still awaiting release review.

Each observation applies to its recorded contract version and block. Check that
scope before using a formula or balance with another version; a past observation
does not establish today's available state. The shared
[evidence and support guide](../../../README.md#evidence-review-and-support)
explains how to read those qualifications.

## Quick links

| Link                                                                 | What you will find                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Savings reference](generated/reference.md)                          | Principal receipts, yield accounting and recorded observations.                                  |
| [Source disagreement](review/source-conflicts.md)                    | Published receipt-value claims, historical contract evidence and the candidate generation check. |
| [Savings SDK](../../../../packages/protocols/musd-savings/README.md) | Reads, calculations, deposit, withdrawal and yield-claim workflows.                              |
| [Incentives](../../incentives/README.md)                             | Gauge custody, rewards and voting.                                                               |
| [MUSD explanation](../../../../docs/reference/musd-system.md)        | How Savings relates to the other MUSD activities.                                                |
| [Module index](index.json)                                           | Exact accounting, role, evidence and review records.                                             |

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
