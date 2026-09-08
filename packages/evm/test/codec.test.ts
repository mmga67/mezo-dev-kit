import { expect, test } from "vitest";
import { createAbiCodec, EvmValueError } from "../src/index.ts";

const codec = createAbiCodec();
const account = "0x0000000000000000000000000000000000000001";
const word = (value: bigint) => value.toString(16).padStart(64, "0");
test("aggregate byte expansion is bounded before ABI encoding", () => {
  const entry = {
    type: "function",
    name: "callbacks",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes[]" }],
    outputs: [],
  };
  const shared = `0x${"ab".repeat(300_000)}` as const;
  expect(() => codec.encodeFunction(entry, [[shared, shared, shared, shared]])).toThrow(
    expect.objectContaining({ code: "InvalidAbi", field: "aggregate byte limit" }),
  );
});
test("decodes positional tuples and dynamic bytes from independently laid-out ABI words", () => {
  const entry = {
    type: "function",
    name: "position",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "address", name: "owner" },
          { type: "uint128", name: "shares" },
        ],
      },
      { type: "bytes" },
    ],
  };
  const data = `0x${word(1n)}${word(17n)}${word(96n)}${word(2n)}abcd${"0".repeat(60)}`;
  expect(codec.decodeFunction(entry, data)).toEqual([[account, 17n], "0xabcd"]);
  expect(() => codec.decodeFunction(entry, `${data}00`)).toThrow(EvmValueError);
  expect(() => codec.decodeFunction(entry, `${data.slice(0, -1)}1`)).toThrow(EvmValueError);
});
test("preserves selector and exact approval arguments", () => {
  const entry = {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  };
  expect(codec.encodeFunction(entry, [account, 50n])).toBe(`0x095ea7b3${word(1n)}${word(50n)}`);
  expect(codec.decodeFunction(entry, `0x${word(1n)}`)).toEqual([true]);
  expect(() => codec.decodeFunction(entry, `0x${word(2n)}`)).toThrow(EvmValueError);
});
test("arrays, nested tuples and fixed bytes retain their positional representation", () => {
  const params = [{ type: "tuple[]", components: [{ type: "bytes4" }, { type: "uint256[]" }] }];
  const input = {
    type: "function",
    name: "batch",
    stateMutability: "nonpayable",
    inputs: params,
    outputs: [],
  };
  const encoded = codec.encodeFunction(input, [
    [
      ["0x12345678", [2n, 3n]],
      ["0x00000000", []],
    ],
  ]);
  expect(
    codec.decodeFunction({ ...input, inputs: [], outputs: params }, `0x${encoded.slice(10)}`),
  ).toEqual([
    [
      ["0x12345678", [2n, 3n]],
      ["0x00000000", []],
    ],
  ]);
  expect(() => codec.encodeFunction(input, [[["0x12", []]]])).toThrow(EvmValueError);
});
test("rejects hostile lengths, excessive nesting and unsupported indexed complex values", () => {
  const entry = {
    type: "function",
    name: "array",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256[]" }],
  };
  expect(() => codec.decodeFunction(entry, `0x${word(32n)}${word((1n << 256n) - 1n)}`)).toThrow(
    EvmValueError,
  );
  expect(() =>
    codec.encodeFunction({ ...entry, inputs: [{ type: "uint256[4097]" }], outputs: [] }, [[]]),
  ).toThrow(EvmValueError);
  expect(() =>
    codec.encodeFunction(
      { ...entry, inputs: [{ type: `uint256${"[]".repeat(10)}` }], outputs: [] },
      [[]],
    ),
  ).toThrow(EvmValueError);
  expect(() =>
    codec.decodeEvent(
      { type: "event", name: "Data", anonymous: false, inputs: [{ type: "bytes", indexed: true }] },
      { topics: [], data: "0x" },
    ),
  ).toThrow(EvmValueError);
});
