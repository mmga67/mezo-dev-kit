import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  allocateVotingPower,
  calculateBoostFactor,
  calculateLockEnd,
  calculateLockVotingPower,
  calculateVotingEpoch,
} from "../src/math.ts";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid canonical fixture");
  return value as Record<string, unknown>;
}
const directory = new URL("../../../../knowledge/protocols/incentives/", import.meta.url),
  index = object(JSON.parse(readFileSync(new URL("index.json", directory), "utf8")));
if (!Array.isArray(index.resources)) throw new Error("missing module resources");
const resource = object(
  index.resources.find((entry: unknown) => object(entry).id === "incentives-formula-fixtures"),
);
if (typeof resource.path !== "string") throw new Error("missing canonical fixture path");
const document = object(JSON.parse(readFileSync(new URL(resource.path, directory), "utf8")));
if (!Array.isArray(document.records)) throw new Error("missing fixture records");
for (const raw of document.records as unknown[]) {
  const row = object(raw),
    values = object(row.inputs),
    number = (key: string) => {
      const value = values[key];
      if (typeof value !== "string") throw new Error("missing fixture quantity");
      return BigInt(value);
    };
  if (row.formulaId === "rounded-unlock-time")
    test(String(row.id), () => {
      const action = () =>
        calculateLockEnd({
          timestamp: number("timestamp"),
          duration: number("requestedDuration"),
          maxLockSeconds: 2419200n,
        });
      if (row.expectedValidity === false) expect(action).toThrow();
      else expect(action().toString()).toBe(row.expected);
    });
  if (
    row.formulaId === "unboosted-timed-voting-power" ||
    row.formulaId === "boosted-timed-voting-power"
  )
    test(String(row.id), () => {
      const result = calculateLockVotingPower({
        amount: number("amount"),
        boost: values.boost === undefined ? 0n : number("boost"),
        end: number("lockEnd"),
        permanent: false,
        maxLockSeconds: number("maxLockSeconds"),
        timestamp: number("at"),
      });
      expect(
        (row.formulaId === "boosted-timed-voting-power"
          ? result.boosted
          : result.unboosted
        ).toString(),
      ).toBe(row.expected);
    });
  if (row.formulaId === "vebtc-boost-factor")
    test(String(row.id), () => {
      expect(
        calculateBoostFactor({
          gaugeWeight: number("gaugeWeight"),
          votingVeTotalWeight: number("votingVeTotalWeight"),
          boostableVeTotalWeight: number("boostableVeTotalWeight"),
          boostableVeWeight: number("boostableVeWeight"),
        }).toString(),
      ).toBe(row.expected);
    });
  if (row.formulaId === "epoch-boundaries")
    test(String(row.id), () => {
      expect(
        Object.fromEntries(
          Object.entries(calculateVotingEpoch(number("timestamp"))).map(([key, value]) => [
            key,
            value.toString(),
          ]),
        ),
      ).toEqual(row.expected);
    });
  if (row.formulaId === "proportional-vote-allocation")
    test(String(row.id), () => {
      if (!Array.isArray(values.relativeWeights)) throw new Error("missing weights");
      const result = allocateVotingPower({
        votingPower: number("votingPower"),
        relativeWeights: (values.relativeWeights as unknown[]).map((value) => {
          if (typeof value !== "string") throw new Error("invalid weight");
          return BigInt(value);
        }),
      });
      expect({
        allocations: result.allocations.map(String),
        usedWeight: String(result.usedWeight),
        unallocatedFloorDust: String(result.unallocatedFloorDust),
      }).toEqual(row.expected);
    });
}
test("power divides before multiplication and validates signed checkpoint limits", () => {
  expect(
    calculateLockVotingPower({
      amount: 10n,
      boost: 0n,
      end: 2n,
      permanent: false,
      maxLockSeconds: 3n,
      timestamp: 0n,
    }).unboosted,
  ).toBe(6n);
  expect(
    calculateLockVotingPower({
      amount: 10n,
      boost: 2n * 10n ** 18n,
      end: 0n,
      permanent: true,
      maxLockSeconds: 3n,
      timestamp: 1n,
    }).boosted,
  ).toBe(20n);
  expect(() =>
    calculateLockVotingPower({
      amount: 1n << 127n,
      boost: 0n,
      end: 0n,
      permanent: true,
      maxLockSeconds: 1n,
      timestamp: 0n,
    }),
  ).toThrow();
  expect(() =>
    calculateLockEnd({ timestamp: (1n << 256n) - 1n, duration: 1n, maxLockSeconds: 604800n }),
  ).toThrow();
});
test("dust that zeroes a target is ineligible; budgets and arithmetic remain bounded", () => {
  expect(() => allocateVotingPower({ votingPower: 1n, relativeWeights: [1n, 1n] })).toThrow(
    "nonzero",
  );
  expect(() => allocateVotingPower({ votingPower: 100n, relativeWeights: [] })).toThrow();
  expect(() => allocateVotingPower({ votingPower: 1n, relativeWeights: [0n] })).toThrow();
  expect(() =>
    calculateBoostFactor({
      gaugeWeight: (1n << 256n) - 1n,
      votingVeTotalWeight: 1n,
      boostableVeTotalWeight: 1n,
      boostableVeWeight: 1n,
    }),
  ).toThrow();
});
