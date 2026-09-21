# Token balances and approvals

`@mezo-dev-kit/tokens` reads ERC-20 balances and allowances and manages explicit approval transactions. Use it when a protocol workflow needs a verified token allowance before its own action.

## Start here

Build the workspace with the [SDK setup guide](../../docs/guides/SDK_DEVELOPMENT.md), then follow [the token approval example](../../examples/tokens/README.md) for a focused walkthrough. The [API reference](REFERENCE.md) covers exact methods, inputs, results, and errors.

## Approval workflow

1. Supply the protocol-verified asset and spender, then read balance and allowance.
2. Prepare the exact approval amount. Keep an already sufficient allowance.
3. If a nonzero allowance must change, reset it to zero and confirm before preparing the new approval.
4. Simulate, submit, and reconcile the approval; prepare the protocol action again with fresh state.

Amounts use bigint token base units. Approval and protocol action have separate
identities and recovery records in the application-owned Core submission store.

## Scope

This private Node package uses Core's injected RPC and signer ports. The
protocol supplies verified token/spender identities and a target resolver for
discovered roles. Tokens selects no spender, grants no automatic unlimited
allowance, and does not execute the subsequent protocol action.
Qualified review remains required before release; browser and native-token
integration have their own verification needs.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/tokens check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
