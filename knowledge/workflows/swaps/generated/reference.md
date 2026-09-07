# Mezo swaps and routing reference

> Generated from canonical `workflows/swaps` records and evidence. Do not edit manually.

## Lifecycle

- Status: `verified`
- Support: `none`
- Review: `accepted`
- Evidence block: Mezo Mainnet `11376104` (`0x358c55c8879f9a6711408df6e4dbc75e4b82d3e7f2f0cbab47fd73bfeaf32bc3`)
- Public readers: none
- Writers: none
- Input digest: `520d325a28f15d1f4347e01bfc510b1dfeb254a92a6e5c89b49cca2544d7704f`

## Deployed providers

| Provider | Architecture | Quote boundary | Approval spender |
| --- | --- | --- | --- |
| `basic-router` | `basic` | `evidence-verified-not-supported` | `0x16a76d3cd3c1e3ce843c6680d6b37e9116b5c706` |
| `concentrated-liquidity-router` | `concentrated-liquidity` | `unavailable-no-official-quoter` | `0x37cdd11919ec3860ead9efb8673d7476e5326225` |

The basic router's `getAmountsOut` is a block-scoped convenience quote. The CL router has no standalone Quoter. Neither estimate is exact-call simulation or a guaranteed minimum.

## Route dispositions

| Route | Disposition | Encoding |
| --- | --- | --- |
| `basic-route` | `evidence-verified-not-supported` | ABI array of (address from,address to,bool stable,address factory) |
| `concentrated-liquidity-route` | `source-verified-not-supported` | exact-input packed bytes: tokenIn(20) \|\| int24 tickSpacing(3) \|\| tokenOut(20), then repeat tickSpacing \|\| tokenOut |
| `atomic-mixed-route` | `unsupported-no-deployed-composer` | none |
| `universal-router-command-stream` | `rejected-not-deployed` | none |

## Execution lifecycle

### discover

- Resolve accepted router/factory deployments by stable Contract ID, network, and validity coordinate.
- Discover every dynamic pool through the owning pool module at one block and reject missing code, unrecognized factories/pools, mismatched tokens, stable flags, or tick spacing.
- Bound search to at most three hops and an explicit caller allowlist of intermediate assets; do not perform unbounded graph search.

### quote

- Return an estimate with provider ID, architecture, route encoding, amount units, deployment IDs, block number/hash, assumptions, freshness deadline, and user slippage policy.
- Reject zero, stale, partial, overflowed, malformed, or architecture-mismatched results.
- Basic getAmountsOut is a convenience quote. CL pool math is an estimate. Neither is exact-call simulation or a guaranteed minimum.

### rank

- Compare only candidates with identical network, assets, amount units, freshness policy, and explicit required-result completeness.
- Exclude unsupported mixed/universal families and any candidate without a path to exact-call simulation.
- Preserve optional provider failures as diagnostics and fail if no eligible candidate remains.

### compile

- Compile only an allowlisted router entrypoint and its architecture-specific encoding.
- Require caller-authorized nonzero amountOutMinimum, bounded future deadline, explicit recipient, exact sender, chain ID, destination, calldata, and native value.
- Treat CL sqrtPriceLimitX96 zero only as the deployed full-range sentinel after an explicit caller policy choice; it does not replace amountOutMinimum.

### approve

- Resolve the selected router as the exact spender and prefer an allowance equal to the required input amount.
- Unlimited approval requires separate explicit opt-in, current accepted spender identity, risk disclosure, and review; it is never a silent default.
- Track approval as its own transaction, reread allowance after confirmation, and rebuild/re-simulate the swap if state or quote freshness changed.

### simulate

- Use an endpoint with explicitly evidenced eth_call behavior and simulate the exact destination, calldata, value, sender, chain, and intended block/state.
- Preserve revert data and reject any simulated output below amountOutMinimum or any sender/balance/allowance/deadline/pool failure.
- Simulation must use the exact call later authorized for signing; mutation after simulation invalidates it.

### submit-track

- Revalidate freshness and all volatile inputs immediately before signing.
- Submit the exact simulated call, track replacements by nonce, and only rebroadcast identical signed bytes during uncertain write failover.
- Receipt success proves inclusion only; configured confirmation and reconciliation remain mandatory.

### reconcile

- At a pinned reconciliation block, derive actual recipient input/output token deltas and validate architecture-specific pool events/transfers.
- Require actual output at least amountOutMinimum and expected asset/recipient movement; preserve fee-on-transfer or unrelated-transfer ambiguity as failure because those variants are unsupported.
- Return a structured mismatch when receipt status, decoded logs, balance deltas, or intended route disagree; never coerce it to success.

## Evidence

- Current router roots: 2
- Historical exact-call replays: 2
- Deterministic fixtures: 15
- Basic evidence includes a successful exact two-hop replay whose returned amounts match receipt transfers.
- CL evidence includes a successful exact direct replay, but its historical zero minimum is negative evidence and must not be copied.

See `review/gaps.md` before relying on a route or operation. No public reader or writer is enabled.
