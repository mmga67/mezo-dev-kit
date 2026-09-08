# Swaps SDK reference

Import from `@mezo-dev-kit/swaps`. The [README](README.md) owns the private
mainnet basic-pool scope. [Pools](../protocols/pools/REFERENCE.md) owns discovery,
token compatibility, reserve and LP accounting; [Core](../core/REFERENCE.md)
owns execution and durable records. These amount-specific DEX observations have
source class `dex-execution-quote`; they are not protocol oracle prices.

## Routes and quotes

`validateBasicSwapRoute(route, intermediateAssets): readonly BasicSwapHop[]`
returns frozen lowercase hops. A `BasicSwapHop` has `tokenIn`, `tokenOut` and an
explicit boolean `stable`. Require one to three hops, nonzero distinct assets,
contiguous outputs/inputs and no repeated asset in the route. Each intermediate
must appear in the caller's explicit allowlist (at most 16 entries). Stable and
volatile pools are different paths. There is no automatic route enumeration.

`createBasicSwapReader({networkId, registry, transport, pools}): BasicSwapReader`
requires `networkId: 'mezo-mainnet'`, Contracts registry, Core `RpcTransport`, and
a verified Pools `BasicPoolReader`. `quote(input: BasicSwapQuoteInput)` requires
`route`, `intermediateAssets`, `account`, positive bigint `amountIn`, and
nonnegative bigint `maxAgeBlocks`. Optional bigint `blockNumber` selects a
historical coordinate; otherwise the reader selects one head. Every pool must
have the same block/hash and Router, positive reserves, ordinary reserve/balance
agreement, an unpaused factory and a valid current fee. The source Router's
`getAmountsOut` supplies exact integer hop estimates. Partial/zero responses,
missing pools and chain/hash changes reject the quote.

`BasicSwapQuote` fields:

| Field                                                  | Meaning                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `sourceClass`, `providerId`, `coordinate`, `timestamp` | DEX provenance and block; timestamp is bigint Unix seconds.                                                  |
| `route`, `intermediateAssets`, `account`, `router`     | Validated caller route policy and destination.                                                               |
| `amountIn`, `amounts`, `estimatedAmountOut`            | Bigint base units. `amounts` has one input plus each hop output; each entry uses that hop asset's precision. |
| `maxAgeBlocks`                                         | Caller maximum preparation age checked before submission.                                                    |
| `inputToken`, `outputToken`                            | Tokens snapshots with asset, precision, balances and Router allowance targets.                               |
| `pools`                                                | Verified pool snapshots in route order.                                                                      |
| `writeCompatible`                                      | Every pool's writer token compatibility passed. Initially only MUSD/mUSDC.                                   |

`rankBasicSwapQuotes(quotes)` accepts 1–64 complete writer-compatible quotes for
the same account, input amount, input/output assets and precisions, age policy,
network, chain and block/hash. It verifies route/pool consistency and sorts
by decreasing output; equal outputs use deterministic route ordering. It throws
on incompatible or incomplete candidates rather than silently mixing requests.
It neither subtracts gas costs nor asserts that an old coordinate is still fresh.
A quote or ranking never authorizes a transfer; writers reread current state.

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createBasicPoolReader } from "@mezo-dev-kit/pools";
import { createBasicSwapReader, rankBasicSwapQuotes } from "@mezo-dev-kit/swaps";
declare const transport: RpcTransport;
declare const account: `0x${string}`, musdc: `0x${string}`, musd: `0x${string}`;
const registry = createContractRegistry();
const pools = createBasicPoolReader({ networkId: "mezo-mainnet", registry, transport });
const reader = createBasicSwapReader({ networkId: "mezo-mainnet", registry, transport, pools });
const quote = await reader.quote({
  route: [{ tokenIn: musdc, tokenOut: musd, stable: true }],
  intermediateAssets: [],
  account,
  amountIn: 10n * 10n ** 6n,
  maxAgeBlocks: 2n,
});
console.log(quote.amounts, quote.outputToken.decimals);
if (quote.writeCompatible) console.log(rankBasicSwapQuotes([quote]));
```

## Exact-input writer

`createBasicSwapWriter({reader, pools, execution}): BasicSwapWriter` consumes the
quote reader, the same verified pool reader and a configured Core `ExecutionClient`.
The account is the sender and final recipient. The Router receives zero native
value. Use Pools' `createBasicPoolTargetResolver` in Core for the selected pool's
explicit token approval targets; use Tokens' `createApprovalWriter` with a
`createTokenReader({transport})` for the separate approval lifecycle.

`BasicSwapBounds` requires positive bigint `amountOutMinimum`, bigint Unix
`deadline`, and positive bigint `maxDeadlineSeconds`. The minimum must not exceed
the current estimate. The deadline must be strictly future and within the caller's
maximum horizon. Both minimum output and deadline are encoded on-chain.

| Method                                  | Result and checks                                                                                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare({operationId, quote, bounds})` | `quote` is a `BasicSwapQuoteInput`, so preparation reads current values. Returns `PreparedBasicSwap` after validating compatibility, bounds, account and input balance.                                                                            |
| `simulate(prepared)`                    | Requires a preparation from this writer and sufficient allowance. Returns Core `SimulatedTransaction`; decodes exact route amounts and checks output minimums in initial and final simulation.                                                     |
| `submit(prepared, simulated)`           | Requires the matching owned simulation. Fresh quote, allowance, balance, deadline, destination/calldata and age must pass before Core submission. Returns `SubmissionRecord`.                                                                      |
| `reconcile(prepared, record)`           | Validates durable intent, confirmed canonical receipt, per-hop gross input/output and fee events, token transfers, segregated fee payment, reserve/supply/LP changes and wallet deltas. Returns `{state: 'reconciled', record, receipt, outcome}`. |

