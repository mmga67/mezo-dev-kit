# ADR-0019 — Institutional debt reads and accounting

- Status: Accepted for private implementation under the full-SDK task
- Date: 2026-09-08

Institutional debt has distinct Enclave custody, principal, fee, pledge and health
rules. A private `@mezo-dev-kit/musd-institutional-debt` package owns deterministic
calculations and a coherent read facade. It depends on EVM, Chains, Contracts and
Core, with no wallet or new external dependency. Existing canonical institutional
knowledge and registry identities own constants, generations, source and ABIs.

Read only caller-selected bounded position IDs and target-selector pairs. Totals
come from the debt manager's independent accumulators; a requested position subset
is never a full system inventory. Verify root runtime and proxy generations,
dependency getters, pledged veBTC ownership/mapping, fee calculations and final
chain/block identity. Preserve optional price/health failure explicitly while
retaining verified debt and collateral. The deployed price path remains the
health authority; a timestamped observation is not an execution freshness promise.

The original and second Enclave generations have distinct roles and target
exclusions. Role membership and an allowlisted selector are observations, not
transaction authorization or proof that a call succeeds. Recorded triparty UTXOs
are not Bitcoin unspent-state or off-chain custody verification. Partner-controlled
writers, liquidation, combined backing ratios and publication remain separate.
