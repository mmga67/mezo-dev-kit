# Foundational read-only built-entrypoint example

This private example proves that a workspace consumer can import only the
declared built entrypoints of `@mezo-dev-kit/chains`,
`@mezo-dev-kit/contracts`, and `@mezo-dev-kit/core`. It injects a deterministic
transport, resolves the accepted MUSD Savings Rate deployment, and performs a
single block-pinned read without selecting a real RPC endpoint.

From the repository root:

```sh
pnpm build
pnpm --filter @mezo-dev-kit/example-foundational-readonly test
```

The example is an integration fixture, not a provider adapter or an assertion
about live protocol state. It performs no network access and exposes no writer.
