import { describe, expect, expectTypeOf, test } from "vitest";

import {
  EvmValueError,
  formatChecksumAddress,
  formatUnitsExact,
  isAddress,
  isHash32,
  isHexData,
  isRpcQuantity,
  isUint,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUint,
  parseUnitsExact,
  parseUnsignedInteger,
  parseUserAddress,
  toRpcQuantity,
} from "../src/index.ts";
import type { Address, Hash32, HexData, RpcQuantity } from "../src/index.ts";

describe("address representation and user checksum policy", () => {
  // Published ERC-55 test vectors, not MDK deployment facts.
  test.for([
    "0x52908400098527886E0F7030069857D2E4169EE7",
    "0x8617E340B3D01FA5F11F306F4090FD50E238070D",
    "0xde709f2102306220921060314715629080e2fb77",
    "0x27b1fdb04752bbc536007a920d24acb045561c26",
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  ])("checksums and normalizes %s", (address) => {
    expect(formatChecksumAddress(parseAddress(address))).toBe(address);
    expect(parseUserAddress(address)).toBe(address.toLowerCase());
    expect(parseUserAddress(address.toLowerCase())).toBe(address.toLowerCase());
  });

  test("RPC shape acceptance does not discard checksum failure at a user boundary", () => {
    const invalidChecksum = "0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
    expect(isAddress(invalidChecksum)).toBe(true);
    expect(parseAddress(invalidChecksum)).toBe(invalidChecksum.toLowerCase());
    expect(() => parseUserAddress(invalidChecksum, "recipient")).toThrowError(
      expect.objectContaining({ code: "InvalidChecksum", field: "recipient" }),
    );
  });

  test("zero address is valid representation; recipient policy belongs to consumers", () => {
    expect(parseAddress(`0x${"0".repeat(40)}`)).toBe(`0x${"0".repeat(40)}`);
  });

  test.for([
    { label: "missing", value: undefined },
    { label: "object", value: {} },
    { label: "19 bytes", value: `0x${"aa".repeat(19)}` },
    { label: "21 bytes", value: `0x${"aa".repeat(21)}` },
    { label: "nonhex", value: `0x${"gg".repeat(20)}` },
    { label: "uppercase prefix", value: `0X${"aa".repeat(20)}` },
    { label: "trailing whitespace", value: `0x${"aa".repeat(20)}\n` },
  ])("rejects $label", ({ value }) => {
    expect(isAddress(value)).toBe(false);
    expect(() => parseAddress(value)).toThrow(EvmValueError);
  });
});

describe("byte data, hashes and RPC quantities", () => {
  test.for([
    { value: "0x", bytes: true, quantity: false },
    { value: "0x0", bytes: false, quantity: true },
    { value: "0x00", bytes: true, quantity: false },
    { value: "0x01", bytes: true, quantity: false },
    { value: "0x10", bytes: true, quantity: true },
    { value: "0xABC", bytes: false, quantity: true },
    { value: "0xGG", bytes: false, quantity: false },
    { value: "0X10", bytes: false, quantity: false },
    { value: "0x10\n", bytes: false, quantity: false },
    { value: 16, bytes: false, quantity: false },
    { value: null, bytes: false, quantity: false },
  ])("distinguishes representations for $value", ({ value, bytes, quantity }) => {
    expect(isHexData(value)).toBe(bytes);
    expect(isRpcQuantity(value)).toBe(quantity);
    if (!bytes) expect(() => parseHexData(value)).toThrow(EvmValueError);
    if (!quantity) expect(() => parseRpcQuantity(value)).toThrow(EvmValueError);
  });

  test("normalizes byte case without removing leading zero bytes", () => {
    expect(parseHexData("0x00AB00")).toBe("0x00ab00");
    expect(parseHexData("0x")).toBe("0x");
    expect(parseRpcQuantity("0xABC")).toBe(2748n);
  });

  test.for([31, 33])("rejects a %i-byte value as a hash", (length) => {
    const value = `0x${"aa".repeat(length)}`;
    expect(isHexData(value)).toBe(true);
    expect(isHash32(value)).toBe(false);
    expect(() => parseHash32(value, "block.hash")).toThrowError(
      expect.objectContaining({ code: "InvalidHash", field: "block.hash" }),
    );
  });

  test("validates and normalizes a full hash without claiming it exists on chain", () => {
    expect(parseHash32(`0x${"Aa".repeat(32)}`)).toBe(`0x${"aa".repeat(32)}`);
  });

  test.for([0n, 1n, 15n, 16n, 2n ** 256n - 1n, 2n ** 300n])(
    "round-trips the exact quantity %s",
    (value) => {
      expect(parseRpcQuantity(toRpcQuantity(value))).toBe(value);
    },
  );

  test("serializes zero canonically and rejects negative or numeric input", () => {
    expect(toRpcQuantity(0n)).toBe("0x0");
    expect(() => toRpcQuantity(-1n)).toThrow(EvmValueError);
    expect(() => {
      Reflect.apply(toRpcQuantity, undefined, [1]);
    }).toThrow(EvmValueError);
  });
});