`PreparedBasicSwap` contains `quote`, cloned/frozen `bounds`, Tokens `approval`
plan for the exact input, and Core `transaction`. Confirm each reset/exact
approval separately and prepare again. An allowance transaction's success does
not establish swap success. A prepared quote belongs to its writer instance for
simulation/submission; durable reconciliation verifies its complete call identity.

```ts
import { createBasicSwapWriter } from "@mezo-dev-kit/swaps";
import type { BasicSwapReader, BasicSwapQuoteInput } from "@mezo-dev-kit/swaps";
import type { BasicPoolReader } from "@mezo-dev-kit/pools";
import type { ExecutionClient } from "@mezo-dev-kit/core";
declare const reader: BasicSwapReader, pools: BasicPoolReader, execution: ExecutionClient;
declare const quoteInput: BasicSwapQuoteInput;
declare const operationId: string, minimumOut: bigint;
const writer = createBasicSwapWriter({ reader, pools, execution });
const quote = await reader.quote(quoteInput);
const prepared = await writer.prepare({
  operationId,
  quote: quoteInput,
  bounds: {
    amountOutMinimum: minimumOut,
    deadline: quote.timestamp + 300n,
    maxDeadlineSeconds: 300n,
  },
});
if (prepared.approval.kind !== "sufficient")
  throw new Error("Confirm required approval and prepare again");
// Run after the application's transaction consent; persist and track the returned record.
const simulated = await writer.simulate(prepared);
const record = await writer.submit(prepared, simulated);
const observation = await execution.observe(record);
if (observation.state === "confirmed") console.log(await writer.reconcile(prepared, record));
```

The [local fork walkthrough](test/fork.ts) includes setup, bounded approval/reset
loops and full protocol reconciliation. Production callers supply atomic Core
storage and preserve the JSON-safe submission record plus domain preparation and
bounds (serialize bigint explicitly). Track uncertain submissions by existing
identity; do not blindly prepare another swap. Reorgs/replacements and receipt
failures retain Core's lifecycle distinctions.

`BasicSwapOutcome` contains actual bigint `amountIn`, `amountOut`, each-hop
`amounts`, each-hop input-asset `fees`, and receipt `coordinate`. Reconciliation
uses the preceding block and receipt block. Other activity affecting the same
wallet or pool in that block can produce a reconciliation mismatch requiring
investigation. Do not treat a receipt alone as accepted output.

`SwapError` has `code: SwapErrorCode`: `InvalidInput`, `UnavailableRoute`,
`InconsistentQuote`, `BoundExceeded`, `ApprovalRequired`, or
`ReconciliationMismatch`. EVM, Pools, Contracts, transport and Core errors also
propagate. Refresh stale quotes; resolve identity/output mismatches before retrying.
Exported types also include `BasicSwapHop`, `BasicSwapQuoteInput`, `BasicSwapQuote`,
`BasicSwapReader`, `BasicSwapBounds`, `PreparedBasicSwap`, `BasicSwapOutcome`, and
`BasicSwapWriter`.
