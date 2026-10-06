# Swap and routing gaps

## Private quote comparison qualification

The private [Swaps reference](../../../../packages/swaps/REFERENCE.md) now defines
a writer-free quote subpath and bounded basic/CL candidate comparison. Existing
readers own generation, discovery and math. Required/optional failures, explicit
display-versus-writer-compatible eligibility, per-hop fee units and common
coordinate/freshness checks are implementation contracts awaiting qualification.
Numeric marginal price impact remains unavailable pending an owning Pools
reference; gas/currency conversion is not assumed. This does not alter accepted
execution ranking, route evidence dates or canonical support status.

## Accepted knowledge and wider requirements

The Contracts-owned [legacy candidate qualification](../../../contracts/artifacts/legacy-swap-qualification-2026-10-06.json)
reproduces the legacy Universal Router with solc 0.8.29 and Quoter with solc 0.7.6.
Full ABIs, creation inputs and deployed runtimes match within the recorded scope;
runtime immutables are independently bound to constructor values. A provider
trace identifies the Router's internal creation, while the factory source remains
unverified. Three bounded historical swaps and two Quoter comparisons are retained.
These are proposed candidates pending qualified review, with no canonical target,
route or writer admission. Native payment, Permit2 fallback and legacy whole-router
balance continuation remain unqualified.

- Qualified Level 3 review accepted the bounded knowledge model on 2026-08-25;
  the module still exposes no public reader or writer.
- Current official documentation still supplies no Quoter or Universal Router
  coordinate. The separately qualified legacy candidates do not establish
  official application endorsement or supported targets.
- Atomic mixed basic/CL routing is unsupported because the current routers are
  separate transaction destinations with different encodings and custody
  semantics.
- CL `exactInput` multi-hop encoding is source-verified but lacks a pinned
  historical execution/reconciliation observation in this bootstrap.
- Basic fee-on-transfer variants, the unsafe caller-supplied-amount method, CL
  exact-output variants, broad sweep/refund methods, multicall, self-permit,
  native-value paths, and Permit2-style flows remain disabled.
- A future public implementation must choose and approve an EVM client
  dependency, define typed route/quote/simulation interfaces, prove provider
  capabilities, add integration tests, and pass a separate qualified review.
- Current use must refresh router/factory code, deployment validity, dynamic
  pool mappings, fees/liquidity, allowances/balances, quote freshness,
  deadline, exact calldata simulation, and reconciliation evidence.

## Private wider asset and continuation qualification

The private Swaps/Pools profile now includes the Contracts-owned mUSDT generation.
Its [independent source reproduction](../../../contracts/artifacts/musdt-token-runtime/source-reproduction-2026-10-06.json)
now verifies both proxy and implementation creation, full ABI and runtime bytes,
including the independently read proxy-admin immutable. This resolves the
original missing-compiler evidence gap; qualified release review remains pending.
Writer compatibility remains an affirmative per-token check, independent of
read-only candidate ranking. The maintained Swaps mixed-recovery example models
separately consented basic/CL transactions with re-reconciled first-leg custody,
durable checkpoints, realized intermediate amounts and uncertain submission
retention. It adds no router, storage adapter or package export. Public release
and qualified protocol review remain separate from private verification.

The 2026-09-13 private fork qualification exercised both directions of two-hop
basic and CL paths, plus rejected-second-leg recovery in both router orders.
Its parent is the block retained by the [mUSDT profile](../../../contracts/records/musdt-token-runtime.json).
The mUSDC/mUSDT CL pool was created only on the fork; the existing MUSD/mUSDC
spacing-1 pool required locally added active liquidity. These fixtures preserve
deployed code and exact per-hop settlement, without establishing a historical
mainnet multi-hop execution or current liquid route. Native-engine execution
remains outside this qualification.
