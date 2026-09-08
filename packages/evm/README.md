# MDK EVM values

See the [SDK reference](REFERENCE.md) for every public function, type, and usage example.

`@mezo-dev-kit/evm` owns reusable EVM representation validation and exact
conversion for private MDK workspace consumers. It is part of the GitHub
source alpha, not a published package or a transaction API. Use its public
entrypoint instead of copying regexes, integer coercion, or decimal scaling.

The scalar ABI codec also provides `encodeFunctionData`,
`decodeFunctionResult`, and `decodeEventLog` over explicit canonical entries.
See the reference for supported types and `InvalidAbi` failures. It uses the
already approved Ox version and exposes no provider or Ox types.

```ts
import {
  parseUserAddress,
  parseHash32,
  parseRpcQuantity,
  toRpcQuantity,
  parseUnitsExact,
  formatUnitsExact,
} from "@mezo-dev-kit/evm";

// Values at RPC and user boundaries start as unknown.
const recipient = parseUserAddress("0x1111111111111111111111111111111111111111");
const blockHash = parseHash32(`0x${"ab".repeat(32)}`);
const block = parseRpcQuantity("0x10"); // 16n
const blockParameter = toRpcQuantity(block); // "0x10"
const amount = parseUnitsExact("1.25", 6); // 1250000n
const display = formatUnitsExact(amount, 6); // "1.25"
```

## Representation contract

The following is the canonical MDK primitive API contract. Protocol and
application requirements are additional checks, not alternative encodings.

| API                                 | Accepted input and result                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isAddress`, `parseAddress`         | Exactly 20 hex bytes with lowercase `0x` prefix; any digit case, including zero. Parsing returns lowercase and does not check a checksum. Use for RPC representation.                                                  |
| `parseUserAddress`                  | Same shape, but any input containing uppercase digits must exactly match ERC-55 before normalization. Lowercase is accepted. Returns lowercase.                                                                        |
| `formatChecksumAddress`             | Shape-valid address to ERC-55 display text. Does not establish that an input checksum was correct; use `parseUserAddress` first for user input.                                                                        |
| `isHash32`, `parseHash32`           | Exactly 32 hex bytes. Parsing returns lowercase; this proves no on-chain identity or existence.                                                                                                                        |
| `isHexData`, `parseHexData`         | Complete hex byte pairs, including empty `0x`. Leading zero bytes are preserved; parsing returns lowercase.                                                                                                            |
| `isRpcQuantity`, `parseRpcQuantity` | Minimal unsigned hex digits, including `0x0`, with no leading zeros. Parsing returns `bigint`; uppercase digits are accepted.                                                                                          |
| `toRpcQuantity`                     | Non-negative `bigint` to minimal lowercase hex. `0n` becomes `0x0`. No implicit uint256 bound.                                                                                                                         |
| `parseUnsignedInteger`              | Non-negative `bigint` or canonical unsigned decimal integer text. Rejects JavaScript numbers, signs, leading zeros, fractions, whitespace, hex, and exponents.                                                         |
| `isUint`, `parseUint`               | Decoded `bigint` in `[0, 2^bits)`. Solidity width is 8 through 256 in multiples of 8, default 256. Invalid width throws even for the predicate.                                                                        |
| `parseUnitsExact`                   | Canonical unsigned decimal string plus integer decimals 0–255. Rejects excess fractional digits, including trailing zeros beyond the precision. Returns unbounded `bigint`; apply a domain width check where required. |
| `formatUnitsExact`                  | Non-negative `bigint` plus decimals 0–255 to an exact decimal string. Removes fractional trailing zeros; does not round, localize, abbreviate, or use exponent notation.                                               |

Every parser rejects surrounding whitespace and malformed representations.
`0x0` is a quantity, `0x00` is byte data, and `0x` is empty data; do not
substitute one representation for another. No parser accepts a JavaScript
number as an amount or RPC quantity. Decimals and bit widths are small integer
configuration parameters, not financial values.

`Address`, `Hash32`, `HexData`, and `RpcQuantity` are distinct branded
template-literal types. Predicates establish valid shape; parsers additionally
normalize where documented. Brands do not establish network, asset, ownership,
deployment, checksum acceptance, or protocol support. Existing MDK public
template-literal aliases remain compatible; consumers may adopt stronger
types without forcing an unrelated interface migration.

## Errors and domain policy

Representation parsers throw `EvmValueError` with stable `code` and `field`.
Codes are `InvalidAddress`, `InvalidChecksum`, `InvalidHash`, `InvalidHexData`,
`InvalidRpcQuantity`, `InvalidInteger`, `InvalidBitWidth`, `InvalidDecimals`,
`InvalidAmount`, and `ExcessPrecision`. Errors omit raw input. Keep `field`
labels under application control rather than putting user data in them.

At an established package boundary, use a predicate to preserve its domain
error or catch only `EvmValueError` and translate it. Never hide unexpected
errors. Core's stage/source classification and protocol-specific failure codes
remain owned by those packages.

The migration also rejects trailing newlines that earlier end-anchored regexes
could accept. These malformed inputs keep the caller's existing error type
and classification.

Zero-address restrictions, positive chain IDs, allowed deployments, asset
decimals, storage-slot layouts, ABI rules, protocol arithmetic/rounding,
currency labels, and localized presentation remain with their current owners.
The foundation performs no RPC, wallet, filesystem, or transaction work.
Generators that must run before workspace builds retain bounded schema/input
validation; do not introduce build-dependent imports into those generators.

## Implementation and verification

The package uses exact-pinned Ox 1.7.4 through `ox/Address`, `ox/Hex`, and
`ox/Value`. MDK owns the strict input policy and error surface; Ox owns the
underlying checksum and conversion implementation. In particular, the exact
unit parser rejects excess precision before calling Ox's rounding-capable
parser. Ox types/errors, clients, signers, and unrelated exports are not
re-exported. See [ADR-0014](../../docs/decisions/0014-evm-value-foundation.md).

```sh
pnpm --filter @mezo-dev-kit/evm check
pnpm check
```

Tests cover ERC-55 vectors, malformed input, byte/quantity distinctions,
integer bounds, exact precision, conversion round trips, and distinct types.
The root built-entrypoint and clean-workspace gates also exercise the public
package through an example consumer. Passing these tests does not publish a
package or verify a live Mezo transaction.

Encoding references: [RPC value encoding](https://eips.ethereum.org/EIPS/eip-1474#value-encoding),
[ERC-55](https://eips.ethereum.org/EIPS/eip-55), and
[Ox](https://oxlib.sh/). These are EVM representation sources, not Mezo
deployment or provider-capability evidence.

`parseMinimalProxyImplementation` validates the standard 45-byte ERC-1167 runtime
and extracts its implementation address. It does not validate implementation
code or protocol ownership; see the [SDK reference](REFERENCE.md#standard-minimal-proxy-runtime).
