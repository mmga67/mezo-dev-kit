# MUSD borrowing SDK

`@mezo-dev-kit/musd-borrowing` implements classic MUSD borrower state,
integer calculations, sorted insertion hints and direct borrower preparation,
simulation, submission and reconciliation. See the complete [SDK reference](REFERENCE.md).

This is a private source implementation for the mainnet deployment identity,
with local-fork verification. Canonical operation support remains proposed
pending qualified protocol review; it is not a published or production-approved
writer. No live transaction is authorized by importing this package.

The borrower methods cover opening, adding/withdrawing native BTC collateral,
borrowing more MUSD, partial repayment, combined adjustment, refinancing,
closing and claiming collateral surplus. Core owns the explicit signer,
submission journal and receipt checks. Applications own connection, consent,
RPC requests, timeouts, scheduling and durable storage.

The reader verifies borrower-contract runtime hashes, proxy generations and
topology at one block, checks PriceFeed's native-oracle identity and signed
answer, and preserves already-entire position accounting. Native-oracle engine
behavior remains a chain/provider trust boundary. No legacy package is imported.

```sh
pnpm install --frozen-lockfile
pnpm --filter @mezo-dev-kit/musd-borrowing... build
pnpm --filter @mezo-dev-kit/musd-borrowing test
```

For the explicit local integration harness, start a fresh Anvil fork using a
mainnet RPC URL and an exact block number, with chain ID from Chains. Then run:

```sh
node packages/protocols/musd-borrowing/test/fork.ts http://127.0.0.1:18545 "$MEZO_READ_RPC"
```

The harness refuses a non-local target or a non-Anvil client. It captures the
native oracle's two read responses at the fork block and installs a labelled
response fixture because Anvil cannot execute Mezo's native precompile. It
uses local account impersonation to fund close fees and create surplus through
actual pool entrypoints. Borrowing contract code is unchanged; local fixture
state is reverted afterward. This proves the EVM writer integration with the
fixture, not Mezo's native oracle implementation or redemption execution.

Node 24 is the development baseline. The reader uses Node crypto for runtime
hashing; browser bundling has not been verified. Testnet, relayed signatures,
smart accounts, liquidation, redemption and emergency close with minting
disabled are outside this initial writer slice.
