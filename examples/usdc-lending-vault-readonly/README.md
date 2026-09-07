# USDC Lending Vault read example

`readVaultExample` composes the built vault entrypoint with application-owned
ports and explicit block, account, price age, and preview amounts. Read the
[package port and result contract](../../packages/protocols/usdc-lending-vault/README.md).
Dynamic-role reads omit `contractId` and retain an explicit address/coordinate.

From the repository root:

```sh
pnpm install --offline --frozen-lockfile
pnpm build
pnpm --filter @mezo-dev-kit/example-usdc-lending-vault-readonly test
```

The executable offline example checks synthetic wrapper-share rounding. Calling
`readVaultExample` requires real application ports. The example selects no
provider or wallet and performs no transaction.
