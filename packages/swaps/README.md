# Swaps

Private mainnet basic-pool quotes and exact-input swaps. The
[SDK reference](REFERENCE.md) covers every export, method, unit and example.

`createBasicSwapReader` consumes verified Pools discovery to quote one to three
contiguous, acyclic basic hops at one block. Callers supply candidate routes and
an explicit intermediate-token allowlist. `rankBasicSwapQuotes` compares complete
writer-compatible candidates for the same request by output amount. Neither
method invents routes, estimates profitability or substitutes a DEX quote for a
protocol oracle.

`createBasicSwapWriter` prepares, simulates, submits and reconciles exact-input
Router calls. The initial verified writer assets are MUSD and mUSDC, so current
writes use a single hop; other basic routes can be read without being executable.
The writer checks output minimums, deadline, wallet balance, exact approvals,
source generation and quote age, including decoded output from the final
simulation. Receipt reconciliation checks each pool's Swap/Fees events, token
payments, segregated fees, reserve changes and wallet outcome.

Approvals are independent transactions. Applications own consent, signer, RPC,
atomic operation storage, tracking and recovery. Qualified protocol review and
release remain outstanding; this is a Node private workspace package. CL,
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
