# MDK examples

Learn the package APIs through focused TypeScript operations, then follow the
larger workflows to see them composed. Start with code; the CLI is an optional
way to run the local demonstrations.

1. Read [setup.ts](setup.ts) and the [connection guide](SETUP.md) to see how
   application RPC, wallet and storage become MDK inputs.
2. Choose a focused file in the [complete package index](PACKAGES.md), such as
   [open a position](borrow-musd/open-position.ts),
   [deposit MUSD](save-musd/deposit.ts), [add liquidity](provide-basic-liquidity/add.ts)
   or [swap one route](swap-tokens/swap.ts).
3. Follow preparation, any approvals, simulation, submission, confirmation and
   reconciliation in that file. Its return value contains the actual result.
4. Continue to the lifecycle below for additional actions, amount conversion,
   quote-derived bounds, custody changes and recovery.

Every implemented package has an entry in [PACKAGES.md](PACKAGES.md), including
EVM values, Chains, Contracts, Core, Tokens, Prices, institutional debt and project
tooling. The four unimplemented package directories are recorded there too.

## Run the offline foundation examples

For a frontend, start with the [offline browser form](browser/README.md), which
uses public EVM exports for exact amounts and portable hashing without a wallet
or RPC endpoint. The [browser integration guide](../docs/guides/BROWSER_APPLICATIONS.md)
covers request adapters, SSR and production verification.

After the build below, this program demonstrates exact amounts, registry
metadata, price policy, repayment allocation and project configuration:

```sh
pnpm --filter @mezo-dev-kit/examples foundations
```

Read [foundations.ts](foundations.ts) for the explicit sample inputs and calls.
It needs no RPC or wallet. Transaction examples use the local fork setup below.

## Complete lifecycle demonstrations

| Example                                                 | What you complete                                                   | Additional variants                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| [Borrow MUSD](borrow-musd/README.md)                    | Open a BTC-backed position, add collateral, repay and close         | Fee and interest funding                                     |
| [Provide liquidity](provide-basic-liquidity/README.md)  | Add basic-pool liquidity, generate fees, remove liquidity and claim | Partial and full removal                                     |
| [Swap tokens](swap-tokens/README.md)                    | Compare candidates, approve, swap and verify received tokens        | CL route; rejected second transaction in a mixed route       |
| [Bridge MUSD](bridge-musd/README.md)                    | Quote both chains, send on the source fork and persist the transfer | Historical delivery observation; manual recovery composition |
| [Save MUSD](save-musd/README.md)                        | Deposit, claim indexed yield and withdraw                           | Stake/claim/unstake receipts                                 |
| [Lend or borrow mUSDC](lend-and-borrow-musdc/README.md) | Supply and withdraw; collateralize, borrow and fully repay          | Separate supplier and borrower paths                         |
| [Use the USDC vault](use-usdc-vault/README.md)          | Deposit assets and redeem the resulting shares                      | Wrap, stake, unstake and unwrap                              |
| [Manage a CL position](manage-cl-position/README.md)    | Mint, increase, decrease, collect and burn an NFT                   | Gauge custody; new range after exit                          |
| [Lock and vote](lock-and-vote/README.md)                | Create veBTC, vote, reset and withdraw after expiry                 | Explicit local epoch advancement                             |
| [Redeem MUSD](redeem-musd/README.md)                    | Quote a bounded queue, trace output, redeem and reconcile BTC       | Partial-fill accounting                                      |

## Build and run

Use Node 24+ and the repository's pinned pnpm. Packages are private workspace
dependencies; run from this checkout. The commands below build the dependencies
and examples through their public exports.

```sh
pnpm install --frozen-lockfile
pnpm --filter '@mezo-dev-kit/examples...' build
pnpm --filter @mezo-dev-kit/examples test
pnpm --filter @mezo-dev-kit/examples test:built
```

Install Anvil separately if it is not already available. Choose a Mezo mainnet
RPC with historical state at your selected block. Network identity and provider
selection are separate; see the [network guide](../packages/chains/README.md).
These commands require values you supply:

```sh
export MDK_SOURCE_RPC_URL='https://YOUR_MEZO_RPC'
export MDK_FORK_BLOCK='YOUR_BLOCK_NUMBER'
anvil --fork-url "$MDK_SOURCE_RPC_URL" --fork-block-number "$MDK_FORK_BLOCK" \
  --chain-id 31612 --host 127.0.0.1 --port 18545 --silent
```

Keep Anvil running. In another terminal with the same source URL:

