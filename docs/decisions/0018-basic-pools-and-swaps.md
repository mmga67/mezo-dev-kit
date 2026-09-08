# ADR-0018 — Basic pool and swap workflows

- Status: Accepted for private implementation under the full-SDK task
- Date: 2026-09-08

The full-SDK task requires usable pool liquidity and swaps after the borrower,
Savings, lending and vault writers. Pools owns instance discovery, reserve and
position accounting, and pool operations. Swaps consumes Pools for bounded route
discovery/quotes and owns router execution and route outcomes. Both consume the
existing EVM, Chains, Contracts, Core and Tokens boundaries; no new external
client dependency or application state owner is introduced.

The first family is the currently indexed mainnet basic Router/PoolFactory.
Contracts curates router operations and verified Pool/FactoryRegistry interface
profiles. Pool instances remain discovered addresses, verified against factory
mapping, router prediction, clone/implementation bytes and token/stable getters.
They do not become static registry IDs. Approvals use injected role resolution
bound to those verified instances and exact router spenders.

Start with existing nonempty basic pools, explicit two-asset liquidity amounts,
ordinary ERC-20 transfers, direct self recipients and zero native value. Read
live token balances as well as reserves: Router convenience previews use reserves
while pool mint/burn uses balances. Reject unexplained reserve/custody differences
before writing. Add/remove token minimums and deadlines are encoded on-chain;
minimum LP output is a disclosed preflight bound because this Router has no
LP-minimum argument. Fee collection belongs to Pools; gauge custody/rewards
remain with Incentives.

Basic exact-input swaps use one to three verified contiguous hops, an explicit
intermediate-asset allowlist, nonzero minimum output, deadline and exact sender/
recipient. Quotes and simulation are separate observations. Revalidate pool,
allowance, quote age and exact calldata before submission, then reconcile pool
events, token transfers and receipt-block account/position changes. Approvals
remain separate confirmed transactions and require re-preparation.

CL and wider Incentives follow their own source/instance evidence. There is no
evidenced Universal Router or official Quoter to assume. Atomic mixed-family
routes, fee-on-transfer variants, restricted governance/partner writers and
publication remain outside this slice. Private implementation does not promote
canonical support; qualified protocol review remains required before release.

Core simulation now retains return bytes and an optional domain verifier. The
same verifier runs again on the final exact call before submission. This closes
the gap between successful EVM execution and acceptable decoded swap/liquidity
outputs. Custom execution adapters must honor that verifier contract; existing
callers without one preserve their behavior.

Initial writer compatibility is restricted to MUSD/mUSDC, with verified token
runtime, proxy implementation slot/code and precisions. Other basic pools remain
readable. Thus bounded multi-hop quoting is available, while initial executable
routes have one hop. Native BTC requires gas-aware wallet outcome evidence before
joining this writer profile. Wallet LP claims remain available after LP exit;
Pool fee indices and segregated PoolFees payments are reconciled separately from
principal and gauge rewards.
