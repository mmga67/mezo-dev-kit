# SDK package reference

The SDK contains sixteen private runtime packages. Use the table below to
choose an owner, then open its reference for exact methods, types, inputs,
errors, and examples. The separate [project utility](../../packages/cli/README.md)
creates applications and manages matching local guidance.

## Package selection

| Package                                 | Use it for                                                                     | Methods, types, and examples                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `@mezo-dev-kit/musd-borrowing`          | Classic borrower state and direct operations                                   | [Borrowing SDK reference](../../packages/protocols/musd-borrowing/REFERENCE.md)          |
| `@mezo-dev-kit/evm`                     | Typed EVM values, exact units, and bounded ABI codecs                          | [EVM reference](../../packages/evm/REFERENCE.md)                                         |
| `@mezo-dev-kit/chains`                  | Accepted network identities and capability metadata                            | [Chains reference](../../packages/chains/REFERENCE.md)                                   |
| `@mezo-dev-kit/contracts`               | Deployment/runtime identity and read or curated operation ABIs                 | [Contracts reference](../../packages/contracts/REFERENCE.md)                             |
| `@mezo-dev-kit/core`                    | Block-consistent reads, event scans and transaction execution                  | [Core reference](../../packages/core/REFERENCE.md)                                       |
| `@mezo-dev-kit/bridges`                 | Private NTT/Native preparation, NTT recovery and separate delivery observation | [Bridges reference](../../packages/bridges/REFERENCE.md)                                 |
| `@mezo-dev-kit/musd-redemptions`        | Bounded redemption quotes, traced output and direct execution                  | [Redemptions reference](../../packages/protocols/musd-redemptions/REFERENCE.md)          |
| `@mezo-dev-kit/musd-institutional-debt` | Enclave authority, positions, fees and pledged collateral                      | [Institutional reference](../../packages/protocols/musd-institutional-debt/REFERENCE.md) |
| `@mezo-dev-kit/pools`                   | Basic liquidity/fees; CL math, reads and NFT position lifecycle                | [Pools reference](../../packages/protocols/pools/REFERENCE.md)                           |
| `@mezo-dev-kit/swaps`                   | Basic/CL swaps; `/quotes` provides read-only candidate comparison              | [Swaps reference](../../packages/swaps/REFERENCE.md)                                     |
| `@mezo-dev-kit/prices`                  | Explicit scale, freshness and direct Skip observations                         | [Prices reference](../../packages/prices/REFERENCE.md)                                   |
| `@mezo-dev-kit/tokens`                  | Exact balances, allowances and explicit approvals                              | [Token reference](../../packages/tokens/REFERENCE.md)                                    |
| `@mezo-dev-kit/incentives`              | Gauges, locks, voting, fee/bribe and bounded rebase claims                     | [Incentives reference](../../packages/protocols/incentives/REFERENCE.md)                 |
| `@mezo-dev-kit/musd-savings`            | sMUSD principal and MUSD indexed yield                                         | [Savings reference](../../packages/protocols/musd-savings/REFERENCE.md)                  |
| `@mezo-dev-kit/musdc-lending`           | BTC/mUSDC Morpho market, debt, shares, interest, and health                    | [Lending reference](../../packages/protocols/musdc-lending/REFERENCE.md)                 |
| `@mezo-dev-kit/usdc-lending-vault`      | Depositor shares, wrapper yield, previews, and gauge ownership                 | [Vault reference](../../packages/protocols/usdc-lending-vault/REFERENCE.md)              |

Each package reference inventories its public runtime functions, methods on
returned objects, exported types, input units, results, errors, required
integrations, and examples. Package READMEs own support and integration
contracts; export maps and TypeScript declarations define importable APIs.
Reference pages explain those owners and do not introduce additional exports.

## Implementation, verification and release

Read package status along four separate dimensions:

