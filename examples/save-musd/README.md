# Deposit, earn and withdraw Savings

## Read the focused operation

Start with [Deposit MUSD](deposit.ts) beside the [connection guide](../SETUP.md).
Pass a unique operation ID, MUSD base units and SavingsBounds. Follow approval, fresh preparation and actual principal settlement. The lifecycle below obtains token precision, deposits through this function and demonstrates yield, optional gauge custody and withdrawal.

The function takes the named connections from [setup.ts](../setup.ts); it does
not require ExampleRuntime or the CLI. The command below runs the composed
lifecycle, including the focused operation.

## Run the lifecycle

[Setup](../README.md#build-and-run) · [Code](workflow.ts) · [Gauge code](gauge.ts) · [SDK](../../packages/protocols/musd-savings/REFERENCE.md)

```sh
MDK_RUN_ID=savings-01 pnpm --filter @mezo-dev-kit/examples save-musd --mode fork
# Also set MDK_NATIVE_TOKEN_ARTIFACT for the gauge's native reward token.
MDK_RUN_ID=savings-stake-01 pnpm --filter @mezo-dev-kit/examples save-musd --mode fork --variant stake
```

Deposit 100 MUSD, read principal receipts and indexed yield, claim available
yield, then withdraw the 100 MUSD principal. The local runner funds 200 MUSD
and donates 10 MUSD through the real permissionless `receiveProtocolYield`
entrypoint after depositing. That donation is shared by all eligible Savings
principal, so the example's yield is less than the donation.

Expected success prints positive MUSD yield paid separately from principal,
then zero remaining wallet principal receipts. The workflow can also run
without the fixture hook; if no yield is claimable it explains that state.
Waiting alone does not promise yield.

The `stake` variant transfers the principal receipts into the gauge, claims
available incentive rewards, unstakes, then completes the Savings exit.
Gauge rewards and indexed MUSD yield are different assets/accounting paths;
staking does not create another deposit. Gauge liveness, custody and current
allowance are checked before each write. An unavailable wallet read is not
treated as a zero balance. The recipe requires no existing wallet principal.
