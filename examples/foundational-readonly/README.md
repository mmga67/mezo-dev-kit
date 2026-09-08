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

The default command is an offline integration fixture. Its result establishes
built-package composition, not live protocol state.

## Bounded HTTP read

`src/http-transport.ts` implements Core's injected port using Node's `fetch`.
The `read:rpc` command uses the public Chains identity and Contracts registry,
then asks Core for one block-consistent read. It prints the network, block/hash,
observation time, deployment and ABI evidence coordinates, calldata, and raw
result. Its source is example-owned integration code, not a new SDK export.

Before running, apply the
[capability assessment](../../agents/skills/mdk-capability-assessment/SKILL.md)
and network/contract procedures. Resolve an endpoint from the Networks module
index resource `rpc-endpoints`, inspect its scope, review/freshness and method
limitations, and supply its URL explicitly as `MDK_RPC_URL`. No default URL or
credential is embedded. Required methods are `eth_chainId`, `eth_blockNumber`,
`eth_getBlockByNumber`, and `eth_call` with an
[EIP-1898 canonical block hash](https://eips.ethereum.org/EIPS/eip-1898).
Provider rejection remains a failure; there is no silent switch to `latest`.

Choose a `view` or `pure` function from the resolved public `readAbi` at the
intended coordinate. Calldata encoding and return decoding are caller-owned
inputs. The CLI validates byte formatting, not ABI selector membership or
protocol meaning. For example, use the `decimals()` view in the MUSD token ABI
(stable resource `contracts:abi.musd.token`) with your existing ABI encoder.
If Foundry's `cast` is already installed:

```sh
pnpm build
# Set MDK_RPC_URL to the explicitly reviewed endpoint in your shell.
pnpm --filter @mezo-dev-kit/example-foundational-readonly read:rpc \
  --network mezo-mainnet --contract musd.token \
  --data "$(cast calldata 'decimals()')"
```

`cast` is an optional caller-side encoding example, not an installed runtime
dependency. The command accepts equivalent encoded calldata from an existing
codec. Verify the function and output against the resolved ABI; do not copy an
address, ABI, or expected Mezo value into the example.

The adapter validates JSON-RPC IDs/envelopes, quantities and return bytes,
bounds each request to ten seconds and each response to one MiB, and performs
no retries. Core checks chain identity before reading; the command checks the
chain and block again afterwards. Errors expose method/codes without copying
provider messages or credential-bearing endpoints. Tests use synthetic fetch
responses and prove serialization and failures; they are separate from the
explicit live command. Preserve live output and endpoint provenance in the
task/review record, not as a permanently fresh protocol fact in this README.

## Remaining integration boundaries

This demonstrates a raw read through supported workspace components. An
account-history request still needs a defined source, range, and completeness
contract. Signing/submission needs its actual supported execution integration
and signer inputs, assessed from the current checkout. Do not infer either
capability from successful reads, assume an unlocked account, or deep-import
Core's internal proof. A successful command establishes only the methods and
coordinate observed; it does not establish general provider health, arbitrary
historical access, ABI codec correctness, or protocol operation completion.