| Dimension                      | Evidence to inspect                                                        | What it establishes                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation                 | Package exports, declarations and source                                   | Which APIs exist and what they accept/return.                                                                                            |
| Verification                   | Tests and recorded integration runs, including fixtures and coordinates    | Which behavior was exercised, in which environment. A test file alone is not a successful run.                                           |
| Protocol support               | Canonical capability records and the required qualified review disposition | Whether an operation/deployment has been accepted for its stated use. Module-level acceptance does not promote every embedded operation. |
| Distribution and compatibility | Package metadata, released artifacts and runtime checks                    | How consumers obtain the package and which runtime/version contract is offered.                                                          |

The runtime packages expose documented workspace entrypoints while remaining
unpublished. For a chosen operation, check the owning package's README for
support and integration scope and its reference for exact verification limits.
A source implementation, accepted evidence record, and released capability
establish different things.

## Setup

- **In an MDK checkout:** follow [workspace setup](../guides/SDK_DEVELOPMENT.md#install-and-verify-the-workspace).
  Declare the selected `workspace:*` dependency in the consumer and import its
  public package entrypoint.
- **In an independent application:** follow [private artifact setup](../guides/MDK_CLI.md#start-here)
  and the [application integration guide](../guides/EXTERNAL_APPLICATIONS.md).

Built declarations and JavaScript are emitted to package `dist/` directories.
A missing build is distinct from an unavailable export; inspect the package
manifest and build instructions before changing an import.

## Integration sequence

1. Parse user amounts and addresses with EVM. Keep financial amounts as bigint
   base units, using the asset owner's precision.
2. Resolve a network with Chains and create a Contracts registry.
3. Supply a transport implementing the selected reader's exported port. A
   network identity does not select an RPC URL or certify a provider.
4. Use the existing `createSavingsRpcReader`, `createLendingRpcReader` and
   `createVaultRpcReader` adapters for Core RPC transports, or supply the
   lower-level reader ports for a different integration. Core leaves domain
   decoding to the owning package.
5. Read at an explicit block, or let the reader select one head. Keep the
   returned network/block/hash and timestamp where present.
6. Inspect each availability discriminant before using a value. Missing debt,
   rewards, or prices must not become zero.

## Runnable workflows

The [examples index](../../examples/README.md) covers borrowing, liquidity,
swaps, bridging, Savings, lending, vault deposits, CL positions, locks/voting
and redemptions. Each recipe supplies setup, explicit inputs, commented
transaction steps, settlement interpretation and failure handling. The shared
runtime provides bounded HTTP, exact approvals, durable submission records and
restart inspection. Imports alone never execute a workflow.

Build with `pnpm --filter '@mezo-dev-kit/examples...' build`. Offline checks use
`pnpm --filter @mezo-dev-kit/examples test`; transaction commands require an
explicit verified local fork. Follow the examples index for Anvil and fixture
setup. These runs exercise the private writer APIs without changing release
status or asserting fresh bridge delivery.

## Transaction boundary

Core coordinates simulation, submission intent, receipt observation, and
reconciliation. The owning protocol defines preparation and the outcome that
must be verified. A transaction hash alone does not establish success.

Writer workflows follow preparation, any separate approval and re-preparation,
exact-call simulation, submission, observation, and protocol reconciliation.
Applications own consent, wallet fee policy, RPC timeouts, and durable atomic
storage. Each package reference defines required bounds and distinguishes
preflight checks from on-chain guarantees.

Use the [transaction lifecycle](transaction-lifecycle.md) for the shared model
and [example connections](../../examples/SETUP.md#follow-one-transaction) for
concrete construction. The [workflow examples](../../examples/README.md#what-executes-locally)
explain local-fork fixtures and their limits. Package references retain the
individual harness commands, native-engine assumptions, and compatibility scope.

## Maintaining the references

Update the owning package's reference, README, and executable example with any
public export, input, result, error, unit, or support change. Cover methods on
returned clients as well as top-level exports. Keep future API proposals out of
the current method inventory. Validate examples against built public entrypoints
and run applicable checks from [CONTRIBUTING](../../CONTRIBUTING.md#verification).
