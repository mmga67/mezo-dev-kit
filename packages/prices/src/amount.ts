import { isUint, parseUint } from "@mezo-dev-kit/evm";
import { PRICE_MODEL } from "./model.generated.ts";
export type PriceRounding = (typeof PRICE_MODEL.rounding)[number];
export type PriceSourceClass = (typeof PRICE_MODEL.sourceClasses)[number];
export type PriceErrorCode = "InvalidInput" | "UnsupportedSource" | "InconsistentCoordinate";
export class PriceError extends Error {
  readonly code: PriceErrorCode;
  constructor(code: PriceErrorCode, message: string) {
    super(message);
    this.name = "PriceError";
    this.code = code;
  }
}
export interface PriceAmountInput {
  readonly raw: bigint;
  readonly exponent: number;
  readonly targetDecimals: number;
  readonly rounding: PriceRounding;
  readonly zeroAllowed: boolean;
  readonly allowPrecisionLoss: boolean;
}
export type PriceAmountResult =
  | Readonly<{ status: "valid"; value: bigint; remainderDiscarded: boolean }>
  | Readonly<{ status: "negative" | "zero-invalid" }>
  | Readonly<{
      status: "failed";
      cause: "exponent-overflow" | "numeric-overflow" | "unsupported-precision-loss";
    }>;
/** Normalize an explicitly scaled nonnegative price, retaining division loss. */
export function normalizePriceAmount(input: PriceAmountInput): PriceAmountResult {
  if (
    typeof input.raw !== "bigint" ||
    !Number.isSafeInteger(input.exponent) ||
    !Number.isSafeInteger(input.targetDecimals) ||
    input.targetDecimals < 0 ||
    input.targetDecimals > PRICE_MODEL.maxPowerOfTenExponent ||
    !(PRICE_MODEL.rounding as readonly unknown[]).includes(input.rounding) ||
    typeof input.zeroAllowed !== "boolean" ||
    typeof input.allowPrecisionLoss !== "boolean"
  )
    throw new PriceError("InvalidInput", "invalid price normalization policy");
  if (input.raw < 0n) return Object.freeze({ status: "negative" });
  if (input.raw === 0n && !input.zeroAllowed) return Object.freeze({ status: "zero-invalid" });
  const power = input.exponent + input.targetDecimals;
  if (!Number.isSafeInteger(power) || Math.abs(power) > PRICE_MODEL.maxPowerOfTenExponent)
    return Object.freeze({ status: "failed", cause: "exponent-overflow" });
  if (!isUint(input.raw)) return Object.freeze({ status: "failed", cause: "numeric-overflow" });
  const factor = 10n ** BigInt(Math.abs(power));
  const remainder = power < 0 ? input.raw % factor : 0n;
  if (remainder !== 0n && !input.allowPrecisionLoss)
    return Object.freeze({ status: "failed", cause: "unsupported-precision-loss" });
  let value = power < 0 ? input.raw / factor : input.raw * factor;
  if (
    remainder !== 0n &&
    (input.rounding === "ceiling" ||
      (input.rounding === "nearest-ties-to-even" &&
        (remainder * 2n > factor || (remainder * 2n === factor && value % 2n !== 0n))))
  )
    value++;
  if (!isUint(value)) return Object.freeze({ status: "failed", cause: "numeric-overflow" });
  if (value === 0n && !input.zeroAllowed) return Object.freeze({ status: "zero-invalid" });
  return Object.freeze({ status: "valid", value, remainderDiscarded: remainder !== 0n });
}
export type PriceFreshness =
  | Readonly<{ status: "valid" | "stale"; ageSeconds: bigint }>
  | Readonly<{ status: "future-dated" | "missing-time"; ageSeconds: null }>;
/** Inclusive maximum age. A timestamp of zero is a timestamp; sources own missing-value conventions. */
export function evaluatePriceFreshness(input: {
  readonly publishedAt: bigint | null;
  readonly asOf: bigint;
  readonly maxAgeSeconds: bigint;
}): PriceFreshness {
  const asOf = parseUint(input.asOf),
    maximum = parseUint(input.maxAgeSeconds);
  if (input.publishedAt === null)
    return Object.freeze({ status: "missing-time", ageSeconds: null });
  const published = parseUint(input.publishedAt);
  if (published > asOf) return Object.freeze({ status: "future-dated", ageSeconds: null });
  const age = asOf - published;
  return Object.freeze({ status: age <= maximum ? "valid" : "stale", ageSeconds: age });
}
export type PriceConfidenceResult =
  | PriceAmountResult
  | Readonly<{ status: "unsupported"; value: null; limitation: "source-confidence-unavailable" }>;
/** Confidence is scaled with its paired exponent; it is never inferred as zero or a percentage. */
export function normalizePriceConfidence(
  input: Omit<PriceAmountInput, "raw" | "zeroAllowed"> & { readonly raw: bigint | null },
): PriceConfidenceResult {
  if (input.raw === null)
    return Object.freeze({
      status: "unsupported",
      value: null,
      limitation: "source-confidence-unavailable",
    });
  return normalizePriceAmount({ ...input, raw: input.raw, zeroAllowed: true });
}
