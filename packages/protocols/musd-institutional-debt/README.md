# Institutional MUSD debt

Private read-only Enclave and institutional debt SDK. The
[SDK reference](REFERENCE.md) documents every exported method and type.

`createInstitutionalReader` verifies mainnet debt-manager/Enclave proxy generations,
veBTC and MUSD dependencies, requested position debt and pledged collateral,
independent aggregate fees, and receipt-free block/hash coherence. It reads up to
16 caller-selected position IDs, or up to 32 exact target-selector pairs for one
Enclave generation. Recorded UTXOs are optional and explicitly bounded.

Pure helpers preserve the deployed year length, basis-point rates, separate fee
floors, fee-first repayment, aggregate rounding clamp, strict health thresholds
and zero-debt ratio sentinel. This accounting stays separate from classic troves,
Recovery Mode, Savings, bridge delivery and gauge rewards.

A failed optional protocol price call leaves verified debt/collateral available
and marks price/health unavailable. Malformed data, required read failures,
identity changes or accounting disagreement reject the snapshot. A current role
or allowlisted selector is not execution authorization or simulation. UTXO records
do not establish Bitcoin unspent-state, off-chain custody or a backing ratio.

No partner writer or liquidation operation is implemented. The package remains
private Node source; qualified review and release remain outstanding. Source and
runtime evidence are owned by the indexed institutional and Contracts modules.

```sh
pnpm --filter @mezo-dev-kit/musd-institutional-debt check
pnpm build
node packages/protocols/musd-institutional-debt/test/live.ts "$READ_ONLY_MAINNET_RPC"
```

The opt-in probe calls only read methods, verifies positions and both Enclave
generations at one block, and exercises optional-price failure and runtime
rejection through explicit transport fixtures. Default tests stay offline.
