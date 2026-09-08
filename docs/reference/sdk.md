# SDK package reference

The SDK has fifteen implemented private workspace packages. Classic MUSD borrowing,
Savings, mUSDC lending, USDC Lending Vault and their gauges have explicit writer
APIs alongside signer-free readers. Tokens owns separate approval workflows;
Core owns simulation, submission and recovery. Writer support remains proposed
pending qualified protocol review and release.

## Package selection

| Package                            | Use it for                                                     | Methods, types, and examples                                                    |
| ---------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `@mezo-dev-kit/musd-borrowing`     | Classic borrower state and direct operations                   | [Borrowing SDK reference](../../packages/protocols/musd-borrowing/REFERENCE.md) |
| `@mezo-dev-kit/evm`                | Typed EVM values, exact units, and bounded ABI codecs          | [EVM reference](../../packages/evm/REFERENCE.md)                                |
| `@mezo-dev-kit/chains`             | Accepted network identities and capability metadata            | [Chains reference](../../packages/chains/REFERENCE.md)                          |
| `@mezo-dev-kit/contracts`          | Deployment/runtime identity and read or curated operation ABIs | [Contracts reference](../../packages/contracts/REFERENCE.md)                    |
| `@mezo-dev-kit/core`               | Block-consistent reads, event scans and transaction execution  | [Core reference](../../packages/core/REFERENCE.md)                              |
| `@mezo-dev-kit/musd-redemptions` | Bounded redemption quotes, traced output and direct execution | [Redemptions reference](../../packages/protocols/musd-redemptions/REFERENCE.md) |
| `@mezo-dev-kit/musd-institutional-debt` | Enclave authority, positions, fees and pledged collateral | [Institutional reference](../../packages/protocols/musd-institutional-debt/REFERENCE.md) |
| `@mezo-dev-kit/pools` | Basic pool discovery, liquidity and LP fees | [Pools reference](../../packages/protocols/pools/REFERENCE.md) |
| `@mezo-dev-kit/swaps` | Bounded basic quotes and exact-input swaps | [Swaps reference](../../packages/swaps/REFERENCE.md) |
| `@mezo-dev-kit/prices`             | Explicit scale, freshness and direct Skip observations         | [Prices reference](../../packages/prices/REFERENCE.md)                          |
| `@mezo-dev-kit/tokens`             | Exact balances, allowances and explicit approvals              | [Token reference](../../packages/tokens/REFERENCE.md)                           |
| `@mezo-dev-kit/incentives`         | Gauge workflows, escrow locks, boost and voting calculations   | [Incentives reference](../../packages/protocols/incentives/REFERENCE.md)        |
| `@mezo-dev-kit/musd-savings`       | sMUSD principal and MUSD indexed yield                         | [Savings reference](../../packages/protocols/musd-savings/REFERENCE.md)         |
| `@mezo-dev-kit/musdc-lending`      | BTC/mUSDC Morpho market, debt, shares, interest, and health    | [Lending reference](../../packages/protocols/musdc-lending/REFERENCE.md)        |
| `@mezo-dev-kit/usdc-lending-vault` | Depositor shares, wrapper yield, previews, and gauge ownership | [Vault reference](../../packages/protocols/usdc-lending-vault/REFERENCE.md)     |

Each package reference inventories its public runtime functions, methods on
returned objects, exported types, input units, results, errors, required
integrations, and examples. Package READMEs own support and integration
contracts; export maps and TypeScript declarations define importable APIs.
Reference pages explain those owners and do not introduce additional exports.

## Setup

Use a source checkout with Node 24 or newer and the root-pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Consume `@mezo-dev-kit/...` package-root imports from a workspace consumer
declaring the corresponding `workspace:*` dependencies. These packages are
private and are not available through an npm installation command. Built
declarations are emitted to each package's `dist/` directory. See the
[development quickstart](../guides/SDK_DEVELOPMENT.md) for the complete workflow
and [external application guidance](../guides/EXTERNAL_APPLICATIONS.md) for
distribution boundaries.

## Integration sequence

1. Parse user amounts and addresses with EVM. Keep financial amounts as bigint
   base units, using the asset owner's precision.
2. Resolve a network with Chains and create a Contracts registry.
3. Supply a transport implementing the selected reader's exported port. A
   network identity does not select an RPC URL or certify a provider.
