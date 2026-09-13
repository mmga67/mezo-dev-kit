# Swaps

Private mainnet basic/CL pool quotes and exact-input swaps. The
[SDK reference](REFERENCE.md) covers every export, method, unit and example.

The deliberate `@mezo-dev-kit/swaps/quotes` entrypoint exports readers and route
helpers only. Its `createSwapQuoteReader` evaluates up to 16 caller-supplied basic
or CL candidates at one fresh coordinate, preserves required/optional failures,
and compares output under an explicit eligibility policy. It reports per-hop
fee units, bounded coverage and unavailable price-impact/gas estimates. The root
entrypoint still contains the writers; selecting a subpath is API organization,
not package isolation or release qualification.

`createBasicSwapReader` consumes verified Pools discovery to quote one to three
contiguous, acyclic basic hops at one block. Callers supply candidate routes and
an explicit intermediate-token allowlist. `rankBasicSwapQuotes` compares complete
writer-compatible candidates for the same request by output amount. Neither
method invents routes, estimates profitability or substitutes a DEX quote for a
protocol oracle.

`createBasicSwapWriter` prepares, simulates, submits and reconciles exact-input
Router calls. The private writer profile includes MUSD, mUSDC and mUSDT.
Each asset must pass its own runtime and precision checks; broader readable
routes do not acquire writer compatibility through ranking.
The writer checks output minimums, deadline, wallet balance, exact approvals,
source generation and quote age, including decoded output from the final
simulation. Receipt reconciliation checks each pool's Swap/Fees events, token
payments, segregated fees, reserve changes and wallet outcome.

Approvals are independent transactions. Applications own consent, signer, RPC,
atomic operation storage, tracking and recovery. Qualified protocol review and
release remain outstanding; this is a Node private workspace package.
Universal Router, atomic mixed routes, native value and fee-on-transfer variants
are not implemented by this facade.

```sh
pnpm --filter @mezo-dev-kit/swaps check
pnpm build
node packages/swaps/test/fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL"
```

The opt-in harness verifies the parent through a read-only source RPC, uses only
the local Anvil fork for funding and transactions, and reverts its snapshot. It
adds liquidity, swaps both directions, withdraws partially and fully, and claims
LP fees after exit. All token and protocol code stays unchanged. Run sequentially
with other fork harnesses.

`createCLSwapReader` uses verified Pools discovery and source-based step/fee math
to quote one to three contiguous CL hops without wallet approval or an assumed
Quoter. Explicit budgets bound steps, bitmap words and initialized tick crossings.
Partial fills and exhausted budgets reject the quote. `createCLSwapWriter`
encodes the exact CL router tuple or packed path, confirms input approval
separately, checks output in initial/final simulation and reconciles pool price,
active/staked liquidity, crossed fee boundaries, gauge fees, token transfers,
wallet/custody and native gas. Router native refund custody must be empty.
The same three-asset profile applies to CL paths. A qualifying token does not
establish a pool or its liquidity; every hop is discovered and checked again.

The maintained [mixed recovery example](examples/mixed-recovery.ts) composes
two separately consented basic/CL transactions. It reconciles the first receipt
again, persists its actual intermediate output and inclusion anchor, and prepares
the second transaction against current state. A rejected second preparation
leaves the first transaction settled and its intermediate funds in the wallet.
Saved second-leg reservations, including records without a hash, require recovery
through the same durable Core store. The helper never approves or submits.

The example requires application-validated prepared values and atomic durable
checkpoint storage. Its checkpoint is evidence to recheck, not completion proof
or a reservation of fungible wallet funds. Keep stable operation IDs and retain
both prepared calls and submission records for reconciliation. Native engine
behavior and atomic execution across router families remain unqualified.
