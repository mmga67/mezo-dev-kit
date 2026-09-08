---
name: mdk-swap-routing-knowledge
description: Verify Mezo swap discovery, quotes, route encoding, approvals and simulation requirements. No public swap reader or writer.
---

# Mezo swap and routing knowledge

## Use when

Use this skill for current Mezo basic/CL router identity, route encoding,
bounded route candidates, quote context, provider capability, spender/payer/
recipient semantics, minimum output/deadline rules, exact-call simulation, and
swap reconciliation, or when maintaining `knowledge/workflows/swaps`.

Do not use it to infer a Quoter or Universal Router, copy upstream command
bytes, provide trading recommendations, perform unbounded route search, treat
quotes as guarantees, combine separate routers into an unevidenced atomic
route, or enable a reader/writer.

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. For maintenance, read
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` and
   `docs/standards/knowledge-management.md`.
3. Read `knowledge/workflows/swaps/README.md` and resolve the module through
   `index.json`.
4. Load only the provider, route, execution, fixture, source, evidence, or
   review resources needed.
5. Load `mdk-pool-liquidity-knowledge` for pool identity/discovery/math,
   `mdk-contract-knowledge` for router deployments/ABIs, and
   `mdk-transaction-execution` for generic lifecycle rules when those
   boundaries are in scope.
6. For authored scripts or product code, also load
   `agents/skills/mdk-typescript-development/SKILL.md`; load
   `agents/skills/mdk-testing/SKILL.md` when tests or fixtures change.

## Procedure

1. Resolve Mezo Mainnet, an eligible RPC provider, accepted router/factory
   Contract generations, and a single block coordinate.
2. Select `basic` or `concentrated-liquidity` before discovering pools,
   interpreting a quote, or encoding a route. Never normalize their pool keys,
   hop encodings, payer/custody, or recipient semantics.
3. Rediscover every hop through the accepted factory and pool module. Require
   current mapping, recognition, bytecode, token order, and stable flag or tick
   spacing at the same block.
4. Bound routes to the reviewed maximum and explicit intermediate assets.
   Reject missing, zero-liquidity, stale, partial, noncontiguous, unsupported,
   or mixed atomic candidates.
5. Return a quote as an estimate with provider, network/deployment, block,
   assumptions, freshness, units, route, and caller slippage policy. Never
   label `getAmountsOut` or CL pool math as exact-call simulation or guaranteed
   output.
6. Compile only allowlisted entrypoints: basic
   `swapExactTokensForTokens`, CL `exactInputSingle`, or CL `exactInput`.
   Require a nonzero caller-authorized minimum, bounded deadline, explicit
   sender/recipient, destination, value, and exact architecture encoding.
7. Resolve the selected router as spender. Prefer exact-operation allowance;
   unlimited approval requires explicit opt-in and separate review.
8. Simulate the exact destination/calldata/value/sender at the intended chain
   and state through an endpoint whose `eth_call` behavior is explicitly
   evidenced. Preserve revert data; any call mutation invalidates simulation.
9. Follow transaction tracking and reconcile actual recipient token deltas and
   architecture-specific events/state. Receipt success alone is insufficient.
10. On maintenance, update evidence digest, source catalog, canonical records,
    fixtures, generated reference, candidate/gap disposition, validator, and
    qualified-review packet together.

## Verification

Run every check declared by `knowledge/workflows/swaps/index.json`, then the
pool, Contracts, Networks, transaction, troubleshooting, root-structure,
catalog, skill-catalog, JSON, Markdown-link, and whitespace checks appropriate
to the change. Exercise direct, multi-hop, mixed, unsupported-family,
zero-liquidity, stale, slippage, approval, partial-provider, revert, and
reconciliation fixtures.

## Invariants and common failure modes

- The current official surface has separate basic and CL routers, not an
  evidenced Universal Router.
- No current official Quoter identity is known.
- Basic route tuples and CL packed paths are not interchangeable.
- Atomic mixed basic/CL routing is unsupported.
- Zero minimum outputs, implicit unlimited approvals, unknown commands,
  unsupported fee-on-transfer/balance-sweep variants, and partial required
  results fail closed.
- Historical replay, source verification, and a successful receipt do not
  create current route or writer support.

## Stop conditions

Stop when router/ABI/source generations conflict, a pool mapping or provider
capability cannot be verified, route encoding/payer/recipient semantics are
ambiguous, a Quoter/Universal Router/command would be guessed, an unsupported
family would be enabled, current exact-call simulation is absent for a
proposed write, a new dependency is required, or support/public architecture
would materially expand.
