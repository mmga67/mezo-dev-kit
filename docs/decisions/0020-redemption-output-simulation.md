# ADR-0020 — Redemption output simulation

- Status: Accepted for private implementation under the full-SDK task
- Date: 2026-09-08

MUSD redemption is a separate workflow over classic Borrowing state and math.
A private `@mezo-dev-kit/musd-redemptions` package owns bounded queue/hint inputs,
redemption calculations, direct redemption preparation and outcome reconciliation.
Dependencies point to Borrowing, EVM, Chains, Contracts, Core and Tokens.

The deployed call returns no data and has no minimum-output argument. A successful
empty `eth_call` cannot establish actual fill or net BTC. Require an injected,
explicitly compatible output simulator before any submission. The initial concrete
adapter uses bounded `debug_traceCall` with Geth `callTracer` and `withLog`, validates
the exact call and coordinate, and decodes the simulated Redemption event. Core
passes the exact transaction to its retained domain verifier so the same output
policy runs during initial and final simulation. Missing tracing, reverted calls,
incomplete/malformed output or amounts below caller bounds prevent submission.

Current public Boar RPC returned method-not-found for this tracing capability.
Do not silently fall back to empty-call success or claim that endpoint supports
this writer. Verify the adapter on a local fork; applications must supply a
compatible provider. No hosted provider or new external dependency is selected.

Attempted, truncated and actual redeemed amounts remain separate. Bound tail
selection and iterations, preserve current-ICR filtering of the nominally sorted
list, materialized interest, partial cancellation, reserves and borrower surplus.
Output minimums are preflight conditions and cannot guarantee inclusion-state
output. Reconcile the canonical receipt event, exact MUSD burn, native payout,
fees, affected positions and protocol state. Account for native gas explicitly
when comparing wallet balances. Qualified review and release remain outstanding.
