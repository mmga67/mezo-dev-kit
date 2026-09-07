# Institutional MUSD debt reference

> Generated from canonical `protocols/musd/institutional-debt` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`
- Support: `proposed`
- Review: `accepted`
- Evidence block: Mezo Mainnet `11334441` (`0xf71561f21fcb92e0c58b41afc214c30d647c74acb2ca311824fe4f701344192c`) at `2026-08-23T13:00:04.000Z`
- Writers: none
- Readers: no public facade implemented

## Ownership boundary

- An Enclave is an institutional custody/execution vault, not a classic borrower-keyed trove.
- The two live Enclave generations are not one ABI identity merely because both delegate institutional positions to the same debt manager.
- The debt manager's proxy upgrade history is one logical deployment identity with generation-bounded behavior; repayAll exists only in the current implementation generation.
- Assets held, bridged, transferred, approved, locked, or withdrawn by an Enclave are not debt-manager collateral or debt changes unless the debt-manager position call/event/post-state establishes that mutation.

## Enclave generations

| Generation | Targets at evidence block | Debt-manager selectors | Triparty UTXOs |
| --- | ---: | ---: | ---: |
| `original` | 36 | 10 | 2 |
| `second` | 24 | 1 | 1 |

- Execution: EXECUTOR_ROLE may invoke only a currently allowed exact (target, bytes4 selector) pair. executeBatch preserves input order and reverts atomically when any call fails or array lengths differ.
- Allowlist: Target authorization is the exact target-plus-selector pair at a current block. Past TargetAdded events and ABI functions are candidate history, not current authorization.
- veBTC custody: veBTC token IDs are owned/custodied by the Enclave. A token ID becomes debt collateral only while explicitly pledged in an active debt-manager position.

## Position and accounting model

- `principal`: Outstanding institutional principal only.
- `interest`: Time-proportional debt fee at the position interest rate; settled interest is minted to PCV.
- `originator-fee`: Time-proportional fee at the position originator rate; settled fee is minted to the recorded originator.
- `total-minted-debt`: Cumulative institutional principal minted, separate from fee minting.
- `total-debt-burned`: Cumulative institutional principal repaid and burned.
- `total-fee-settled`: Cumulative system fee debt settled; distinct from principal burned and fee tokens minted.
- `pledged-vebtc`: Custodied veBTC explicitly pledged to an active position; not all Enclave assets.

### Fixed-block read summary

- Known positions: 3
- Active positions: 2
- Closed by repayment: 1
- Institutional principal: `14500000000000000000000000`
- Cumulative principal minted: `25088622000000000000000000`
- Cumulative principal burned: `10588622000000000000000000`
- Institutional outstanding debt: `14519656304892817278424100`

## Deterministic formulas

| Formula | Expression |
| --- | --- |
| `simple-fee` | floor(elapsedSeconds * principal * rateBps / (basisPoints * secondsInYear)) |
| `position-total-debt` | principal + storedInterest + newlyAccruedInterest + storedOriginatorFee + newlyAccruedOriginatorFee |
| `pledged-collateral` | sum(veBTC.locked(tokenId).amount for every pledged tokenId) |
| `collateral-ratio` | debt == 0 ? maxUint256 : floor(collateral * price / debt) |
| `position-health` | belowWarning = currentCR < warningCR; belowMinimum = currentCR < minimumCR |
| `repayment-split` | require payment >= totalFees; principalPayment = payment - totalFees; require principalPayment <= principal; remainingPrincipal = principal - principalPayment |
| `combined-rate` | interestRateBps + originatorFeeRateBps <= maxCombinedRateBps |
| `outstanding-debt` | totalPrincipal + max(totalFeesStored + combinedAccumulatorAccrued - totalFeeSettled, 0) |
| `principal-conservation` | totalMintedDebt - totalDebtBurned == totalPrincipal |
| `aggregate-separation` | classicDebt and institutionalOutstandingDebt remain separately named; no combined product ratio exists without a separately accepted definition |

### Fixture coverage

| Fixture | Operation |
| --- | --- |
| `interest-one-protocol-year` | `simple-fee` |
| `interest-rounds-down-to-zero` | `simple-fee` |
| `interest-thirty-days` | `simple-fee` |
| `position-total-debt` | `position-total-debt` |
| `pledged-collateral-sum` | `pledged-collateral` |
| `collateral-ratio-exact-warning` | `collateral-ratio` |
| `collateral-ratio-zero-debt` | `collateral-ratio` |
| `health-at-minimum` | `position-health` |
| `health-one-wei-below-minimum` | `position-health` |
| `repayment-fees-first` | `repayment-split` |
| `repayment-below-fees` | `repayment-split` |
| `repayment-exceeds-principal` | `repayment-split` |
| `combined-rate-at-cap` | `combined-rate` |
| `combined-rate-above-cap` | `combined-rate` |
| `outstanding-fee-clamp` | `outstanding-debt` |
| `principal-conservation-fixed-block` | `principal-conservation` |
| `classic-institutional-separation` | `aggregate-separation` |

## Classic versus institutional

Keep classic TCR and institutional collateral ratios separate. A combined or product-wide ratio requires an accepted owner, exact numerator/denominator, valuation coordinate, inclusion policy, and evidence; none is accepted by this module.

The ledgers remain separate even though both can affect the same MUSD token supply through separately authorized paths.

## Future operation gates

### execute-enclave-call

- resolve exact Enclave generation and current proxy implementation
- verify EXECUTOR_ROLE at the target block
- verify exact current target-selector authorization
- reject AssetsBridge/veBTC generic execution where the generation forbids it
- simulate the exact sender/value/calldata and reconcile asset plus protocol post-state

### execute-enclave-batch

- apply every single-call requirement to every ordered element
- require equal array lengths
- treat the batch as atomic and reconcile every expected delta

### request-triparty-bridge

- use the generation-specific BTC_MANAGER_ROLE or BRIDGE_MANAGER_ROLE
- verify the UTXO key is unused
- apply the bridge module's current provider/asset/route boundary
- do not treat bridge completion or asset movement as a debt-position mutation

### open-or-mutate-position

- verify the calling Enclave has ENCLAVE_ROLE
- verify the position is bound to that Enclave
- read pause, mint cap, rates, thresholds, price, ownership, pledge mappings, and current totals at one block
- verify the Enclave target-selector pair independently
- simulate the exact call and reconcile debt-manager events, MUSD mint/burn, position, pledge, and total post-state

### repay-position

- accrue and settle fees before principal
- reject a payment below fees or a principal remainder above outstanding principal
- for repayAll require the v2 implementation generation
- reconcile fee recipients, burned MUSD, principal, pledge release, closure, and aggregates

## Evidence

- Fixed-block Enclaves: 2
- Reproduced implementation generations: 4
- Current logical ABI identities: 3

See `review/gaps.md` before relying on any proposed identity or rule.
