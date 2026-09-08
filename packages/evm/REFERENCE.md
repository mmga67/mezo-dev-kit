# EVM SDK reference

Import from `@mezo-dev-kit/evm`. This private workspace package performs pure
validation and conversion. See [setup and package selection](../../docs/reference/sdk.md)
and the [representation contract](README.md#representation-contract).

## Functions

The scalar ABI additions are:

| Function                                  | Input → result                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `encodeFunctionData(entry, args?)`        | Explicit function ABI and `readonly AbiScalar[]` → `HexData`.                                       |
| `decodeFunctionResult(entry, data)`       | Explicit function ABI and raw result → `readonly AbiScalar[]`, including zero/one-output functions. |
| `decodeEventLog(entry, { data, topics })` | Explicit event ABI and raw log → ordered `readonly AbiScalar[]`, or null for a different signature. |

`AbiScalar` is bigint, boolean or an address. Supported types are address,
bool, intN and uintN (8–256, multiples of eight). Small decoded integers become
bigint. Tuples, arrays, strings, bytes, anonymous events, wrong argument counts,
malformed matching logs and noncanonical outputs throw
`EvmValueError("InvalidAbi", field)`. ABI ownership remains with Contracts;
no Ox type crosses the public interface.

`createAbiCodec()` returns readonly `AbiCodec` with `encodeFunction(entry,
args?)`, `decodeFunction(entry, data)`, and `decodeEvent(entry, { data, topics })`.
These methods use positional `AbiValue` tuples/arrays, bigint integers,
booleans and hex data. The extended codec supports address, bool, intN/uintN,
bytes/bytesN, and nested fixed/dynamic arrays and tuples. The scalar functions
above remain compatible. Strings, anonymous events and hashed indexed complex
values are deliberately rejected. A different event signature returns `null`;
malformed matching data throws `InvalidAbi`.

Runtime bounds are eight levels of nesting, 128 parameters/components, 4,096
array items and a 1 MiB payload, with a conservative aggregate work bound checked
before encoding allocation. Return values must have canonical ABI encoding,
including padding and trailing data. Field names do not become object keys:
tuples always use declared positional order. ABI identity still belongs to
Contracts; validation does not establish protocol semantics.

```ts
import { createAbiCodec } from "@mezo-dev-kit/evm";
import { getTokenInterface } from "@mezo-dev-kit/contracts";
const codec = createAbiCodec();
const approve = getTokenInterface().find((entry) => entry.name === "approve");
declare const verifiedSpender: `0x${string}`;
const calldata = codec.encodeFunction(approve, [verifiedSpender, 12n]);
console.log(calldata);
```

```ts
import { resolveContract } from "@mezo-dev-kit/contracts";
import { encodeFunctionData, decodeFunctionResult } from "@mezo-dev-kit/evm";

const token = resolveContract({
  contractId: "musd.token",
  networkId: "mezo-mainnet",
  blockNumber: 12_000_000n,
});
const abi = token.readAbi.find((entry) => entry.type === "function" && entry.name === "balanceOf");
if (!abi) throw new Error("missing canonical balanceOf ABI");
export const data = encodeFunctionData(abi, ["0x0000000000000000000000000000000000000001"]);
declare const resultFromRpc: unknown;
export const [balance] = decodeFunctionResult(abi, resultFromRpc);
```

Signatures below omit `readonly` annotations for readability. `field?` is an
optional application-controlled error label; it never belongs to user input.

| Function                                   | Input → result                   | Usage                                                                                    |
| ------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `isAddress(value)`                         | `unknown → value is Address`     | Check 20-byte address shape; no checksum check or normalization.                         |
| `parseAddress(value, field?)`              | `unknown → Address`              | Validate RPC address representation and lowercase it.                                    |
| `parseUserAddress(value, field?)`          | `unknown → Address`              | Validate user input, including ERC-55 when uppercase hex digits occur; return lowercase. |
| `formatChecksumAddress(value)`             | `Address → Address`              | Produce checksum display text from a shape-valid address.                                |
| `isHash32(value)`                          | `unknown → value is Hash32`      | Check exactly 32 bytes.                                                                  |
| `parseHash32(value, field?)`               | `unknown → Hash32`               | Validate and lowercase a hash.                                                           |
| `isHexData(value)`                         | `unknown → value is HexData`     | Check complete hex byte pairs, including empty `0x`.                                     |
| `parseHexData(value, field?)`              | `unknown → HexData`              | Validate and lowercase data, preserving leading zero bytes.                              |
| `isRpcQuantity(value)`                     | `unknown → value is RpcQuantity` | Check minimal unsigned RPC hex representation.                                           |
| `parseRpcQuantity(value, field?)`          | `unknown → bigint`               | Decode an RPC quantity.                                                                  |
| `toRpcQuantity(value, field?)`             | `bigint → RpcQuantity`           | Encode a nonnegative bigint as minimal lowercase hex.                                    |
| `parseUnsignedInteger(value, field?)`      | `unknown → bigint`               | Accept a nonnegative bigint or canonical decimal integer string.                         |
| `isUint(value, bits?)`                     | `unknown → value is bigint`      | Check a decoded bigint against an unsigned Solidity width.                               |
| `parseUint(value, bits?, field?)`          | `unknown → bigint`               | Validate a decoded unsigned bigint; default width 256.                                   |
| `parseUnitsExact(value, decimals, field?)` | `unknown, number → bigint`       | Convert canonical unsigned decimal text to base units without rounding.                  |
| `formatUnitsExact(value, decimals)`        | `bigint, number → string`        | Format exact base units without localization or rounding.                                |

Widths are multiples of eight from 8 through 256. Invalid widths throw even
for `isUint`. Decimals are integer configuration values from 0 through 255.
Amounts are never JavaScript numbers. Parsers reject whitespace, signs,
exponents, and malformed representations. Unit parsing rejects excess
fractional digits even when those digits are zero. Unit and quantity
conversion do not impose a uint256 limit; apply `parseUint` where needed.

`0x0` is a quantity, `0x00` is byte data, and `0x` is empty byte data.
Address/hash/data parsers normalize hex digit case; predicates only narrow
shape. A valid representation establishes no chain identity or ownership.

## Examples

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

Use a domain-owned precision value for real asset amounts; six decimals above
is a synthetic conversion example.

```ts
import { EvmValueError, parseUnitsExact } from "@mezo-dev-kit/evm";

export function parseAmount(input: unknown): bigint | { error: string } {
  try {
    return parseUnitsExact(input, 6, "amount");
  } catch (error) {
    if (error instanceof EvmValueError) return { error: error.code };
    throw error;
  }
}
```

## Errors and types

`EvmValueError(code, field)` extends `Error` and exposes `code` and `field`.
Codes: `InvalidAddress`, `InvalidChecksum`, `InvalidHash`, `InvalidHexData`,
`InvalidRpcQuantity`, `InvalidInteger`, `InvalidBitWidth`, `InvalidDecimals`,
`InvalidAmount`, `ExcessPrecision`. Raw inputs are omitted.

Public types: `Address`, `Hash32`, `HexData`, `RpcQuantity`,
`EvmValueErrorCode`. The first four are distinct branded string types.

The [public export list](src/index.ts) and built declarations (`dist/index.d.ts`)
define the exact callable surface. The package also exports the bounded scalar ABI codec below. No wallet, RPC
client or writer is exported. See the [foundation example](../../examples/foundational-readonly/README.md)
for composition with the other foundational packages.

## Standard minimal proxy runtime

`parseMinimalProxyImplementation(value: unknown): Address` accepts only the
45-byte [standard ERC-1167 runtime](https://eips.ethereum.org/EIPS/eip-1167#specification)
and returns the embedded implementation address in lowercase. It rejects
creation bytecode, appended bytes, vanity optimizations and other proxy formats
with `EvmValueError('InvalidProxyCode')`; malformed hex retains `InvalidHexData`.
This is representation validation. The caller must check nonzero/live code,
expected implementation identity, factory mappings and protocol ownership.
