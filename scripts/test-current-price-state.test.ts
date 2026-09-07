import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import {
  abiWords,
  assessFeed,
  assertSameSnapshot,
  signedWord,
  snapshotBlock,
  verifyCode,
} from "./lib/current-price-state.ts";
test("usable observations honor inclusive age, positive price, timestamp presence and no future data", () => {
  expect(assessFeed(1n, 100n, 3700n, 3600n).status).toBe("usable");
  expect(assessFeed(1n, 100n, 3701n, 3600n).status).toBe("stale");
  expect(assessFeed(1n, 3701n, 3700n, 3600n).status).toBe("future");
  expect(assessFeed(1n, 0n, 3700n, 3600n).status).toBe("invalid");
  expect(assessFeed(0n, 100n, 3700n, 3600n).status).toBe("invalid");
  expect(() => assessFeed(1n, 100n, 3700n, -1n)).toThrow();
});
test("ABI words preserve signed values and reject noncanonical sign extension", () => {
  const negative = BigInt.asUintN(256, -8n);
  expect(signedWord(negative, 32)).toBe(-8n);
  expect(() => signedWord(0xfffffff8n, 32)).toThrow("Noncanonical");
  expect(abiWords(`0x${negative.toString(16)}`, 1)).toEqual([negative]);
  expect(() => abiWords("0x00", 1)).toThrow("Malformed");
});
test("only the accepted runtime bytes can pass a current-state check", () => {
  const hash = createHash("sha256").update(Buffer.from("1234", "hex")).digest("hex");
  expect(verifyCode("0x1234", hash)).toBe(hash);
  expect(() => verifyCode("0x1235", hash)).toThrow("Runtime differs");
  expect(() => verifyCode("0x", hash)).toThrow();
});
test("a changed block invalidates all staged current observations", () => {
  const block = snapshotBlock({ number: "0x10", hash: `0x${"ab".repeat(32)}`, timestamp: "0x100" });
  expect(() => {
    assertSameSnapshot(block, { ...block });
  }).not.toThrow();
  expect(() => {
    assertSameSnapshot(block, { ...block, hash: `0x${"cd".repeat(32)}` });
  }).toThrow("Snapshot changed");
  expect(() => {
    assertSameSnapshot(block, { ...block, timestamp: "257" });
  }).toThrow();
});
