# Deposit into the USDC Lending Vault

## Read the focused operation

Start with [Deposit for vault shares](deposit.ts) beside the [connection guide](../SETUP.md).
Pass asset base units and VaultBounds: maxInput is an asset cap and minOutput is a share minimum for this action. Follow the explicit vault resolver and approval. The lifecycle below calculates these bounds, calls the focused deposit and optionally wraps/stakes before redeeming.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [SDK](../../packages/protocols/usdc-lending-vault/REFERENCE.md)

```sh
MDK_RUN_ID=vault-01 pnpm --filter @mezo-dev-kit/examples use-usdc-vault --mode fork
# Requires MDK_NATIVE_TOKEN_ARTIFACT for gauge reward dispatch.
MDK_RUN_ID=vault-wrap-01 pnpm --filter @mezo-dev-kit/examples use-usdc-vault --mode fork --variant wrap
```

Preview a 100 mUSDC deposit, approve the discovered vault, deposit, then redeem
the actual wallet shares. The writer models share conversion and market
allocation; the example checks actual input/output against the forecast with
0.5% tolerance and explicit rounding. Share price can change between calls.

The `wrap` variant wraps vault shares and stakes receipts in the gauge. To exit,
read the actual gauge stake, unstake, unwrap the resulting receipts, then
redeem vault shares. Assets, vault shares, wrapper receipts and gauge stake
are distinct quantities; never pass one as another merely because both are bigint.

Expected success returns the remaining vault position to zero after redemption
and prints actual assets/shares at each step. Deposit availability, market
liquidity, wrapper policy and gauge liveness are checked separately. A positive
preview does not bypass any of those execution requirements.
