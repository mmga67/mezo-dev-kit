---
name: mdk-pool-liquidity-knowledge
description: Resolve basic-AMM and concentrated-liquidity pools, math, positions and gauge ownership. Verified discovery, accounting and private basic liquidity/fee workflows.
---

# Mezo pool and liquidity knowledge

## Use when

Use this skill for Mezo basic pool versus CL mechanism questions, factory-root
discovery, stable/volatile identity, reserves, tick/price/liquidity math, CL NFT
positions, staked depositor identity, pool/gauge liquidity distinctions, fee
boundaries, empty states, or maintenance of `knowledge/protocols/pools`.

Do not use it to turn APY/TVL analytics into protocol facts, optimize a
portfolio, infer a Quoter address, normalize vault/lending deposits as AMM
liquidity, or infer transaction authorization.

## Required context

1. Read the active task and applicable `AGENTS.md` files.
2. For maintenance, read
   `agents/skills/mdk-knowledge-maintenance/SKILL.md` and
   `docs/standards/knowledge-management.md`.
3. Read `knowledge/protocols/pools/README.md` and resolve the module through
   `index.json`.
4. Load only the architecture, math, position/gauge, operation,
   classification, fixture, source, evidence, or review resources needed.
5. For authored scripts or runtime code, also load
   `agents/skills/mdk-typescript-development/SKILL.md`.

## Procedure

For a step-by-step explanation, start with the indexed pool architecture,
positions/gauges and operation records plus canonical ABIs. They already cover
discovery, NFT ownership, staking, rewards and withdrawal. Apply the live
discovery checks below when reading current state or preparing a transaction.
Fetch source only for an unresolved detail, such as authorization differences
between overloaded claim methods, after checking retained evidence.

1. Resolve the network and provider capability through Networks.
2. Resolve reusable roots, validity, source generation, and full ABI through
   Contracts. Preserve accepted registry lifecycle and the descriptor's
   partial explorer label.
3. Select `basic` or `concentrated-liquidity` before interpreting a pool key,
   liquidity value, fee, position, or quote. Never merge the two models.
4. Rediscover dynamic instances at one block through the reviewed factory key;
   require factory recognition, bytecode, and matching instance identity
   reads. Treat enumeration and analytics rows as candidates only.
5. For a CL gauge, treat `pool.gauge` as optional. When nonzero, verify the
   gauge factory, pool, position manager, tokens, tick spacing, and incentives
   voter liveness at the same block.
6. Use `pools-math-fixtures` and integer arithmetic for ticks, Q64.96 prices,
   amount/liquidity conversions, and rounding. A representable read boundary
   is not automatically a valid write input.
7. Keep basic reserves/LP supply, CL active liquidity, CL staked active
   liquidity, NFT position liquidity, and a depositor's gauge stake set
   separate.
8. While an NFT is staked, distinguish ERC-721 contract owner from the
   beneficial depositor. If no bounded depositor evidence exists, return
   `null`/unknown rather than infer an identity.
9. Route gauge emission/voting behavior to incentives and transaction
   lifecycle to `workflows/transactions`. `pools-operation-requirements` is a
   review gate. Inspect `packages/protocols/pools/REFERENCE.md` for current private discovery, liquidity and fee methods. Wallet fee indices and gauge custody remain separate.
10. On maintenance, update evidence digest, source catalog, canonical record,
    fixtures, generated reference, candidate/gap disposition, and validator
    together.

## Verification

Run the module checks declared in `knowledge/protocols/pools/index.json`, then
Contracts, Networks, incentives, transaction, troubleshooting, root structure,
catalog, JSON, link, and whitespace checks appropriate to the change. Test
extreme ticks, tick-spacing alignment, zero liquidity/supply, amount rounding,
token ordering, missing gauges, differing active/staked liquidity, partial
verification, and stale dynamic mappings.

## Invariants and common failure modes

- The module and seven CL registry roots received qualified Level 3 acceptance;
  canonical writer support remains proposed. The private Pools package now implements basic MUSD/mUSDC liquidity and fee writers; inspect its current README/REFERENCE.
- No current official Quoter identity is known.
- Zero minimum outputs are not safe defaults.
- Implicit unlimited ERC-20 or ERC-721 approval is prohibited.
- Executable reproduction proves byte correspondence, not authorship, audit
  coverage, current route safety, or support.
- A successful receipt, nonzero TVL row, or factory enumeration entry does not
  prove current operation preconditions.

## Stop conditions

Stop when a required root or ABI is missing/conflicting, a dynamic mapping does
not validate, the evidence window is stale for the risk, token ordering or
rounding is ambiguous, a Quoter would be guessed, beneficial ownership would
be inferred, proposed scope would be presented as supported, current exact-call
simulation is absent for a proposed write, a new dependency is required, or
architecture/support scope would materially change.
