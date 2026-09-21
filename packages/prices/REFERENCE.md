# Prices SDK reference

Use `@mezo-dev-kit/prices` to normalize a source price to an explicit decimal scale, assess its age,
or read the mainnet Skip feed. The normalization and freshness helpers are local calculations; the
Skip reader uses an injected RPC transport. None of these operations needs a signer.

A price's **scale** tells you how to interpret its integer value. Its **freshness** compares the
publication time with a time and maximum age you supply. A correctly scaled price may still be
stale. A missing confidence value stays unavailable; it does not mean zero uncertainty.

See [package scope](README.md) for runtime/support boundaries and
[Prices knowledge](../../knowledge/prices/README.md) for source ownership.

On this page:

- [Decimal normalization](#decimal-normalization)
- [Explicit freshness](#explicit-freshness)
- [Mainnet Skip reader](#mainnet-skip-reader)
- [Errors and exported types](#errors-and-exported-types)

## Decimal normalization

### `normalizePriceAmount` — convert decimal scale

Choose the output precision and rounding policy explicitly, then inspect the returned status before
using the amount.

`normalizePriceAmount(input: PriceAmountInput): PriceAmountResult` interprets `raw × 10^exponent` in
whole quote units and returns integer units at `targetDecimals`. Every policy field is required:

| Field                | Meaning                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `raw`                | Signed bigint source integer; negatives produce `negative`.                    |
| `exponent`           | Safe integer decimal exponent, commonly minus source decimals.                 |
| `targetDecimals`     | Integer precision from 0 through 77.                                           |
| `rounding`           | `PriceRounding`: `toward-zero`, `floor`, `ceiling`, or `nearest-ties-to-even`. |
| `zeroAllowed`        | Whether raw or rounded zero is valid for this consumer.                        |
| `allowPrecisionLoss` | Whether division may discard a nonzero remainder.                              |

A `valid` result contains bigint `value` and `remainderDiscarded`. Other results are `negative`,
`zero-invalid`, or `failed` with `exponent-overflow`, `numeric-overflow`, or
`unsupported-precision-loss`. Raw nonnegative and result values must fit uint256; the effective
decimal power is bounded to ±77. Invalid policy shape throws `PriceError` with `InvalidInput`. Floor
and toward-zero agree because negative prices are rejected before arithmetic.

Normalize a synthetic eight-decimal price to 18 decimals, then inspect how missing confidence is
represented:

```ts
import { normalizePriceAmount, normalizePriceConfidence } from "@mezo-dev-kit/prices";

const policy = {
  exponent: -8,
  targetDecimals: 18,
  rounding: "floor",
  allowPrecisionLoss: false,
} as const;

const price = normalizePriceAmount({ ...policy, raw: 6000000000000n, zeroAllowed: false });

if (price.status === "valid") {
  console.log(price.value, price.remainderDiscarded);
}

console.log(normalizePriceConfidence({ ...policy, raw: null }));
```

The valid price represents 60,000 whole quote units at 18 decimals. The confidence result is
`unsupported` with `value: null`; it is not a numeric confidence estimate.

### `normalizePriceConfidence` — preserve missing confidence

Normalize a confidence amount using its source-defined scale, including an explicit unavailable
result when the source supplies none.

`normalizePriceConfidence(input)` takes the same scale/rounding policy, omits `zeroAllowed`, and
permits `raw: bigint | null`. It permits genuine zero confidence. `PriceConfidenceResult` is a
`PriceAmountResult` or `unsupported` with `value: null` and
`limitation: 'source-confidence-unavailable'`. A missing confidence value is never synthesized as
zero or a percentage. The consuming source must establish the confidence exponent and meaning.

## Explicit freshness

### `evaluatePriceFreshness` — compare publication age

Supply both the publication time and the time at which you want to assess it. This makes historical
checks reproducible.

`evaluatePriceFreshness({publishedAt, asOf, maxAgeSeconds}): PriceFreshness` uses nonnegative bigint
Unix seconds. `publishedAt` can be null. Equality with `maxAgeSeconds` is valid. Results `valid` and
`stale` contain bigint `ageSeconds`; `future-dated` and `missing-time` contain `ageSeconds: null`.
Zero is a timestamp in this helper; each source owns any zero-as-missing convention. Invalid
unsigned values throw the EVM representation error. No clock is consulted.

Check a publication exactly at the allowed age boundary:

```ts
import { evaluatePriceFreshness } from "@mezo-dev-kit/prices";

const freshness = evaluatePriceFreshness({ publishedAt: 1000n, asOf: 1005n, maxAgeSeconds: 5n });

console.log(freshness); // valid, ageSeconds: 5n
```

The result is `valid` with `ageSeconds: 5n`. All three time values are bigint seconds, and the
helper never reads the system clock.

## Mainnet Skip reader

### `createSkipPriceReader` — configure the source reader

Use the Contracts registry and a Core transport for the accepted mainnet source.

`createSkipPriceReader({networkId, registry, transport}): SkipPriceReader` requires
`networkId: 'mezo-mainnet'`, a Contracts `ContractRegistry` and Core `RpcTransport`. Other networks
throw `PriceError('UnsupportedSource')`. The returned method is
`read(input: SkipPriceReadInput): Promise<SkipPriceObservation>`.

### `reader.read` — observe price and freshness

Choose the scale and time policy for this observation.

`read` accepts optional bigint `blockNumber` (otherwise one head is selected), required bigint
`asOf`, `observedAt`, `maxAgeSeconds`, and required `targetDecimals`, `rounding`,
`allowPrecisionLoss`. Times are Unix seconds; `observedAt` cannot precede the selected block. The
provider's chain, native interface code, canonical source scale, publication/block time and final
block hash/chain are checked. Configuring HTTP/timeouts/cancellation belongs to the injected
transport. Required RPC failure throws; it never becomes a price.

### Understanding a Skip observation

Use the normalized value only after checking the observation and normalization statuses. Invalid
observations preserve information for diagnosis.

The observation retains source/feed IDs, `sourceClass: 'pushed-feed-observation'`, base/quote
assets, provider ID, coordinate, block timestamp, resolved contract and catalog provenance, all
input policies, source/target precision, the raw five-field `round`, `normalization`, `freshness`,
`confidence: null` and limitations. `status` is `valid` only when normalization and freshness are
valid. Stale/negative/zero/missing-time observations remain inspectable with `invalid` status.
Publication time zero means missing for Skip; round identifiers are retained without inventing
Chainlink round rules for the native interface.

Read Skip with an application-supplied Core transport and Unix observation time. This excerpt
assumes those dependencies are configured:

```ts
import { createContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import { createSkipPriceReader } from "@mezo-dev-kit/prices";

declare const transport: RpcTransport;
declare const observationTime: bigint;

const reader = createSkipPriceReader({
  networkId: "mezo-mainnet",
  registry: createContractRegistry(),
  transport,
});

const result = await reader.read({
  asOf: observationTime,
  observedAt: observationTime,
  maxAgeSeconds: 60n,
  targetDecimals: 18,
  rounding: "floor",
  allowPrecisionLoss: false,
});

if (result.status === "valid" && result.normalization.status === "valid") {
  console.log(result.normalization.value, result.coordinate, result.sourceClass);
}
```

Only a valid observation with valid normalization reaches the log statement. The coordinate and
source class identify where the amount came from; other statuses remain available for diagnosis.

This is a direct source observation. A DEX quote, Pyth feed or direct Skip value cannot be
relabelled as an unavailable protocol PriceFeed result. The six `PriceSourceClass` values describe
protocol oracle state, pushed feeds, offchain market references, DEX observations, DEX execution
quotes and stored analytics. Only the direct Skip class has an RPC reader here. No fallback
selector, Pyth reader or updater is implemented.

## Errors and exported types

`PriceError` exposes `name`, `message`, and `code: PriceErrorCode`: `InvalidInput`,
`UnsupportedSource`, or `InconsistentCoordinate`. EVM validation, Contracts resolution/runtime
verification, and injected RPC errors also propagate; there is no automatic retry. Retry a bounded
read only after resolving the cause.

The exported types are `PriceRounding`, `PriceSourceClass`, `PriceErrorCode`, `PriceAmountInput`,
`PriceAmountResult`, `PriceFreshness`, `PriceConfidenceResult`, `SkipPriceReadInput`,
`SkipPriceObservation`, and `SkipPriceReader`, as described above. Borrowing and Lending own their
separate protocol-price contracts.
