# @mezo-dev-kit/musd-redemptions

Private mainnet SDK for classic MUSD redemptions: bounded queue discovery and
hints, exact-output simulation, direct redemption execution and receipt/state
reconciliation. See [the SDK reference](REFERENCE.md) for every method and type.

`createRedemptionReader` composes Borrowing's runtime, proxy, topology and native
oracle checks. It reads requested positions and protocol settlement state at one
block/hash. Quotes cap initial tail discovery separately from the contract's
iteration cap. `maxIterations` must be 1–64; zero's unbounded contract meaning is
never submitted. Quotes preserve requested, helper-truncated and attempted MUSD.
The default attempts the helper's truncated amount; `amountMode: "requested"`
retains an intentional unfilled remainder. Neither mode guarantees a fill.

`createRedemptionWriter` uses Core's prepare/simulate/submit/reconcile boundaries
and requires an explicit `RedemptionOutputSimulator`. The supplied
`createRedemptionTraceSimulator` uses read-only `debug_traceCall` with Geth
`callTracer` and `withLog`. The application must provide a compatible node,
request cancellation/timeouts, wallet gas policy, consent and durable atomic
submission storage. The public Boar endpoint returned method-not-found for this
trace capability when checked on 2026-09-08. There is no empty-call fallback.
The standalone trace adapter verifies call/chain/block identity and event output;
compose it with the reader/writer for protocol runtime and eligibility checks.

MUSD and native BTC use integer base units. Minimum actual MUSD, minimum net BTC,
maximum rate and freshness are checked before signing, including final exact
simulation. The contract has no minimum-received argument: inclusion state can
change output. Reconciliation reports `boundsSatisfied` alongside actual amounts;
a confirmed transaction outside those bounds must not be retried automatically.

Reconciliation checks canonical receipt and exact intent, actual burns, aggregate
collateral fee, gas reserve burns, full/partial positions, borrower surplus,
pending redistribution, system interest mint, pool balances/debt and native wallet
balance corrected by `gasUsed * effectiveGasPrice`. Required historical reads and
receipt fee fields must be available. Other changes to the same accounts/protocol
within the receipt block can make attribution ambiguous and cause rejection.
No approvals are needed: TroveManager burns MUSD under its protocol permission.

No legacy runtime dependency, liquidation writer, institutional debt mutation,
provider selection or automatic retry is included. Support remains proposed;
qualified protocol/native-engine review and release remain separate. Node runtime
is currently required by Borrowing's identity hashing.

Build the workspace before the opt-in integration harness:

```sh
node packages/protocols/musd-redemptions/test/fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL"
```

The harness requires a fresh local Anvil mainnet fork, uses a labelled captured
native-oracle fixture, mutates only localhost, and reverts its snapshot. It does
not qualify Mezo native dispatch or authorize source-chain transactions.

Canonical semantics remain in the [redemption module](../../../knowledge/protocols/musd/redemptions/index.json)
and [ADR-0020](../../../docs/decisions/0020-redemption-output-simulation.md).

The fork's MUSD funding uses the real token mint entrypoint with its authorized
caller impersonated only locally. This is fixture setup, not a public SDK mint API.
