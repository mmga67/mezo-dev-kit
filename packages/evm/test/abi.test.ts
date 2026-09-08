import { describe, expect, test } from "vitest";
import { decodeEventLog, decodeFunctionResult, encodeFunctionData } from "../src/index.ts";

const balanceOf = {
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ type: "address" }],
  outputs: [{ type: "uint256" }],
};
const account = "0x0000000000000000000000000000000000000001";
const word = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`;
describe("scalar ABI boundary", () => {
  test("encodes known ERC20 selector and decodes a scalar", () => {
    expect(encodeFunctionData(balanceOf, [account])).toBe(
      `0x70a08231${account.slice(2).padStart(64, "0")}`,
    );
    expect(decodeFunctionResult(balanceOf, word(42n))).toEqual([42n]);
  });
  test("normalizes narrow integers and multiple outputs", () => {
    expect(
      decodeFunctionResult(
        { ...balanceOf, outputs: [{ type: "uint8" }, { type: "uint16" }] },
        `${word(4n)}${word(500n).slice(2)}`,
      ),
    ).toEqual([4n, 500n]);
  });
  test("decodes signed oracle answers without unsigned wrapping", () => {
    expect(
      decodeFunctionResult(
        { ...balanceOf, outputs: [{ type: "int256" }] },
        word((1n << 256n) - 1n),
      ),
    ).toEqual([-1n]);
    expect(
      decodeFunctionResult({ ...balanceOf, outputs: [{ type: "uint80" }] }, word(100000n)),
    ).toEqual([100000n]);
  });
  test("rejects malformed lengths, unsupported ABI types and noncanonical words", () => {
    expect(() => decodeFunctionResult(balanceOf, "0x")).toThrow();
    expect(() =>
      encodeFunctionData({ ...balanceOf, inputs: [{ type: "uint256[]" }] }, []),
    ).toThrow();
    expect(() =>
      decodeFunctionResult({ ...balanceOf, outputs: [{ type: "uint8" }] }, word(256n)),
    ).toThrow();
    expect(() =>
      decodeFunctionResult({ ...balanceOf, outputs: [{ type: "bool" }] }, word(2n)),
    ).toThrow();
    expect(() =>
      decodeFunctionResult({ ...balanceOf, outputs: [{ type: "address" }] }, word(1n << 160n)),
    ).toThrow();
    expect(() => encodeFunctionData(balanceOf, [])).toThrow();
  });
  test("decodes known Transfer log with indexed fields", () => {
    const event = {
      type: "event",
      name: "Transfer",
      anonymous: false,
      inputs: [
        { type: "address", indexed: true },
        { type: "address", indexed: true },
        { type: "uint256", indexed: false },
      ],
    };
    const topics = [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      word(0n),
      word(1n),
    ];
    expect(decodeEventLog(event, { topics, data: word(42n) })).toEqual([
      "0x0000000000000000000000000000000000000000",
      account,
      42n,
    ]);
    expect(decodeEventLog(event, { topics: [word(1n)], data: word(42n) })).toBeNull();
    expect(() => decodeEventLog(event, { topics: topics.slice(0, 2), data: word(42n) })).toThrow();
  });
});
