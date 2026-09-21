# Swap quotes and execution

`@mezo-dev-kit/swaps` quotes and executes exact-input swaps through Mezo basic and concentrated-liquidity pools. Callers supply candidate routes; the package evaluates them within explicit discovery and quote budgets.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the swap walkthrough](../../examples/swap-tokens/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Choose an entry point

- Import `@mezo-dev-kit/swaps/quotes` for readers and route-comparison helpers.
- Import `@mezo-dev-kit/swaps` for the complete surface, including writers.

Basic and concentrated-liquidity readers quote contiguous routes at one block.
The combined quote reader compares caller-supplied candidates under an explicit
eligibility policy. No reader invents routes or treats a DEX quote as a protocol
oracle price. See the [API reference](REFERENCE.md) for route and traversal limits.

## Execution and recovery

Writers verify token generations, pool discovery, approvals, quote age, output
minimums, deadlines, and exact simulation. Approval is a separate transaction;
applications own consent, signing, transport policy, and durable operation storage.
Reconciliation checks pool events/state and actual wallet outcomes.

The [mixed-route recovery example](examples/mixed-recovery.ts) composes two
separately consented transactions. If the second cannot proceed, the first stays
settled and its intermediate tokens remain in the wallet. Resume from retained
intent and inclusion evidence; the helper never approves or submits for you.

## Scope

Private mainnet writers cover checked MUSD, mUSDC, and mUSDT generations.
A broader readable route is not automatically writable. Atomic mixed-family
routes, Universal Router, native value, and fee-on-transfer variants are outside
this API. These Node implementations require qualified review before release.
[Swap knowledge](../../knowledge/workflows/swaps/README.md) owns routing semantics.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/swaps check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
