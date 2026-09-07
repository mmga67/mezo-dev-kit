# Swap and routing gaps

- Qualified Level 3 review accepted the bounded knowledge model on 2026-08-25;
  the module still exposes no public reader or writer.
- No current official Mezo Quoter or Universal Router deployment was
  established.
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
