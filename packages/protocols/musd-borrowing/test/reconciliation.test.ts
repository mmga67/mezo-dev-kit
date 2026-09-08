import { expect, test } from "vitest";
import { normalizeBorrowingPosition } from "../src/index.ts";
import { verifyBorrowingUpdate } from "../src/reconciliation.ts";
const position = normalizeBorrowingPosition({
  stored: [100n, 1000n, 10n, 20n, 1n, 500n, 1n, 2000n, 1n],
  entire: [100n, 1000n, 10n, 0n, 0n, 0n],
  timestamp: 1n,
  gasCompensation: 200n,
});
test("close emits zero rate/time while the closed record retains historical metadata", () => {
  const closed = normalizeBorrowingPosition({
    stored: [0n, 0n, 0n, 0n, 2n, 500n, 10n, 2000n, 1n],
    entire: [0n, 0n, 0n, 0n, 0n, 0n],
    timestamp: 10n,
    gasCompensation: 200n,
  });
  expect(() => {
    verifyBorrowingUpdate({ kind: "close" }, closed, [0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n]);
  }).not.toThrow();
  expect(closed.annualRateBps).toBe(500n);
  expect(closed.maxBorrowingCapacity).toBe(2000n);
});
test("debt-increase event omits interest; post-state retains it", () => {
  const event = ["0x0000000000000000000000000000000000000001", 1000n, 0n, 100n, 20n, 500n, 1n, 2n];
  expect(() => {
    verifyBorrowingUpdate({ kind: "borrow", amount: 1n }, position, event);
  }).not.toThrow();
  expect(() => {
    verifyBorrowingUpdate(
      {
        kind: "adjust",
        depositCollateral: 1n,
        withdrawCollateral: 0n,
        debtChange: 1n,
        increaseDebt: true,
      },
      position,
      event,
    );
  }).not.toThrow();
  expect(() => {
    verifyBorrowingUpdate({ kind: "repay", amount: 1n }, position, event);
  }).toThrow();
  expect(position.debt).toBe(1010n);
});
test("wrong operation and principal still reject reconciliation", () => {
  expect(() => {
    verifyBorrowingUpdate({ kind: "borrow", amount: 1n }, position, [
      0n,
      1000n,
      0n,
      100n,
      20n,
      500n,
      1n,
      0n,
    ]);
  }).toThrow();
  expect(() => {
    verifyBorrowingUpdate({ kind: "borrow", amount: 1n }, position, [
      0n,
      999n,
      0n,
      100n,
      20n,
      500n,
      1n,
      2n,
    ]);
  }).toThrow();
});
