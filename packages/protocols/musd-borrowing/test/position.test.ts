import { expect, test } from "vitest";
import { normalizeBorrowingPosition } from "../src/index.ts";

test("pending collateral, principal and interest are counted once", () => {
  const result = normalizeBorrowingPosition({
    stored: [100n, 1000n, 10n, 20n, 1n, 500n, 0n, 2000n, 1n],
    entire: [105n, 1020n, 63n, 5n, 20n, 3n],
    timestamp: 31556952n,
    gasCompensation: 200n,
  });
  expect(result.collateral).toBe(105n);
  expect(result.principal).toBe(1020n);
  expect(result.interest).toBe(63n);
  expect(result.accruedInterest).toBe(50n);
  expect(result.debt).toBe(1083n);
  expect(result.netDebt).toBe(883n);
});
test("tuple, status, time and double-counted entire values are rejected", () => {
  const input = {
    stored: [100n, 1000n, 10n, 20n, 1n, 500n, 0n, 2000n, 1n],
    entire: [105n, 1020n, 63n, 5n, 20n, 3n],
    timestamp: 31556952n,
    gasCompensation: 200n,
  };
  expect(() =>
    normalizeBorrowingPosition({ ...input, entire: [110n, 1040n, 66n, 5n, 20n, 3n] }),
  ).toThrow();
  expect(() => normalizeBorrowingPosition({ ...input, stored: [] })).toThrow();
  expect(() => normalizeBorrowingPosition({ ...input, timestamp: -1n })).toThrow();
  expect(() =>
    normalizeBorrowingPosition({
      ...input,
      stored: input.stored.map((v, i) => (i === 4 ? 5n : v)),
    }),
  ).toThrow();
});
