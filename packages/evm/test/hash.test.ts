import { describe, expect, it } from "vitest";
import { keccak256 } from "../src/index.ts";
describe("Ethereum Keccak-256", () => {
  it("matches empty and abc byte vectors", () => {
    expect(keccak256("0x")).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
    expect(keccak256("0x616263")).toBe(
      "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
    );
  });
  it("rejects text and partial bytes", () => {
    expect(() => keccak256("abc")).toThrow();
    expect(() => keccak256("0x1")).toThrow();
  });
});
