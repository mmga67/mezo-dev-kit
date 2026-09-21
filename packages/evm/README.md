# EVM values and ABI encoding

`@mezo-dev-kit/evm` validates addresses, hashes, byte data, and RPC quantities;
converts decimal amounts exactly; and encodes or decodes explicit ABI entries.
Use it at user and RPC boundaries before passing values to a protocol package.

## Start here

```ts
import { parseUserAddress, parseUnitsExact, formatUnitsExact } from "@mezo-dev-kit/evm";

const account = parseUserAddress("0x1111111111111111111111111111111111111111");
const amount = parseUnitsExact("1.25", 6); // 1250000n; synthetic precision
const display = formatUnitsExact(amount, 6); // "1.25"
```

The [values and encoding example](../../examples/evm/README.md) shows setup and
failure handling. The [API reference](REFERENCE.md) covers every function,
including tuple/array codecs, calldata validation, indexed-event hashes,
minimal-proxy parsing, and byte hashing.

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

## Errors and scope

Parsers throw `EvmValueError` with stable `code` and `field`, omitting raw
input. Use an application-controlled field label and handle expected failures
without hiding unexpected errors. See [errors and types](REFERENCE.md#errors-and-types).

The package performs no I/O. Protocols still validate asset precision, positive
amounts, zero-address restrictions, deployments, and financial bounds. ABI
encoding alone proves neither contract identity nor transaction success.
This is a private workspace package; MDK keeps its Ox implementation behind
its own types and errors.

## Development

From the repository root:

```sh
pnpm --filter @mezo-dev-kit/evm check
```

See the [contributor guide](../../CONTRIBUTING.md) for workspace setup and review.
