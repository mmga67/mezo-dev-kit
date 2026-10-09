# Incentive revenue and authority review

Evidence dispositions accepted October 9, 2026, for the October 8 source review.
Passive-fee settlement and current authority remain unqualified. Use the retained whitepaper for intended
economics, `incentives-emissions` for its evidence-scoped executable partition,
and `incentives-source-conflicts` for governance/rebase qualifications. The Earn
overview snapshot is owned by resource `musd-revenue-docs-2026-10-08` in
`protocols/musd`; it describes passive chain/bridge revenue without qualifying
the complete payout lifecycle.

| Branch                                                   | Asset, beneficiary and custody                                                                                 | State and evidence boundary                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pool fees / product yield → associated voters            | Fee assets or product-specific yield receipts; producing domain owns accounting and gauge custody              | Collected fees, notified voting rewards, accrued entitlement and claimed transfers are separate. A staked receipt cannot also earn the same direct yield for its wallet holder.                                                                                                              |
| Chain / bridge activity → passive veBTC revenue          | Published revenue to eligible veBTC holders; exact fee-origin and denomination mapping remains to be qualified | Contract names such as ChainFeeSplitter or VeBTCRewardsDistributor are not proof of a source-to-recipient cash flow. Need fee collection, asset-specific splits, checkpoint weights, custody, claim eligibility and settled payout evidence. No current amount, ratio or payout is asserted. |
| MEZO issuance → rebase plus reward branches              | MEZO; one emission budget divided between branches                                                             | `incentives-emissions` owns integer arithmetic, caps, epoch and source-generation scope. Rebase is not an additional mint on top of that budget.                                                                                                                                             |
| Reward allocation → validator / product / external gauge | MEZO; independent allocation domains and beneficiaries                                                         | Allocation, lazy accrual, notification, stream and claim are distinct. Product principal and underlying fees are not MEZO emissions.                                                                                                                                                         |
| External gauge beneficiary → destination incentives      | MEZO at source; destination venue-specific incentive distribution                                              | `incentives-third-party-voting-rewards` describes observed source allocation and published remote distribution. A source transfer cannot establish bridged arrival or LP/voter payment at the remote venue.                                                                                  |

Protocol parameter authority remains distinct from gauge voting. veMEZO has
independent boost and external-gauge allocation domains; that does not grant
general protocol-governance power. Published splitter adjustability is
conflicting, as recorded in the source-conflict review. A callable setter or a
voter contract address does not prove that users can change a current ratio.

The passive-fee edge and current governance authority remain owned,
unqualified gaps. Qualifying them requires compatible deployment/source
generations and bounded fee-origin-to-claim observations, followed by qualified
review. The economic inventory exposes these gaps instead of silently omitting
them or treating the whitepaper as a live balance sheet.
