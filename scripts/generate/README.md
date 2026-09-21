# Generators

[Scripts manual](../README.md) · Run from the repository root after installing
dependencies. Generators read canonical local inputs and write derived files.

## Generate, review, then check

```sh
# Needed by generators that use the EVM workspace package:
pnpm --filter @mezo-dev-kit/evm build

node scripts/generate/generate-contracts-package.ts
node scripts/generate/generate-contracts-package.ts --check
git diff -- packages/contracts
```

Every generator here supports `--check`: it compares expected output with files
on disk and fails on drift. Without `--check`, it writes its owned outputs.
Select the generator for the changed canonical input; do not edit generated
files by hand. These commands do not fetch new evidence.

`pnpm generate:check` builds EVM and checks the SDK projections listed in the
root [package.json](../../package.json). The catalog below also includes human
knowledge references, the knowledge-authoring example, and per-output checks.

## SDK and CLI projections

Invoke each filename with `node scripts/generate/<filename> [--check]`.
The owning package's scripts may provide a `generate` or `generate:check` alias.

| Generator                                                                | Canonical input / derived output owner                                                 |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [generate-chains-package.ts](generate-chains-package.ts)                 | Indexed network records → Chains data                                                  |
| [generate-contracts-package.ts](generate-contracts-package.ts)           | Contract registry, historical evidence, and NTT interfaces → Contracts data/interfaces |
| [generate-core-transaction-model.ts](generate-core-transaction-model.ts) | Transaction lifecycle knowledge → Core model                                           |
| [generate-protocol-operations.ts](generate-protocol-operations.ts)       | Contract artifacts and role evidence → Contracts operation interfaces                  |
| [generate-prices-package.ts](generate-prices-package.ts)                 | Price knowledge → Prices model                                                         |
| [generate-pools-package.ts](generate-pools-package.ts)                   | Pool knowledge and retained interfaces → Pools model                                   |
| [generate-incentives-package.ts](generate-incentives-package.ts)         | Incentives knowledge → Incentives model                                                |
| [generate-bridges-package.ts](generate-bridges-package.ts)               | Bridge knowledge and delivery evidence → Bridges route models                          |
| [generate-borrowing-package.ts](generate-borrowing-package.ts)           | Borrowing knowledge → MUSD Borrowing model                                             |
| [generate-redemption-package.ts](generate-redemption-package.ts)         | Redemption knowledge → MUSD Redemptions model                                          |
| [generate-institutional-package.ts](generate-institutional-package.ts)   | Institutional debt knowledge → Institutional Debt model                                |
| [generate-savings-package.ts](generate-savings-package.ts)               | Savings model and contract evidence → MUSD Savings model                               |
| [generate-lending-package.ts](generate-lending-package.ts)               | Lending model and contract evidence → mUSDC Lending model                              |
| [generate-vault-package.ts](generate-vault-package.ts)                   | Vault model and contract evidence → USDC Lending Vault model                           |
| [generate-cli-schemas.ts](generate-cli-schemas.ts)                       | `packages/cli/src/contracts.ts` → `packages/cli/schema/*.schema.json`                  |

## Human knowledge references

These generators write `generated/reference.md` in their owning knowledge
module. Module indexes own the exact source-resource list and declared checks.
Invoke the filenames with `node scripts/generate/<filename> [--check]` unless
additional arguments are shown.

| Generator                                                                            | Output module(s)                                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [generate-network-reference.ts](generate-network-reference.ts)                       | `networks`                                                                                                                  |
| [generate-contract-reference.ts](generate-contract-reference.ts)                     | `contracts`                                                                                                                 |
| [generate-musd-reference.ts](generate-musd-reference.ts)                             | `protocols/musd`, its borrowing and redemption modules                                                                      |
| [generate-incentives-reference.ts](generate-incentives-reference.ts)                 | `protocols/incentives`                                                                                                      |
| [generate-institutional-debt-reference.ts](generate-institutional-debt-reference.ts) | `protocols/musd/institutional-debt`                                                                                         |
| [generate-pool-reference.ts](generate-pool-reference.ts)                             | `protocols/pools`                                                                                                           |
| [generate-price-reference.ts](generate-price-reference.ts)                           | `prices`                                                                                                                    |
| [generate-bridge-reference.ts](generate-bridge-reference.ts)                         | `workflows/bridges`                                                                                                         |
| [generate-swap-reference.ts](generate-swap-reference.ts)                             | `workflows/swaps`                                                                                                           |
| [generate-transaction-reference.ts](generate-transaction-reference.ts)               | `workflows/transactions`                                                                                                    |
| [generate-troubleshooting-reference.ts](generate-troubleshooting-reference.ts)       | `troubleshooting`                                                                                                           |
| [generate-economic-system-reference.ts](generate-economic-system-reference.ts)       | Requires `--module protocols/musd/savings`, `--module protocols/lending/musdc`, or `--module protocols/vaults/usdc-lending` |

For example:

```sh
node scripts/generate/generate-economic-system-reference.ts --module protocols/musd/savings
node scripts/generate/generate-economic-system-reference.ts --module protocols/musd/savings --check
```

The [knowledge-authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) owns
the workflow for changing canonical records and running semantic checks.

## Synthetic authoring example

[generate-knowledge-authoring-example.ts](generate-knowledge-authoring-example.ts)
writes the synthetic widget module's generated reference. Its default module
lives in [the executable guide example](../../docs/guides/examples/knowledge-authoring/README.md).

```sh
node scripts/generate/generate-knowledge-authoring-example.ts
node scripts/generate/generate-knowledge-authoring-example.ts --check
```

Use `--module-root <path>` to target a separate synthetic module. Its companion
validator is `scripts/checks/validate-knowledge-authoring-example.ts`.
