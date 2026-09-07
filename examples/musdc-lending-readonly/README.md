# mUSDC lending read example

This private workspace example imports the lending package's built entrypoint.
`readLendingExample` accepts an application-owned registry, transport, ABI codec,
account, fixed block, and maximum price age. See the
[package contract](../../packages/protocols/musdc-lending/README.md) for the
coordinate and decoded-value requirements. It does not select a provider or
wallet.

From the repository root:

```sh
pnpm install --offline --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/example-musdc-lending-readonly test
```

The runnable offline calculation checks three-term interest accrual with
synthetic inputs. Invoking `readLendingExample` additionally requires real
application ports. No network access or transaction occurs in the offline test.
