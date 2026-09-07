# ADR-0011 — Mezo economic-system composition ownership

- Status: Accepted
- Date: 2026-08-23
- Accepted by: human direction to proceed with the economic-system composition review execution set on
  2026-08-23

## Context

Mezo's economic design is a flywheel: borrowing activity, protocol fees,
vault yield, redirected gauge revenue, veBTC voting, MEZO emissions, pools,
bridged assets, prices, and transaction settlement affect one another. MDK
nevertheless needs one canonical owner for each accounting model, deployment
identity, and lifecycle.

The earlier repository shape separated classic MUSD, incentives, pools,
bridges, prices, contracts, and transactions. That separation was technically
sound but incomplete. It had no owner for the native MUSD Savings product and
did not represent the later BTC/mUSDC Morpho market or USDC Lending Vault. A
single combined “flywheel” module would make the diagram easier to draw but
would merge incompatible quantities and evidence lifecycles.

## Decision

### Domain owners

The current economic system is represented by separately maintained modules:

| Domain | Canonical module owner |
| --- | --- |
| Classic MUSD model | `protocols/musd` |
| Classic MUSD borrower positions | `protocols/musd/borrowing` |
| Classic MUSD redemptions | `protocols/musd/redemptions` |
| Institutional MUSD debt | `protocols/musd/institutional-debt` |
| Native MUSD Savings accounting and fee ingress | `protocols/musd/savings` |
| BTC/mUSDC Morpho market accounting | `protocols/lending/musdc` |
| USDC Lending Vault, wrapper, and vault-specific gauge boundary | `protocols/vaults/usdc-lending` |
| ve locks, voting, generic gauges, emissions, and rewards | `protocols/incentives` |
| AMM and concentrated-liquidity state | `protocols/pools` |
| Asset representations and cross-chain delivery | `workflows/bridges` |
| Provider-neutral feed and price-datum semantics | `prices` |
| Deployments, proxies, source, and ABIs | `contracts` |
| Network identity and provider capability | `networks` |
| Transaction execution and reconciliation lifecycle | `workflows/transactions` |

The three new modules are v0.4 knowledge owners. Their initial support is
`none` or `proposed`, and their protocol and Contract records remain pending
qualified Level 3 review. Catalog membership does not promote them.

### Composition instead of merged accounting

Cross-domain edges use stable logical references. No composition document or
module may duplicate an address, ABI, formula, governed value, market state,
gauge weight, emission amount, price, or bridge mapping.

In particular:

- Savings assets, sMUSD balances, yield-index credits, and gauge stake do not
  enter classic MUSD troves, ICR/TCR, Recovery Mode, Stability Pool, or
  redemptions.
- mUSDC is a bridged USDC representation used as the loan asset in an
  independent Morpho market. It is not MUSD and has no MUSD redemption path.
- Borrower collateral/debt and market supply/borrow shares are owned by the
  lending module. Vault assets/shares, wrapper receipts, and withdrawable
  liquidity are owned by the vault module.
- A gauge-specific module owns what is staked and what yield is redirected.
  Incentives owns voting, weights, epochs, emissions, and generic reward
  accounting. A single position cannot count the same yield as both direct
  vault interest and redirected gauge revenue.
- Prices owns reusable feed semantics. Each consuming protocol owns how its
  deployed generation uses that price.

### Dependency direction

The knowledge dependency graph is acyclic at the ownership level:

```text
Networks + Contracts + Prices + Bridges + Transactions
                         ↓
       MUSD       mUSDC lending market       Incentives
         ↓                 ↓                    ↑
     MUSD Savings      USDC Lending Vault ─────┘
         └─────────────────┴────────────────────┐
                                               ↓
                              composed economic-system view
```

The bottom view is documentation and validation over logical references. It is
not a new protocol fact store. Protocol modules may consume generic incentives
and transaction requirements; incentives and transactions do not import the
consumer's accounting model.

## Alternatives

- Put the full flywheel in `protocols/incentives`: rejected because incentives
  does not own stablecoin debt, vault share accounting, lending interest, or
  bridge representations.
- Expand classic `protocols/musd` to include all vaults and mUSDC borrowing:
  rejected because mUSDC is an independent asset/market and Savings state is
  outside classic trove aggregates.
- Create one `protocols/earn` module for every product: rejected because it
  would become a second owner for formulas and mutable state already governed
  by MUSD, lending, vault, pools, and incentives modules.
- Keep only separate modules with no composition map: rejected because the
  repository would not express end-to-end flywheel edges or double-counting
  boundaries.

## Consequences

- Modules can evolve and be reviewed against the source generation that owns
  their semantics while the system remains understandable end to end.
- Cross-domain validators must resolve logical references and reject cycles,
  duplicate ownership, and quantity conflation.
- Product documentation and the Mezo Earn whitepaper remain design and product
  evidence, not deployment authority.
- Public readers or writers remain separate implementation decisions after
  knowledge, simulation, security, and release review.

## Acceptance gate

This decision accepts ownership and dependency direction only. At ADR
acceptance, Savings evidence review through vault evidence review still had to independently pin current
source, deployment, ABI, state, formula, lifecycle, and failure evidence; their
new Contract and protocol records were therefore proposed and pending
qualified Level 3 review.

## Implementation status

Savings evidence review and lending evidence review received qualified Level 3 acceptance on 2026-08-24;
vault evidence review received it on 2026-08-25. Their bounded knowledge models are
review-accepted while protocol support remains proposed and operation support
remains none. Contracts accepted the six scoped registry roots established by
those tasks. Runtime-discovered roles remain outside the registry when their
evidence does not satisfy an ADR-0005 provenance class. economic-system composition review owns final
cross-domain composition reconciliation and its independent review gate.