4. Supply the codec ports required by the Savings, lending, and vault readers.
   Borrowing uses EVM's scalar codec internally. Core accepts pre-encoded
   calldata and leaves domain decoding to its consumer.
5. Read at an explicit block, or let the reader select one head. Keep the
   returned network/block/hash and timestamp where present.
6. Inspect each availability discriminant before using a value. Missing debt,
   rewards, or prices must not become zero.

The reference examples use typed injected ports rather than an undeclared
client dependency. Reader functions can be called once an application supplies
those ports. The default executable example tests use deterministic fakes; they
do not certify a production RPC/codec adapter or live state.

The foundation example also includes an application-owned
[bounded HTTP transport and opt-in RPC command](../../examples/foundational-readonly/README.md#bounded-http-read).
It demonstrates a raw block-pinned read using an explicitly supplied endpoint
and calldata. It is example source, not a reusable SDK adapter export.

| Executable example                                            | Workspace command                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Foundations](../../examples/foundational-readonly/README.md) | `pnpm --filter @mezo-dev-kit/example-foundational-readonly test`       |
| [Savings](../../examples/musd-savings-readonly/README.md)     | `pnpm --filter @mezo-dev-kit/example-musd-savings-readonly test`       |
| [Lending](../../examples/musdc-lending-readonly/README.md)    | `pnpm --filter @mezo-dev-kit/example-musdc-lending-readonly test`      |
| [Vault](../../examples/usdc-lending-vault-readonly/README.md) | `pnpm --filter @mezo-dev-kit/example-usdc-lending-vault-readonly test` |

## Transaction boundary

Contracts preserves readAbi and adds curated mainnet operation/event and
discovered-role interfaces. Core adds exact simulation, explicit signer binding, atomic submission
intent reservation, receipt observation and domain reconciliation. The old
transaction proof remains private. A hash is not protocol success.

Each writer follows `prepare → approval if needed → prepare again → simulate
→ submit → observe → reconcile`. Applications own consent, wallet gas/fee
policy, RPC timeouts and durable atomic storage. Approvals and protocol actions
are separate transactions. Each reference names exact amount units, required
bounds and which checks are preflight rather than on-chain guarantees.

Public-entrypoint fork harnesses are available for
[Savings](../../packages/protocols/musd-savings/test/fork.ts),
[Lending](../../packages/protocols/musdc-lending/test/fork.ts) and
[Vault/gauges](../../packages/protocols/usdc-lending-vault/test/fork.ts).
They require a fresh local Anvil mainnet fork, never send source-chain writes,
and revert their snapshots. Anvil cannot execute mezod native dispatch, so
oracle/native token boundaries use labelled fixtures. Compile the test-only
native token with an already installed Solidity 0.8.19 compiler:

```sh
forge build --root /tmp/mdk-native-token-fixture --contracts "$PWD/scripts/fixtures" --use 0.8.19 --offline
node packages/protocols/musd-savings/test/fork.ts http://127.0.0.1:18545 /tmp/mdk-native-token-fixture/out/NativeTokenFixture.sol/NativeTokenFixture.json
node packages/protocols/musdc-lending/test/fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL" /tmp/mdk-native-token-fixture/out/NativeTokenFixture.sol/NativeTokenFixture.json
node packages/protocols/usdc-lending-vault/test/fork.ts http://127.0.0.1:18545 "$SOURCE_RPC_URL" /tmp/mdk-native-token-fixture/out/NativeTokenFixture.sol/NativeTokenFixture.json
```

Run these sequentially against the same fresh fork. Build the workspace first.
The fixtures verify SDK/EVM protocol composition; native engine behavior and
qualified release review remain separate evidence requirements.

Use the [borrowing SDK reference](../../packages/protocols/musd-borrowing/REFERENCE.md)
for implemented methods and examples. The [protocol reference](musd-borrowing.md)
owns canonical behavior. The local fork harness uses an explicit native-oracle
response fixture because Anvil cannot execute Mezo precompiles. Private
implementation does not establish production release support. Protocol readers
use Node crypto; browser bundling has not been verified.

## Maintaining the references

Update the owning package's reference, README, and executable example with any
public export, input, result, error, unit, or support change. Cover methods on
returned clients as well as top-level exports. Keep future API proposals out of
the current method inventory. Validate examples against built public entrypoints
and run applicable checks from [CONTRIBUTING](../../CONTRIBUTING.md#verification).
