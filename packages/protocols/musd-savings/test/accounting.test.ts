import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { calculateSavingsDistribution, calculateSavingsYield } from "../src/index.ts";

describe("Savings integer accounting", () => {
  test("zero balance skips index subtraction exactly as the deployed update does", () => {
    const result = calculateSavingsYield({
      balance: 0n,
      yieldIndex: 0n,
      supplyYieldIndex: 1n,
      storedClaimableYield: 7n,
    });
    expect(result.indexedUnclaimed.baseUnits).toBe(0n);
    expect(result.claimable.baseUnits).toBe(7n);
  });
  test("matches the canonical user-update floor fixture", async () => {
    const document: unknown = JSON.parse(
      await readFile(
        new URL(
          "../../../../knowledge/protocols/musd/savings/fixtures/accounting.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    if (
      !document ||
      typeof document !== "object" ||
      !("records" in document) ||
      !Array.isArray(document.records)
    )
      throw new Error("invalid canonical fixtures");
    const fixture: unknown = document.records.find(
      (r: unknown) =>
        r !== null && typeof r === "object" && "id" in r && r.id === "user-update-floor",
    );
    if (
      !fixture ||
      typeof fixture !== "object" ||
      !("input" in fixture) ||
      !("expected" in fixture)
    )
      throw new Error("missing user fixture");
    const input = numeric(fixture.input);
    const expected = numeric(fixture.expected);
    const result = calculateSavingsYield({
      balance: required(input, "balance"),
      yieldIndex: required(input, "index"),
      supplyYieldIndex: required(input, "userIndex"),
      storedClaimableYield: required(input, "claimable"),
    });
    expect(result.indexedUnclaimed.baseUnits).toBe(required(expected, "share"));
    expect(result.claimable.baseUnits).toBe(required(expected, "claimable"));
  });
  test.for([
    {
      label: "zero supply buffers",
      amount: 7n,
      pendingYield: 5n,
      totalSupply: 0n,
      yieldIndex: 9n,
      expected: { pendingYield: 12n, yieldIndex: 9n },
    },
    {
      label: "nonzero supply distributes pending",
      amount: 100n,
      pendingYield: 20n,
      totalSupply: 1000n,
      yieldIndex: 7n,
      expected: { pendingYield: 0n, yieldIndex: 120000000000000007n },
    },
  ])("$label", ({ expected, ...input }) => {
    expect(calculateSavingsDistribution(input)).toEqual(expected);
  });
  test("ratio rounding to zero rejects at one unit over the scale boundary", () => {
    expect(
      calculateSavingsDistribution({
        amount: 1n,
        pendingYield: 0n,
        totalSupply: 1000000000000000000n,
        yieldIndex: 0n,
      }).yieldIndex,
    ).toBe(1n);
    expect(() =>
      calculateSavingsDistribution({
        amount: 1n,
        pendingYield: 0n,
        totalSupply: 1000000000000000001n,
        yieldIndex: 0n,
      }),
    ).toThrow(expect.objectContaining({ code: "AmountTooSmall" }));
  });
  test("user index above current index is invalid", () => {
    expect(() =>
      calculateSavingsYield({
        balance: 1n,
        yieldIndex: 0n,
        supplyYieldIndex: 1n,
        storedClaimableYield: 0n,
      }),
    ).toThrow(expect.objectContaining({ code: "InvalidIndex" }));
  });
  test("multiplication overflow is rejected before division even when the final quotient fits", () => {
    expect(() =>
      calculateSavingsYield({
        balance: (1n << 256n) - 1n,
        yieldIndex: 2n,
        supplyYieldIndex: 0n,
        storedClaimableYield: 0n,
      }),
    ).toThrow(expect.objectContaining({ code: "ArithmeticOverflow" }));
  });
  test("zero balance preserves stored yield without assigning pending protocol yield", () => {
    expect(
      calculateSavingsYield({
        balance: 0n,
        yieldIndex: 100n,
        supplyYieldIndex: 0n,
        storedClaimableYield: 7n,
      }),
    ).toEqual({
      storedClaimable: { unit: "MUSD", baseUnits: 7n },
      indexedUnclaimed: { unit: "MUSD", baseUnits: 0n },
      claimable: { unit: "MUSD", baseUnits: 7n },
    });
  });
});
function numeric(value: unknown): Record<string, bigint> {
  if (!value || typeof value !== "object") throw new Error("expected numeric fixture");
  return Object.fromEntries(
    Object.entries(value).map(([key, item]: [string, unknown]) => {
      if (typeof item !== "string" || !/^\d+$/.test(item))
        throw new Error("invalid fixture integer");
      return [key, BigInt(item)];
    }),
  );
}
function required(values: Record<string, bigint>, key: string): bigint {
  const value = values[key];
  if (value === undefined) throw new Error(`missing ${key}`);
  return value;
}
