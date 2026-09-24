import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { keccak256, sha256 } from "../src/index.ts";
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

describe("portable SHA-256", () => {
  it("matches the standard empty and abc vectors", () => {
    expect(sha256("0x")).toBe("0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("0x616263")).toBe(
      "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it.each(["00aB00", "ff", "12".repeat(256)])("preserves Node bytecode digests for %s", (hex) => {
    const bytes = Buffer.from(hex, "hex");
    const expected = `0x${createHash("sha256").update(bytes).digest("hex")}`;
    expect(sha256(`0x${hex}`)).toBe(expected);
    expect(sha256(new Uint8Array(bytes))).toBe(expected);
  });

  it.each(["", "Mezo — İstanbul 😀", JSON.stringify(["identity", "42", [null]])])(
    "preserves explicitly encoded UTF-8 digests for %s",
    (text) => {
      expect(sha256(new TextEncoder().encode(text))).toBe(
        `0x${createHash("sha256").update(text).digest("hex")}`,
      );
    },
  );

  it.for(["abc", "0x1", "0xgg", null, [1, 2], new Uint16Array([1])])(
    "rejects non-byte input %s",
    (value) => {
      expect(() => sha256(value)).toThrow(expect.objectContaining({ code: "InvalidHexData" }));
    },
  );
});
