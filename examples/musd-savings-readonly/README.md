# MUSD Savings read example

This private source-alpha example imports the built
`@mezo-dev-kit/musd-savings` entrypoint. It remains a Savings reader review review candidate;
see the [API and transport contract](../../packages/protocols/musd-savings/README.md).

From the root, using the root-pinned pnpm and Node 24 or newer:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/example-musd-savings-readonly test
```

The offline executable checks a synthetic integer accounting case through the
built package. `readSavingsExample(config, account, blockNumber)` demonstrates
the complete injected reader entrypoint and returns its typed snapshot
unchanged. Callers supply transport, codec, and registry, handle unavailable
groups, and retain the block coordinate.

The offline command does not call an RPC or certify an external codec. Package
integration tests exercise the full reader with typed injected ports,
canonical registry data, and source-bound runtime fixtures. No default
provider, account, credential, signer, or transaction is included.
