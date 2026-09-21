# EVM SDK reference

Use `@mezo-dev-kit/evm` to validate addresses and hexadecimal values, convert token amounts exactly,
and encode or decode EVM calls. These are local, deterministic operations: they need no wallet or
network connection.

Start with `parseUserAddress` for an address entered by a person and `parseUnitsExact` for a decimal
amount. A **base unit** is the smallest unit of an asset: with six decimal places, `"1.25"` becomes
`1_250_000n`. Keep these amounts as bigint; format them as strings for display.

See the [representation contract](README.md#representation-contract) for input policy and
[workspace setup](../../docs/reference/sdk.md) for imports.

On this page:

- [Functions](#functions)
- [Examples](#examples)
- [Errors and types](#errors-and-types)
- [ABI encoding and decoding](#abi-encoding-and-decoding)
- [Standard minimal proxy runtime](#standard-minimal-proxy-runtime)
- [Byte hashing](#byte-hashing)
- [Encoding sources](#encoding-sources)

## Functions

Signatures below omit `readonly` annotations for readability. `field?` is an optional
application-controlled error label; it never belongs to user input.

### Addresses

#### `isAddress`

Check 20-byte address shape; no checksum check or normalization.

**Call:** `isAddress(value)`

**Input → result:** `unknown → value is Address`

#### `parseAddress`

Validate RPC address representation and lowercase it.

**Call:** `parseAddress(value, field?)`

**Input → result:** `unknown → Address`

#### `parseUserAddress`

Validate user input, including ERC-55 when uppercase hex digits occur; return lowercase.

**Call:** `parseUserAddress(value, field?)`

**Input → result:** `unknown → Address`

#### `formatChecksumAddress`

Produce checksum display text from a shape-valid address.

**Call:** `formatChecksumAddress(value)`

**Input → result:** `Address → Address`

### Hashes and byte data

#### `isHash32`

Check exactly 32 bytes.

**Call:** `isHash32(value)`

**Input → result:** `unknown → value is Hash32`

#### `parseHash32`

Validate and lowercase a hash.

**Call:** `parseHash32(value, field?)`

**Input → result:** `unknown → Hash32`

#### `isHexData`

Check complete hex byte pairs, including empty `0x`.

**Call:** `isHexData(value)`

**Input → result:** `unknown → value is HexData`

#### `parseHexData`

Validate and lowercase data, preserving leading zero bytes.

**Call:** `parseHexData(value, field?)`

**Input → result:** `unknown → HexData`

### RPC quantities and integer bounds

#### `isRpcQuantity`

Check minimal unsigned RPC hex representation.

**Call:** `isRpcQuantity(value)`

**Input → result:** `unknown → value is RpcQuantity`

#### `parseRpcQuantity`

Decode an RPC quantity.

**Call:** `parseRpcQuantity(value, field?)`

**Input → result:** `unknown → bigint`

#### `toRpcQuantity`

Encode a nonnegative bigint as minimal lowercase hex.

**Call:** `toRpcQuantity(value, field?)`

**Input → result:** `bigint → RpcQuantity`

#### `parseUnsignedInteger`

Accept a nonnegative bigint or canonical decimal integer string.

**Call:** `parseUnsignedInteger(value, field?)`

**Input → result:** `unknown → bigint`

#### `isUint`

Check a decoded bigint against an unsigned Solidity width.

**Call:** `isUint(value, bits?)`

**Input → result:** `unknown → value is bigint`

#### `parseUint`

Validate a decoded unsigned bigint; default width 256.

**Call:** `parseUint(value, bits?, field?)`

**Input → result:** `unknown → bigint`

### Token amount conversion

#### `parseUnitsExact`

Convert canonical unsigned decimal text to base units without rounding.

**Call:** `parseUnitsExact(value, decimals, field?)`

**Input → result:** `unknown, number → bigint`

#### `formatUnitsExact`

Format exact base units without localization or rounding.

**Call:** `formatUnitsExact(value, decimals)`

**Input → result:** `bigint, number → string`

Widths are multiples of eight from 8 through 256. Invalid widths throw even for `isUint`. Decimals
are integer configuration values from 0 through 255. Amounts are never JavaScript numbers. Parsers
reject whitespace, signs, exponents, and malformed representations. Unit parsing rejects excess
fractional digits even when those digits are zero. Unit and quantity conversion do not impose a
uint256 limit; apply `parseUint` where needed.

`0x0` is a quantity, `0x00` is byte data, and `0x` is empty byte data. Address/hash/data parsers
normalize hex digit case; predicates only narrow shape. A valid representation establishes no chain
identity or ownership.

## Examples

Convert a synthetic six-decimal amount, validate an address, and translate RPC quantities. This
example runs without RPC:

```ts
import {
  formatChecksumAddress,
  formatUnitsExact,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  parseUnitsExact,
  parseUserAddress,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";

const account = parseUserAddress("0x1111111111111111111111111111111111111111");

const displayAddress = formatChecksumAddress(account);

const amount = parseUint(parseUnitsExact("1.25", 6)); // 1250000n

const displayAmount = formatUnitsExact(amount, 6); // "1.25"

const blockNumber = parseRpcQuantity("0x10"); // 16n

const blockParameter = toRpcQuantity(blockNumber); // "0x10"

const data = parseHexData("0x00AB"); // "0x00ab"

const hash = parseHash32(`0x${"ab".repeat(32)}`);

export { account, displayAddress, amount, displayAmount, blockParameter, data, hash };
```

The comments show exact results: `1.25` becomes `1250000n`, while the RPC block quantity `0x10`
becomes `16n`. These representations have different purposes; hexadecimal byte data retains leading
zero bytes.

Use a domain-owned precision value for real asset amounts; six decimals above is a synthetic
conversion example.

Handle an amount-validation failure at an application boundary:

```ts
import { EvmValueError, parseUnitsExact } from "@mezo-dev-kit/evm";

export function parseAmount(input: unknown): bigint | { error: string } {
  try {
    return parseUnitsExact(input, 6, "amount");
  } catch (error) {
    if (error instanceof EvmValueError) {
      return { error: error.code };
    }

    throw error;
  }
}
```

The helper returns a stable error code for an invalid amount and preserves unexpected exceptions.
The six-decimal precision is illustrative; obtain real asset precision from its owner.

## Errors and types

`EvmValueError(code, field)` extends `Error` and exposes `code` and `field`. Codes:
`InvalidAddress`, `InvalidChecksum`, `InvalidHash`, `InvalidHexData`, `InvalidRpcQuantity`,
`InvalidInteger`, `InvalidBitWidth`, `InvalidDecimals`, `InvalidAmount`, `ExcessPrecision`. Raw
inputs are omitted.

At an established package boundary, use a predicate to preserve the domain's error or catch only
`EvmValueError` and translate it. Unexpected errors remain visible; Core's stage/source
classification and protocol failure codes keep their own owners. Field labels must stay under
application control.

Public types: `Address`, `Hash32`, `HexData`, `RpcQuantity`, `EvmValueErrorCode`. The first four are
distinct branded string types.

The [public export list](src/index.ts) and built declarations (`dist/index.d.ts`) define the exact
callable surface. The ABI codecs are described below. No wallet, RPC client or writer is exported.
See the [workflow examples](../../examples/README.md) for composition with the other foundational
packages.

## ABI encoding and decoding

Use the scalar helpers for addresses, booleans and integers. Use `createAbiCodec` when the ABI
includes arrays, tuples or bytes. Supply the exact ABI entry from its owning registry.

### `encodeFunctionData`

**Call:** `encodeFunctionData(entry, args?)`

**Input → result:** Explicit function ABI and `readonly AbiScalar[]` → `HexData`.

### `decodeFunctionResult`

**Call:** `decodeFunctionResult(entry, data)`

**Input → result:** Explicit function ABI and raw result → `readonly AbiScalar[]`, including
zero/one-output functions.

### `decodeEventLog`

**Call:** `decodeEventLog(entry, { data, topics })`

**Input → result:** Explicit event ABI and raw log → ordered `readonly AbiScalar[]`, or null for a
different signature.

`AbiScalar` is bigint, boolean or an address. Supported types are address, bool, intN and uintN
(8–256, multiples of eight). Small decoded integers become bigint. Tuples, arrays, strings, bytes,
anonymous events, wrong argument counts, malformed matching logs and noncanonical outputs throw
`EvmValueError("InvalidAbi", field)`. ABI ownership remains with Contracts; no Ox type crosses the
public interface.

### `createAbiCodec` — arrays, tuples and bytes

`createAbiCodec()` returns readonly `AbiCodec` with `encodeFunction(entry, args?)`,
`decodeCalldata(entry, data)`, `decodeFunction(entry, data)`,
`decodeEvent(entry, { data, topics })`, and `decodeEventWithHashes(entry, { data, topics })`. These
methods use positional `AbiValue` tuples/arrays, bigint integers, booleans and hex data. The
extended codec supports address, bool, intN/uintN, bytes/bytesN, and nested fixed/dynamic arrays and
tuples. The scalar functions above remain compatible. Strings and anonymous events are rejected.
`decodeEvent` also rejects indexed bytes, arrays and tuples. A different event signature returns
`null`; malformed matching data throws `InvalidAbi`.

### `codec.decodeCalldata` — inspect call arguments

`decodeCalldata` returns the declared input arguments, including an empty array for a zero-argument
call. It verifies the exact function selector, canonical offsets/padding, argument values and
absence of trailing data. `decodeFunction` continues to decode return data; the two methods are not
interchangeable.

### `codec.decodeEventWithHashes` — retain indexed hashes

`decodeEventWithHashes` returns positional `AbiEventValue` entries. Ordinary fields remain
`AbiValue`; indexed bytes, arrays and tuples become a frozen `AbiIndexedHash` object
`{ kind: "indexed-hash", hash: Hash32 }`. The hash does not reveal or authenticate a preimage. The
consuming protocol must establish the appropriate indexed-event encoding and compare its
independently obtained value under the
[Solidity indexed-event encoding](https://docs.solidity.org/en/latest/abi-spec.html#encoding-of-indexed-event-parameters).
A fixed `bytes32` field remains plain hex data. Event topics are bounded to four, including the
signature. Custom `AbiCodec` implementations must provide all five methods, including
`decodeCalldata` and `decodeEventWithHashes`.

Runtime bounds are eight levels of nesting, 128 parameters/components, 4,096 array items and a 1 MiB
payload, with a conservative aggregate work bound checked before encoding allocation. Return values
must have canonical ABI encoding, including padding and trailing data. Field names do not become
object keys: tuples always use declared positional order. ABI identity still belongs to Contracts;
validation does not establish protocol semantics.

Encode an approval and decode its arguments again. Supply a previously verified spender address;
this excerpt constructs bytes without submitting them:

```ts
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { getTokenInterface } from "@mezo-dev-kit/contracts";

const codec = createAbiCodec();

const approve = getTokenInterface().find((entry) => entry.name === "approve");

declare const verifiedSpender: `0x${string}`;

const calldata = codec.encodeFunction(approve, [verifiedSpender, 12n]);

const argumentsFromTransaction = codec.decodeCalldata(approve, calldata);

console.log(calldata, argumentsFromTransaction);
```

`argumentsFromTransaction` contains the spender and `12n` in ABI order. Encoding a call does not
check the spender’s protocol role or grant token permission.

Prepare a `balanceOf` call using the registry ABI, then decode a response supplied by your RPC
integration. The block and address below are illustrative:

```ts
import { resolveContract } from "@mezo-dev-kit/contracts";
import { encodeFunctionData, decodeFunctionResult } from "@mezo-dev-kit/evm";

const token = resolveContract({
  contractId: "musd.token",
  networkId: "mezo-mainnet",
  blockNumber: 12_000_000n,
});

const abi = token.readAbi.find((entry) => entry.type === "function" && entry.name === "balanceOf");

if (!abi) {
  throw new Error("missing canonical balanceOf ABI");
}

export const data = encodeFunctionData(abi, ["0x0000000000000000000000000000000000000001"]);

declare const resultFromRpc: unknown;

export const [balance] = decodeFunctionResult(abi, resultFromRpc);
```

`data` is calldata for the provider; `balance` is the decoded bigint result. The example does not
issue the RPC request, and a real read must use the selected deployment and coordinate.

## Standard minimal proxy runtime

`parseMinimalProxyImplementation(value: unknown): Address` accepts only the 45-byte
[standard ERC-1167 runtime](https://eips.ethereum.org/EIPS/eip-1167#specification) and returns the
embedded implementation address in lowercase. It rejects creation bytecode, appended bytes, vanity
optimizations and other proxy formats with `EvmValueError('InvalidProxyCode')`; malformed hex
retains `InvalidHexData`. This is representation validation. The caller must check nonzero/live
code, expected implementation identity, factory mappings and protocol ownership.

## Byte hashing

`keccak256(value: unknown): Hash32` hashes validated hexadecimal bytes with Ethereum Keccak-256.
Empty bytes are valid; text, odd-length hex and non-hex characters are rejected with
`InvalidHexData`. This does not encode text or ABI values, and is distinct from standardized
SHA3-256. Protocols own mapping keys and storage-layout identity; this helper owns only byte
hashing.

Hash an empty byte sequence locally:

```ts
import { keccak256 } from "@mezo-dev-kit/evm";

const emptyDigest = keccak256("0x");

console.log(emptyDigest);
```

`emptyDigest` is a 32-byte Keccak-256 hash. The input `0x` means zero bytes, rather than the two
text characters “0x”.

## Encoding sources

[RPC value encoding](https://eips.ethereum.org/EIPS/eip-1474#value-encoding),
[ERC-55](https://eips.ethereum.org/EIPS/eip-55), and [Ox](https://oxlib.sh/) describe the underlying
representations and implementation. These sources do not establish Mezo deployment identity or
provider capability.
