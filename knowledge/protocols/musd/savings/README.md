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

- **How are principal and yield recorded?** The [Savings reference](generated/reference.md)
  explains receipt balances, yield calculations, and how to avoid counting the
  same principal twice.
- **What changes when I stake?** [Incentives](../../incentives/README.md) explains
  gauge rewards and voting; principal, redirected yield, and MEZO rewards remain
  separate quantities.
- **Where does Savings fit?** The [MUSD explanation](../../../../docs/reference/musd-system.md)
  connects Savings to the wider system. Savings does not enter borrower collateral
  ratios, the Stability Pool, or the redemption queue.

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

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.
