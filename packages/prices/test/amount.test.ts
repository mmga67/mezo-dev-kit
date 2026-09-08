import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  normalizePriceAmount,
  evaluatePriceFreshness,
  normalizePriceConfidence,
} from "../src/index.ts";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid fixture");
  return value as Record<string, unknown>;
}
const fixtures = object(
  JSON.parse(
    await readFile(
      new URL("../../../knowledge/prices/fixtures/prices.json", import.meta.url),
      "utf8",
    ),
  ),
).records;
if (!Array.isArray(fixtures)) throw new Error("missing fixtures");
for (const raw of fixtures) {
  const fixture = object(raw);
  if (fixture.operation !== "scale" && fixture.operation !== "freshness") continue;
  const input = object(fixture.input),
    expected = object(fixture.expected);
  test(String(fixture.id), () => {
    if (fixture.operation === "scale") {
      if (
        typeof input.raw !== "string" ||
        typeof input.expo !== "number" ||
        typeof input.targetDecimals !== "number" ||
        typeof input.zeroAllowed !== "boolean"
      )
        throw new Error("invalid scale fixture");
      const result = normalizePriceAmount({
        raw: BigInt(input.raw),
        exponent: input.expo,
        targetDecimals: input.targetDecimals,
        zeroAllowed: input.zeroAllowed,
        rounding: "toward-zero",
        allowPrecisionLoss: true,
      });
      expect(result.status).toBe(expected.status);
      if (result.status === "valid") {
        expect(result.value.toString()).toBe(expected.value);
        expect(result.remainderDiscarded).toBe(expected.remainderDiscarded);
      }
      if (result.status === "failed") expect(result.cause).toBe(expected.cause);
    } else {
      if (
        typeof input.publishTime !== "string" ||
        typeof input.asOf !== "string" ||
        typeof input.maxAgeSeconds !== "string"
      )
        throw new Error("invalid freshness fixture");
      const result = evaluatePriceFreshness({
        publishedAt: BigInt(input.publishTime),
        asOf: BigInt(input.asOf),
        maxAgeSeconds: BigInt(input.maxAgeSeconds),
      });
      expect(result.status).toBe(expected.status);
      expect(result.ageSeconds === null ? null : result.ageSeconds.toString()).toBe(
        expected.ageSeconds,
      );
    }
  });
}
const policy = {
  exponent: -1,
  targetDecimals: 0,
  rounding: "nearest-ties-to-even",
  zeroAllowed: false,
  allowPrecisionLoss: true,
} as const;
test.for([
  { raw: 15n, value: 2n },
  { raw: 25n, value: 2n },
  { raw: 26n, value: 3n },
])("ties-to-even for $raw", ({ raw, value }) => {
  expect(normalizePriceAmount({ ...policy, raw })).toEqual({
    status: "valid",
    value,
    remainderDiscarded: true,
  });
});
test("invalid, zero, lost precision and overflowing datums remain explicit", () => {
  expect(normalizePriceAmount({ ...policy, raw: -1n }).status).toBe("negative");
  expect(normalizePriceAmount({ ...policy, rounding: "floor", raw: 1n }).status).toBe(
    "zero-invalid",
  );
  expect(normalizePriceAmount({ ...policy, raw: 11n, allowPrecisionLoss: false })).toEqual({
    status: "failed",
    cause: "unsupported-precision-loss",
  });
  expect(normalizePriceAmount({ ...policy, raw: 1n << 255n, exponent: 1 })).toEqual({
    status: "failed",
    cause: "numeric-overflow",
  });
  expect(() => normalizePriceAmount({ ...policy, raw: 1n, targetDecimals: -1 })).toThrow();
});
test("unsupported confidence and missing publication are not fabricated zeros", () => {
  expect(normalizePriceConfidence({ ...policy, raw: null })).toEqual({
    status: "unsupported",
    value: null,
    limitation: "source-confidence-unavailable",
  });
  expect(normalizePriceConfidence({ ...policy, raw: 25n })).toMatchObject({
    status: "valid",
    value: 2n,
  });
  expect(evaluatePriceFreshness({ publishedAt: null, asOf: 10n, maxAgeSeconds: 0n })).toEqual({
    status: "missing-time",
    ageSeconds: null,
  });
  expect(evaluatePriceFreshness({ publishedAt: 10n, asOf: 10n, maxAgeSeconds: 0n })).toEqual({
    status: "valid",
    ageSeconds: 0n,
  });
});
