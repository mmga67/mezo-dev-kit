# MUSD System Reference

Status: derived from supported, accepted canonical knowledge.

This page is the human reading path for the MUSD system architecture. The
machine-readable source is `knowledge/protocols/musd/`; deployments and ABIs
remain in `knowledge/contracts/`.

## Mental Model

MUSD's classic debt engine is organized around borrower-address-keyed troves.
BorrowerOperations orchestrates user actions, TroveManager owns position and
redistribution state, and the pool contracts account for collateral and debt in
their respective lifecycle states. Supporting contracts provide protocol
prices, position ordering/hints, fixed simple-interest accrual, signature
relaying, governance configuration, and PCV management.

Canonical resources in the `protocols/musd` module:

- component roles and relationships: `musd-components`;
- precise meanings of trove, principal, interest, pending rewards, ICR, NICR,
  TCR, StabilityPool deposit, and PCV: `musd-terminology`;
- system relationships, units, parameter ownership, and future module boundary:
  `musd-system-model`.

## State Boundaries That Matter

The classic system aggregate is narrower than “all MUSD activity.” Its tracked
collateral and debt come from ActivePool and DefaultPool. A separate product,
indexer aggregate, raw contract balance, market price, or analytics fallback
must not be folded into TCR without a separately verified protocol rule.

A trove read also has two layers: stored active state and pending redistributed
state. “Entire” collateral/debt includes the pending layer, and current interest
depends on the read timestamp. Integrations should therefore preserve block and
timestamp provenance instead of returning an unexplained decimal.

See the atomic claims `musd-accounted-not-raw-balances`,
`musd-system-aggregate-boundary`, `musd-default-pool-redistribution`, and
`musd-fixed-simple-interest` in the `musd-system-model` resource.

## Parameters And Deployments

The model distinguishes compile-time constants, governed state, and deployment
bindings. Initial values in Solidity or values shown in product documentation
must not substitute for current block-pinned reads when a parameter is mutable.
Use stable `musd.*` contract IDs and resolve the selected network through the
contract registry; do not copy addresses into a protocol module or guide.

Borrowing, collateral adjustment, liquidation, and exact collateral/debt
parameter knowledge is owned by `protocols/musd/borrowing`. Redemption
selection, quoting, fees, hints, and execution knowledge is owned by
`protocols/musd/redemptions`. Both knowledge modules are accepted; neither
acceptance state implies that MDK ships a public transaction writer.

## Future SDK Shape

The recorded future boundary is intentionally small:

- pure terminology, typed state, units, and deterministic calculations;
- separate block-pinned RPC readers that resolve stable contract IDs;
- transaction/workflow modules added only after their separate capability
  gates are accepted;
- framework adapters consuming those APIs rather than reimplementing protocol
  behavior.

The complete boundary is `futureModuleBoundary` in the `musd-system-model`
resource. Accepting the knowledge does not create a package or public API.

## Evidence And Limitations

The source catalog pins the official Mezo documentation and MUSD contract
commit, records exact file digests, and includes fixed-block `decimals()` reads
for both supported deployments. Product read models, market-oracle fallbacks,
broad backing copy, and named fee-recipient language are not protocol
invariants.

The knowledge records are `supportStatus: supported` and
`reviewStatus: accepted`. Mutable protocol state must still be resolved at an
explicit current block where the consuming workflow requires freshness.