describe("unsigned integers and exact units", () => {
  test.for([0n, "0", 1n, "1", "9007199254740993"])("parses %s without number coercion", (value) => {
    expect(parseUnsignedInteger(value)).toBe(BigInt(value));
  });
  test.for([-1n, "-1", 0, "01", "0x1", "1e3", "1.0", "1\n", null])(
    "rejects noncanonical integer %s",
    (value) => {
      expect(() => parseUnsignedInteger(value)).toThrow(EvmValueError);
    },
  );
  test.for([8, 64, 256])("enforces uint%i bounds", (bits) => {
    const maximum = (1n << BigInt(bits)) - 1n;
    expect(parseUint(0n, bits)).toBe(0n);
    expect(parseUint(maximum, bits)).toBe(maximum);
    expect(isUint(maximum + 1n, bits)).toBe(false);
    expect(() => parseUint(-1n, bits)).toThrow(EvmValueError);
    expect(() => parseUint(maximum + 1n, bits)).toThrow(EvmValueError);
    expect(() => parseUint("1", bits)).toThrow(EvmValueError);
  });
  test.for([0, 7, 257, 256.5, NaN])("rejects invalid Solidity width %s", (bits) => {
    expect(() => isUint(0n, bits)).toThrowError(
      expect.objectContaining({ code: "InvalidBitWidth" }),
    );
  });
  test.for([
    { text: "0", decimals: 0, amount: 0n, formatted: "0" },
    { text: "1.2300", decimals: 4, amount: 12300n, formatted: "1.23" },
    { text: "0.000000000000000001", decimals: 18, amount: 1n, formatted: "0.000000000000000001" },
    {
      text: "9007199254740993.01",
      decimals: 2,
      amount: 900719925474099301n,
      formatted: "9007199254740993.01",
    },
  ])("converts $text exactly with $decimals decimals", ({ text, decimals, amount, formatted }) => {
    expect(parseUnitsExact(text, decimals)).toBe(amount);
    expect(formatUnitsExact(amount, decimals)).toBe(formatted);
  });
  test.for(["1.001", "1.009", "1.000"])("rejects excess precision %s without rounding", (value) => {
    expect(() => parseUnitsExact(value, 2, "deposit")).toThrowError(
      expect.objectContaining({ code: "ExcessPrecision", field: "deposit" }),
    );
  });
  test.for(["", ".1", "1.", "01", "-1", "+1", "1e3", "1,000", "1\n", 1, null])(
    "rejects ambiguous amount %s",
    (value) => {
      expect(() => parseUnitsExact(value, 18)).toThrow(EvmValueError);
    },
  );
  test.for([-1, 256, 1.5, Infinity])("rejects invalid decimals %s", (decimals) => {
    expect(() => parseUnitsExact("1", decimals)).toThrowError(
      expect.objectContaining({ code: "InvalidDecimals" }),
    );
    expect(() => formatUnitsExact(1n, decimals)).toThrow(EvmValueError);
  });
  test.for([0, 6, 18, 255])("round-trips arbitrary-width base units at %i decimals", (decimals) => {
    const amount = 2n ** 256n + 123n;
    expect(parseUnitsExact(formatUnitsExact(amount, decimals), decimals)).toBe(amount);
    expect(parseUnitsExact(formatUnitsExact(0n, decimals), decimals)).toBe(0n);
  });
  test("rejects negative formatting and does not disclose the invalid value in errors", () => {
    expect(() => formatUnitsExact(-1n, 18)).toThrow(EvmValueError);
    const error = new EvmValueError("InvalidAmount", "deposit");
    expect(error).toMatchObject({ code: "InvalidAmount", field: "deposit" });
    expect(error.message).toBe("deposit: InvalidAmount");
  });
});

test("validated representations preserve distinct public types", () => {
  expectTypeOf(parseAddress("0x1111111111111111111111111111111111111111")).toEqualTypeOf<Address>();
  expectTypeOf<Address>().not.toExtend<Hash32>();
  expectTypeOf<HexData>().not.toExtend<RpcQuantity>();
  expectTypeOf<Address>().toExtend<`0x${string}`>();
});
