import { expect, test } from "vitest";
import { createAbiCodec, EvmValueError, keccak256 } from "../src/index.ts";

const codec = createAbiCodec();
const account = "0x0000000000000000000000000000000000000001";
const word = (value: bigint) => value.toString(16).padStart(64, "0");
const signature = (value: string) =>
  keccak256(
    `0x${Array.from(new TextEncoder().encode(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
const call = {
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ type: "address" }, { type: "uint256" }],
  outputs: [{ type: "bool" }],
};
test("calldata decoding checks the selector and canonical independently specified arguments", () => {
  const data = `0x095ea7b3${word(1n)}${word(50n)}`;
  expect(codec.decodeCalldata(call, data)).toEqual([account, 50n]);
  for (const invalid of [
    "0x",
    "0x095ea7",
    "0x095ea7b3",
    `${data}00`,
    `0x00000000${data.slice(10)}`,
    `0x095ea7b3${word(1n << 160n)}${word(50n)}`,
  ])
    expect(() => codec.decodeCalldata(call, invalid)).toThrow(EvmValueError);
});
test("zero-argument calldata requires exactly its declared selector", () => {
  const entry = { ...call, name: "checkpoint", inputs: [] };
  const selector = signature("checkpoint()").slice(0, 10);
  expect(codec.decodeCalldata(entry, selector)).toEqual([]);
  expect(() => codec.decodeCalldata(entry, "0x00000000")).toThrow(EvmValueError);
  expect(() => codec.decodeCalldata(entry, `${selector}${word(0n)}`)).toThrow(EvmValueError);
});
test("decodes independently laid-out tuple-array calldata and rejects noncanonical offsets", () => {
  const entry = {
    ...call,
    name: "accept",
    inputs: [
      {
        type: "tuple[]",
        components: [{ type: "uint256" }, { type: "address" }, { type: "bytes" }],
      },
    ],
    outputs: [],
  };
  const selector = signature("accept((uint256,address,bytes)[])").slice(0, 10);
  const args = `${word(32n)}${word(1n)}${word(32n)}${word(7n)}${word(1n)}${word(96n)}${word(2n)}abcd${"0".repeat(60)}`;
  expect(codec.decodeCalldata(entry, `${selector}${args}`)).toEqual([[[7n, account, "0xabcd"]]]);
  expect(() =>
    codec.decodeCalldata(entry, `${selector}${word(64n)}${word(0n)}${args.slice(64)}`),
  ).toThrow(EvmValueError);
  expect(() => codec.decodeCalldata(entry, `${selector}${args.slice(0, -1)}1`)).toThrow(
    EvmValueError,
  );
  expect(() =>
    codec.decodeCalldata(entry, `${selector}${word(32n)}${word((1n << 256n) - 1n)}`),
  ).toThrow(EvmValueError);
});
test.for([
  { type: "bytes", signatureType: "bytes" },
  { type: "uint256[]", signatureType: "uint256[]" },
  { type: "tuple", components: [{ type: "address" }], signatureType: "(address)" },
])(
  "explicit hash decoding preserves the topic without claiming a $type preimage",
  ({ signatureType, ...parameter }) => {
    const entry = {
      type: "event",
      name: "Evidence",
      anonymous: false,
      inputs: [
        { type: "uint256", indexed: true },
        { ...parameter, indexed: true },
        { type: "bytes", indexed: false },
      ],
    };
    const hash = `0x${"ab".repeat(32)}`;
    const log = {
      topics: [signature(`Evidence(uint256,${signatureType},bytes)`), `0x${word(7n)}`, hash],
      data: `0x${word(32n)}${word(2n)}cdef${"0".repeat(60)}`,
    };
    const decoded = codec.decodeEventWithHashes(entry, log);
    expect(decoded).toEqual([7n, { kind: "indexed-hash", hash }, "0xcdef"]);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded?.[1])).toBe(true);
    expect(() => codec.decodeEvent(entry, log)).toThrow(
      expect.objectContaining({ code: "InvalidAbi", field: "hashed indexed value" }),
    );
    expect(
      codec.decodeEventWithHashes(entry, { ...log, topics: [signature("Other()")] }),
    ).toBeNull();
    for (const invalid of [
      { ...log, topics: log.topics.slice(0, 2) },
      { ...log, topics: [...log.topics, hash] },
      { ...log, topics: [log.topics[0], log.topics[1], "0x00"] },
      { ...log, data: `${log.data}00` },
    ])
      expect(() => codec.decodeEventWithHashes(entry, invalid)).toThrow(EvmValueError);
  },
);
test("hash-aware decoding retains scalar values and rejects unsupported event definitions", () => {
  const entry = {
    type: "event",
    name: "Value",
    anonymous: false,
    inputs: [{ type: "bytes32", indexed: true }],
  };
  const log = { topics: [signature("Value(bytes32)"), `0x${word(12n)}`], data: "0x" };
  expect(codec.decodeEventWithHashes(entry, log)).toEqual(codec.decodeEvent(entry, log));
  for (const invalid of [
    { ...entry, anonymous: true },
    { ...entry, inputs: [{ type: "string", indexed: true }] },
  ])
    expect(() => codec.decodeEventWithHashes(invalid, log)).toThrow(EvmValueError);
});
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
