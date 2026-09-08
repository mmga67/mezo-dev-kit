# USDC Lending Vault SDK

See the [SDK reference](REFERENCE.md) for reader, calculation and writer methods, approvals, results, errors, and examples.

Private source-alpha reader under vault reader review, accepted on 2026-09-07.
Import `@mezo-dev-kit/usdc-lending-vault` after building the workspace.

`createVaultReader(config).read({ account, blockNumber?, maxPriceAgeSeconds,
previewAssets, previewShares })` returns a single block number/hash/timestamp.
Configuration accepts public Contracts, an application-owned ABI codec, and
`VaultTransport`. This extends the lending transport contract: `read` must also
accept discovered-role addresses with no `contractId`. Scalars decode to bigint
or address strings; tuple/multiple outputs decode to ordered arrays. Every
transport method must honor its explicit coordinate.

The package composes the public mUSDC lending reader for the adapter's position.
It resolves the wrapper and market adapter through Contracts, discovers VaultV2
and VaultGauge from runtime getters, and requires exact runtime/source profiles.
VaultV2 and VaultGauge have no fabricated static registry identity. Unknown
vault/root runtime rejects; an unknown gauge remains a typed unavailable role
without calling its interface. Back-link conflicts and reorgs reject the entire
logical snapshot. The accepted shape has one adapter, one lending market, and a
configured gauge; another queue, market, or missing gauge requires new evidence.

Vault assets already include the adapter's Morpho assets. The result exposes
those observations and their allocation reconciliation separately. Idle mUSDC,
Morpho token liquidity, and accounting liquidity are distinct. No value returned
here is a transaction capacity guarantee. The generation's zero-returning
`max*` getters are not used as capacity estimates; gates, allocation caps,
timelocks, penalties, and operation-specific simulation remain outside this
reader's operation support.

`vaultState` contains the fee shares and new total assets from
`accrueInterestView`. Pure `previewVaultConversion` uses those explicit inputs
and the VaultV2 virtual-share term, with deposit/redeem rounding down and
mint/withdraw rounding up. Reader previews compare these calculations to the
vault's own four preview views. Missing fee-aware state prevents derived asset
estimates. These previews do not execute or approve an operation.

Wrapper-held VaultV2 shares include accumulated yield. `userVaultShares`
subtracts it; harvest projects only appreciation above the gauge high-water
mark. Receipt claims use the post-harvest user shares and the wrapper's separate
virtual terms. Wallet wrapper receipts plus gauge beneficial stake are counted
once; gauge custody can include donations and is never added as another user
position. Direct wallet VaultV2 shares are reported separately. Redirected
VaultV2-share revenue, accumulated yield, and earned gauge-token rewards retain
distinct owners and units.

`calculateVaultHarvest` also models the pre-gauge baseline case: it follows the
current ratio without earmarking yield. With a gauge, the high-water mark never
decreases. Pure helpers accept bigint and check uint256 intermediate bounds.
The underlying lending result retains its explicit price-freshness policy and
partial-read errors, even though a supply-only vault position has no borrower
debt. No price fallback or wall-clock freshness claim is inferred.

Canonical owners are `protocols/vaults/usdc-lending`, `protocols/lending/musdc`,
`contracts`, `networks`, `protocols/incentives`, and `workflows/bridges`. Runtime
code imports generated projections and public packages, not repository
knowledge. From the repository root:

```sh
node scripts/generate-vault-package.ts
pnpm --filter @mezo-dev-kit/usdc-lending-vault check
pnpm --filter @mezo-dev-kit/usdc-lending-vault test:shuffle
pnpm check:readers:mainnet
```

See the [evidence refresh guide](../../../docs/guides/oracle-evidence-refresh.md).
Oracle refresh does not extend vault model/source review dates. Snapshot evidence
dates and digests identify the bounded inputs; the bounded interface is accepted and final alpha
promotion remains pending. Tests compose real MDK readers with synthetic ports
and hash-verified runtime bytes, not a certified production provider/ABI codec.
Node crypto is required; browser bundling and package-registry distribution are
not certified. Private deposit/mint/withdraw/redeem and wrap-and-stake/unwrap writers now compose Core and Tokens. Incentives owns direct gauge staking and reward claims. Qualified protocol review remains required before release; curator allocation is outside this API.

## Inspect this checkout

Use the [manifest](./package.json) and [exported entrypoint](./src/index.ts)
alongside this package's scope and injected-input contract. Build before
interpreting a missing artifact as an absent API. The [usage example](../../../examples/usdc-lending-vault-readonly/README.md)
exercises the workspace boundary. Reassess these owners after checkout changes;
private versions alone do not identify capability changes. Follow the
[capability guidance maintenance rule](../../../CONTRIBUTING.md#keep-capability-guidance-current)
when the public boundary, required inputs, or evidence dependencies change.