```sh
export MDK_SOURCE_RPC_URL='https://YOUR_MEZO_RPC'
export MDK_RUN_ID='borrow-01'
pnpm --filter @mezo-dev-kit/examples borrow-musd --mode fork
```

Every run verifies Anvil, chain identity, and the exact source parent hash before
exposing the local account. The runner selects the first unlocked Anvil account,
funds it inside a snapshot, and restores the snapshot on completion or failure.
Run one recipe at a time. Use a fresh run ID for each independent run. `--help`
lists commands and variants. `MDK_LOCAL_RPC_URL` can change the loopback port.

Amounts in the examples are illustrative configuration. Token readers supply
precision; financial values remain integer base units. The headline workflows
use an existing MUSD/mUSDC pool or the deployed BTC/mUSDC market. Discovery may
fail at a different block if the relevant deployment, liquidity or liveness is
absent. A recipe stops with that failure instead of selecting another protocol.

## What executes locally

The writer APIs exist in the private workspace. Their release status remains
governed by [package references](../docs/reference/sdk.md) and canonical evidence.
The CLI exposes local-fork execution under those limits.

[Fixture setup](runtime/local-fixtures.ts) impersonates existing token holders
only on the verified local fork. Borrowing and market-dependent recipes capture
the native oracle's responses at the source parent because Anvil does not run
Mezo's native engine. BTC/MEZO token execution needs the explicit repository
test contract for borrower, lock and gauge variants. Real escrow, pool, market
and router contracts execute against the fork; native-engine behavior is modeled.

For those variants, compile the existing
[NativeTokenFixture](../scripts/fixtures/NativeTokenFixture.sol) with an installed
Solidity 0.8.19 compiler and set its Foundry artifact path. No example installs a
compiler or downloads dependencies:

```sh
forge build --root . --contracts scripts/fixtures --out /tmp/mdk-example-fixtures \
  --cache-path /tmp/mdk-example-fixture-cache --use /ABSOLUTE/PATH/TO/solc-0.8.19
export MDK_NATIVE_TOKEN_ARTIFACT='/tmp/mdk-example-fixtures/NativeTokenFixture.sol/NativeTokenFixture.json'
```

The runtime labels funding, native models, donated Savings yield, and time
advancement in its output. These fixtures do not establish production support
or fresh cross-chain attestation. Source RPC access is read-only; mutation RPCs
accept only a verified loopback Anvil endpoint.

## Read the transaction path

Each focused operation keeps the important steps visible; lifecycle files call
those operations and add subsequent actions:

1. Read current identity, balances, positions and limits; calculate the expected result.
2. Prepare bounded inputs. If needed, execute one exact approval/reset and prepare again.
3. Simulate the exact action. Reserve its operation ID and sender nonce durably before submitting.
4. Wait for bounded confirmation, reconcile with the domain writer, and inspect actual amounts and bounds.

Comments explain units, custody, timing and decisions. They do not narrate each
TypeScript statement. Shared helpers handle HTTP, approval mechanics, polling
and journal persistence; protocol actions stay in their recipe.

## Inspect an interrupted run

`local/examples/<run-id>/submissions.json` stores JSON-safe intents and hashes,
including reservations for which submission returned no hash. This journal is
local and ignored. It uses a file lock and atomic replacement to reserve both
operation IDs and sender nonces across processes. A leftover lock stops writes;
inspect the owning process and journal before removing it.

Use `--keep-state` when you intend to inspect the resulting fork after the
process exits. Start a fresh fork before the next independent recipe.

```sh
MDK_RUN_ID=borrow-02 pnpm --filter @mezo-dev-kit/examples borrow-musd --mode fork --keep-state
MDK_RUN_ID=borrow-02 pnpm --filter @mezo-dev-kit/examples resume --mode observe
```

Resume checks the saved calls and canonical receipts without submitting. It is
receipt inspection, not reconstructed domain reconciliation. Use the owning
reader to inspect current protocol state. Prepared objects belong to their
writer instance: do not deserialize one and cast it into a new writer. Missing
hashes, missing receipts, reverted execution, changed blocks and violated bounds
require investigation. None automatically authorizes a retry. Restoring an
Anvil snapshot makes its former local transactions disappear, as expected.

## Verification

Offline tests cover HTTP boundaries, source mutation rejection, durable
reservations, uncertainty and import/build behavior. Fork runs exercise real
contract lifecycles with the labeled fixtures above. Neither checks external
wallet behavior nor establishes guardian-attested delivery. See each guide for
the expected outcome and the prerequisite that can prevent it.
