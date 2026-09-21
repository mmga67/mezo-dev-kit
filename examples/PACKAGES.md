# Package example coverage

Start with [connections and transaction stages](SETUP.md). Focused files show
public API construction and one operation. The existing lifecycle demonstrations
call those focused operations and show how to compose additional actions.

| Package                                 | Start with code                                                                                         | Continue with                                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@mezo-dev-kit/evm`                     | [Exact amounts and address validation](evm/amounts.ts)                                                  | [Guide](evm/README.md)                                                                                                           |
| `@mezo-dev-kit/chains`                  | [Select and verify a network](chains/select-network.ts)                                                 | [Guide](chains/README.md)                                                                                                        |
| `@mezo-dev-kit/contracts`               | [Resolve a deployment and read ABI](contracts/resolve-deployment.ts)                                    | [Guide](contracts/README.md)                                                                                                     |
| `@mezo-dev-kit/core`                    | [Read coherent balances](core/read-balances.ts), [construct connections](setup.ts)                      | [Observe a saved submission](core/observe-submission.ts), [guide](core/README.md)                                                |
| `@mezo-dev-kit/tokens`                  | [Complete one exact approval](tokens/approve.ts)                                                        | [Guide](tokens/README.md), [read units](runtime/token-units.ts)                                                                  |
| `@mezo-dev-kit/prices`                  | [Normalize and evaluate a datum](prices/normalize.ts)                                                   | [Skip reader](prices/read-skip.ts), [guide](prices/README.md)                                                                    |
| `@mezo-dev-kit/musd-borrowing`          | [Open a position](borrow-musd/open-position.ts)                                                         | [Manage, repay and close](borrow-musd/workflow.ts), [guide](borrow-musd/README.md)                                               |
| `@mezo-dev-kit/pools`                   | [Add liquidity](provide-basic-liquidity/add.ts), [mint a CL position](manage-cl-position/mint.ts)       | [Fees and exit](provide-basic-liquidity/workflow.ts), [CL lifecycle](manage-cl-position/workflow.ts)                             |
| `@mezo-dev-kit/swaps`                   | [Swap one explicit route](swap-tokens/swap.ts)                                                          | [Compare routes](swap-tokens/workflow.ts), [CL swap](swap-tokens/concentrated-liquidity.ts), [mixed route](swap-tokens/mixed.ts) |
| `@mezo-dev-kit/bridges`                 | [Send MUSD and persist source identity](bridge-musd/send.ts), [Native transfers](bridge-musd/native.ts) | [Delivery observation](bridge-musd/observe-delivery.ts), [recovery](bridge-musd/recovery.ts), [guide](bridge-musd/README.md)     |
| `@mezo-dev-kit/musd-savings`            | [Deposit MUSD](save-musd/deposit.ts)                                                                    | [Yield, gauge custody and withdrawal](save-musd/workflow.ts), [guide](save-musd/README.md)                                       |
| `@mezo-dev-kit/musdc-lending`           | [Supply mUSDC](lend-and-borrow-musdc/supply.ts), [borrow mUSDC](lend-and-borrow-musdc/borrow.ts)        | [Borrow and repay against collateral](lend-and-borrow-musdc/workflow.ts), [guide](lend-and-borrow-musdc/README.md)               |
| `@mezo-dev-kit/usdc-lending-vault`      | [Deposit for vault shares](use-usdc-vault/deposit.ts)                                                   | [Wrap, stake and redeem](use-usdc-vault/workflow.ts), [guide](use-usdc-vault/README.md)                                          |
| `@mezo-dev-kit/incentives`              | [Create a veBTC lock](lock-and-vote/create-lock.ts)                                                     | [Vote and withdraw](lock-and-vote/workflow.ts), [gauge custody](save-musd/gauge.ts), [reward claims](lock-and-vote/claims.ts)    |
| `@mezo-dev-kit/musd-redemptions`        | [Redeem with output bounds](redeem-musd/redeem.ts)                                                      | [Trace output and derive minimums](redeem-musd/workflow.ts), [guide](redeem-musd/README.md)                                      |
| `@mezo-dev-kit/musd-institutional-debt` | [Inspect a position and allocate repayment](institutional-debt/inspect-position.ts)                     | [Guide](institutional-debt/README.md)                                                                                            |
| `@mezo-dev-kit/cli`                     | [Validate project configuration](project-tooling/configure.ts)                                          | [Guide](project-tooling/README.md)                                                                                               |

## Package directories without executable APIs

`packages/react`, `packages/hardhat`, `packages/foundry` and
`packages/test-utils` are placeholders with no package manifest or exported API
in this checkout. Their intended responsibilities are in
[Architecture](../ARCHITECTURE.md#repository-areas). Add executable
examples alongside their first implemented APIs. The examples above use the
current public workspace entrypoints; they do not require those adapters.

The CLI examples include parsing and [project initialization/inspection](project-tooling/initialize.ts).
Its artifact setup has a separate [guide](../docs/guides/MDK_CLI.md). Institutional
debt supplies reads and calculations, and Prices supplies observations and
calculations. Their examples preserve those boundaries.
